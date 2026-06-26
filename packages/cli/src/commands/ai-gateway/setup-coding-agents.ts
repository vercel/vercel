import { homedir } from 'node:os';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName } from '../../util/pkg-name';
import createApiKeyRequest from '../../util/ai-gateway/create-api-key';
import selectOrg from '../../util/input/select-org';
import {
  buildQuota,
  isValidRefreshPeriod,
  VALID_REFRESH_PERIODS,
} from '../../util/ai-gateway/quota';
import {
  DEFAULT_AGENTS,
  getAgentById,
  UNSUPPORTED_AGENTS,
} from '../../util/ai-gateway/coding-agents/agents';
import type { CodingAgent } from '../../util/ai-gateway/coding-agents/types';
import {
  buildSetupPlan,
  applyPlan,
  type SetupPlan,
} from '../../util/ai-gateway/coding-agents/apply';
import { renderDiff } from '../../util/ai-gateway/coding-agents/diff';
import {
  DEFAULT_MODEL,
  KEY_PLACEHOLDER,
} from '../../util/ai-gateway/coding-agents/gateway';
import {
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { setupCodingAgentsSubcommand } from './command';
import { AiGatewaySetupCodingAgentsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/setup-coding-agents';

interface KeySource {
  key: string;
  created: boolean;
}

export default async function setupCodingAgents(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewaySetupCodingAgentsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    setupCodingAgentsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts } = parsedArgs;

  const agentFlags = opts['--agent'] as string[] | undefined;
  const all = opts['--all'] as boolean | undefined;
  const providedKey = opts['--key'] as string | undefined;
  const budget = opts['--budget'] as number | undefined;
  const refreshPeriod = opts['--refresh-period'] as string | undefined;
  const includeByok = opts['--include-byok'] as boolean | undefined;
  const name = opts['--name'] as string | undefined;
  const model = (opts['--model'] as string | undefined) || DEFAULT_MODEL;
  const dryRun = opts['--dry-run'] as boolean | undefined;
  const noBackup = opts['--no-backup'] as boolean | undefined;
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliOptionAgent(agentFlags as [string] | undefined);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionKey(providedKey);
  telemetry.trackCliOptionBudget(budget);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionName(name);
  telemetry.trackCliOptionModel(opts['--model'] as string | undefined);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagNoBackup(noBackup);
  telemetry.trackCliFlagYes(yes);

  const machine = shouldEmitNonInteractiveCommandError(client);
  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();

  // Validate quota flags up front (before any remote work).
  if (budget !== undefined && (!Number.isFinite(budget) || budget < 1)) {
    return failValidation(
      client,
      machine,
      AGENT_REASON.INVALID_BUDGET,
      'Budget must be a positive number in dollars (minimum 1).'
    );
  }
  if (refreshPeriod && !isValidRefreshPeriod(refreshPeriod)) {
    return failValidation(
      client,
      machine,
      AGENT_REASON.INVALID_REFRESH_PERIOD,
      `Invalid refresh period "${refreshPeriod}". Must be one of: ${VALID_REFRESH_PERIODS.join(', ')}.`
    );
  }

  // 1. Resolve which agents to configure.
  const selection = await resolveAgents({
    client,
    agentFlags,
    all,
    canPrompt,
    home,
  });
  if ('error' in selection) {
    if (machine) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: selection.reason,
        message: selection.error,
      });
    }
    output.error(selection.error);
    return 1;
  }
  const { selected, guidance, unsupported } = selection;
  for (const note of guidance) {
    output.warn(note);
  }

  // 2. Decide the key source. Defer creation until after confirmation so we
  //    never mint an orphan key; preview diffs with a masked placeholder.
  const willCreate = !providedKey;
  if (willCreate && !dryRun) {
    const teamError = await ensureTeam(client, machine, canPrompt);
    if (teamError) {
      return teamError;
    }
  }
  const previewKey = providedKey ?? KEY_PLACEHOLDER;

  // 3. Build the preview plan.
  const previewPlan = await buildSetupPlan(selected, {
    apiKey: previewKey,
    model,
    home,
  });

  const changed = previewPlan.changes.filter(
    c => c.status === 'create' || c.status === 'update'
  );
  const errored = previewPlan.changes.filter(c => c.status === 'error');

  // Machine mode: no prompts, no diffs — emit a structured plan/result.
  if (machine) {
    return runMachine({
      client,
      selected,
      unsupported,
      previewPlan,
      dryRun: Boolean(dryRun),
      backup: !noBackup,
      keySource: providedKey ? { key: providedKey, created: false } : null,
      createKey: () =>
        createKey(client, { name, budget, refreshPeriod, includeByok }),
      model,
      home,
    });
  }

  // Interactive / human mode.
  printResolvedState({ selected, model, willCreate, budget, refreshPeriod });

  if (changed.length === 0 && errored.length === 0) {
    output.log(
      'All selected agents are already configured for the AI Gateway.'
    );
    if (providedKey) {
      printKey(client, providedKey);
    }
    return 0;
  }

  printPlan(previewPlan, previewKey);

  if (dryRun) {
    output.log(
      `Dry run — no files written. Re-run without ${chalk.bold('--dry-run')} to apply.`
    );
    return 0;
  }

  if (changed.length > 0 && canPrompt && !yes) {
    const confirmed = await client.input.confirm('Apply these changes?', true);
    if (!confirmed) {
      output.log('Aborted. No files were changed.');
      return 0;
    }
  }

  // 4. Mint the key now (if needed), then rebuild the plan with the real key.
  let keySource: KeySource;
  try {
    keySource = providedKey
      ? { key: providedKey, created: false }
      : {
          key: await createKey(client, {
            name,
            budget,
            refreshPeriod,
            includeByok,
          }),
          created: true,
        };
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const applyPlanResult = providedKey
    ? previewPlan
    : await buildSetupPlan(selected, { apiKey: keySource.key, model, home });

  // 5. Write.
  const results = await applyPlan(applyPlanResult, { backup: !noBackup });

  // 6. Report.
  output.print('\n');
  for (const result of results) {
    printAlignedLabel(
      result.action === 'created' ? 'Created' : 'Updated',
      result.path,
      { gutter: '✓' }
    );
  }
  for (const change of errored) {
    output.warn(
      `Skipped ${change.label} (${change.path}): ${change.error}. Fix or remove the file, then re-run.`
    );
  }
  if (results.some(r => r.backupPath)) {
    output.log(chalk.dim('Previous files saved alongside as .bak'));
  }

  printNotes(applyPlanResult);
  printKey(client, keySource.key);
  return 0;
}

/** Emits a structured error in machine mode and a stderr error always. */
function failValidation(
  client: Client,
  machine: boolean,
  reason: string,
  message: string
): number {
  if (machine) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason,
      message,
    });
  }
  output.error(message);
  return 1;
}

type ResolveResult =
  | { selected: CodingAgent[]; guidance: string[]; unsupported: string[] }
  | { error: string; reason: string };

async function resolveAgents(args: {
  client: Client;
  agentFlags?: string[];
  all?: boolean;
  canPrompt: boolean;
  home: string;
}): Promise<ResolveResult> {
  const { client, agentFlags, all, canPrompt, home } = args;
  const guidance: string[] = [];
  const unsupported: string[] = [];

  if (agentFlags && agentFlags.length > 0) {
    const selected: CodingAgent[] = [];
    const unknown: string[] = [];
    for (const raw of agentFlags) {
      const id = raw.toLowerCase();
      const agent = getAgentById(id);
      if (agent) {
        if (!selected.includes(agent)) selected.push(agent);
      } else if (UNSUPPORTED_AGENTS[id]) {
        unsupported.push(id);
        guidance.push(`${id}: ${UNSUPPORTED_AGENTS[id]}`);
      } else {
        unknown.push(raw);
      }
    }
    if (unknown.length > 0) {
      const known = DEFAULT_AGENTS.map(a => a.id).join(', ');
      return {
        error: `Unknown agent(s): ${unknown.join(', ')}. Supported: ${known}.`,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      };
    }
    if (selected.length === 0) {
      return {
        error: 'No configurable agents selected.',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      };
    }
    return { selected, guidance, unsupported };
  }

  if (all) {
    return { selected: DEFAULT_AGENTS, guidance, unsupported };
  }

  // No explicit selection: prompt when possible, else configure all supported.
  if (!canPrompt) {
    return { selected: DEFAULT_AGENTS, guidance, unsupported };
  }

  const detected = await Promise.all(DEFAULT_AGENTS.map(a => a.detect(home)));
  const choices = DEFAULT_AGENTS.map((agent, i) => ({
    name: agent.displayName,
    value: agent.id,
    checked: detected[i],
  }));
  const picked = await client.input.checkbox<string>({
    message: 'Which coding agents should use the AI Gateway?',
    choices,
  });
  const selected = picked
    .map(id => getAgentById(id))
    .filter((a): a is CodingAgent => Boolean(a));
  if (selected.length === 0) {
    return {
      error: 'Select at least one agent to configure.',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    };
  }
  return { selected, guidance, unsupported };
}

/** Ensures a team is selected for key creation, prompting or erroring. */
async function ensureTeam(
  client: Client,
  machine: boolean,
  canPrompt: boolean
): Promise<number | undefined> {
  if (client.config.currentTeam) {
    return undefined;
  }
  if (!canPrompt) {
    const message =
      'No team selected. Pass --scope <team-slug> or run `vercel switch` first.';
    if (machine) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.MISSING_SCOPE,
        message,
        next: [
          {
            command: getCommandName(
              'ai-gateway setup-coding-agents --scope <team-slug>'
            ),
          },
        ],
      });
    }
    output.error(message);
    return 1;
  }
  const org = await selectOrg(client, 'Which team should own this API key?');
  if (org.type === 'team') {
    client.config.currentTeam = org.id;
  }
  return undefined;
}

async function createKey(
  client: Client,
  opts: {
    name?: string;
    budget?: number;
    refreshPeriod?: string;
    includeByok?: boolean;
  }
): Promise<string> {
  output.spinner('Creating AI Gateway API key');
  try {
    const result = await createApiKeyRequest(client, {
      name: opts.name,
      aiGatewayQuota: buildQuota({
        budget: opts.budget,
        refreshPeriod: opts.refreshPeriod,
        includeByok: opts.includeByok,
      }),
    });
    return result.apiKeyString;
  } finally {
    output.stopSpinner();
  }
}

function printResolvedState(args: {
  selected: CodingAgent[];
  model: string;
  willCreate: boolean;
  budget?: number;
  refreshPeriod?: string;
}): void {
  const { selected, model, willCreate, budget, refreshPeriod } = args;
  output.print('\n');
  printAlignedLabel('Agents', selected.map(a => a.displayName).join(', '));
  printAlignedLabel('Model', model);
  let keyState = 'Using provided key';
  if (willCreate) {
    const parts: string[] = [];
    if (budget !== undefined) parts.push(`$${budget}`);
    if (refreshPeriod && refreshPeriod !== 'none') parts.push(refreshPeriod);
    keyState = parts.length
      ? `Creating new key (${parts.join(', ')})`
      : 'Creating new key';
  }
  printAlignedLabel('API key', keyState);
  output.print('\n');
}

function printPlan(plan: SetupPlan, previewKey: string): void {
  output.print(chalk.bold('Planned changes\n'));
  for (const change of plan.changes) {
    if (change.status === 'unchanged') {
      output.print(
        `${chalk.dim('=')} ${chalk.dim(`${change.label} (unchanged)`)}  ${chalk.dim(change.path)}\n`
      );
      continue;
    }
    if (change.status === 'error') {
      output.print(
        `${chalk.red('!')} ${chalk.bold(change.label)}  ${chalk.dim(change.path)}\n`
      );
      output.print(chalk.red(`    cannot edit: ${change.error}\n`));
      continue;
    }
    const verb = change.status === 'create' ? 'create' : 'update';
    output.print(
      `${chalk.cyan(verb === 'create' ? '+' : '~')} ${chalk.bold(change.label)} (${verb})  ${chalk.dim(change.path)}\n`
    );
    const diff = renderDiff(change.current ?? '', change.next ?? '', {
      secrets: [previewKey],
    });
    if (diff) {
      output.print(`${diff}\n`);
    }
  }
  output.print('\n');
}

function printNotes(plan: SetupPlan): void {
  if (plan.notes.length === 0) {
    return;
  }
  output.print('\n');
  for (const note of plan.notes) {
    for (const line of note.notes) {
      output.log(`${note.displayName}: ${line}`);
    }
  }
}

function printKey(client: Client, key: string): void {
  output.print('\n');
  output.log(
    chalk.dim(
      'AI Gateway API key (also written to the configs above) — keep it secret:'
    )
  );
  // Raw key on stdout so it can be captured/piped.
  client.stdout.write(`${key}\n`);
}

async function runMachine(args: {
  client: Client;
  selected: CodingAgent[];
  unsupported: string[];
  previewPlan: SetupPlan;
  dryRun: boolean;
  backup: boolean;
  keySource: KeySource | null;
  createKey: () => Promise<string>;
  model: string;
  home: string;
}): Promise<number> {
  const { client, selected, previewPlan, dryRun, backup, model, home } = args;

  const errored = previewPlan.changes.filter(c => c.status === 'error');
  const skipped: Array<{ target: string; reason: string; message?: string }> =
    errored.map(c => ({
      target: c.path,
      reason: 'unparseable_config',
      message: c.error,
    }));
  for (const id of args.unsupported) {
    skipped.push({
      target: id,
      reason: 'not_automatable',
      message: UNSUPPORTED_AGENTS[id],
    });
  }

  if (dryRun) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          reason: 'dry_run',
          message:
            'Previewing AI Gateway coding-agent setup. No files written.',
          changes: previewPlan.changes.map(c => ({
            agent: c.owners.join(', '),
            file: c.path,
            action:
              c.status === 'create'
                ? 'would_create'
                : c.status === 'update'
                  ? 'would_update'
                  : c.status,
          })),
          skipped,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  // Mint key (if needed), then write with the real value.
  let key: string;
  try {
    key = args.keySource ? args.keySource.key : await args.createKey();
  } catch (err) {
    if (isAPIError(err)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: err.status === 403 ? 'forbidden' : AGENT_REASON.API_ERROR,
        message: err.message,
      });
    }
    throw err;
  }

  const finalPlan = args.keySource
    ? previewPlan
    : await buildSetupPlan(selected, { apiKey: key, model, home });
  const results = await applyPlan(finalPlan, { backup });

  client.stdout.write(
    `${JSON.stringify(
      {
        status: AGENT_STATUS.OK,
        reason: 'coding_agents_configured',
        message: `Configured ${results.length} file(s) across ${selected.length} agent(s) to use the AI Gateway.`,
        apiKey: key,
        configured: results.map(r => ({
          agent: r.owners.join(', '),
          file: r.path,
          action: r.action,
          backup: r.backupPath,
        })),
        skipped,
        notes: finalPlan.notes.flatMap(n =>
          n.notes.map(line => `${n.displayName}: ${line}`)
        ),
      },
      null,
      2
    )}\n`
  );
  return 0;
}
