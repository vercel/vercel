import { homedir } from 'node:os';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  isValidRefreshPeriod,
  VALID_REFRESH_PERIODS,
} from '../../util/ai-gateway/quota';
import { resolveAgents } from '../../util/ai-gateway/coding-agents/resolve';
import {
  ensureTeam,
  createKey,
  type KeySource,
} from '../../util/ai-gateway/coding-agents/key-source';
import {
  buildSetupPlan,
  applyPlan,
} from '../../util/ai-gateway/coding-agents/apply';
import {
  printResolvedState,
  printPlan,
  printNotes,
  printKey,
} from '../../util/ai-gateway/coding-agents/render';
import { runMachine } from '../../util/ai-gateway/coding-agents/machine';
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

  // Announce a dry run up front so the prompts that follow (agent selection,
  // team) are understood as a preview — nothing is created or written. Machine
  // mode conveys this in its JSON payload instead.
  if (dryRun && !machine) {
    output.log(
      `${chalk.bold('Dry run')} — previewing changes only. No files will be written and no API key will be created.`
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
  //    Resolve the team up front (including dry runs) so the previewed flow
  //    matches a real apply — but only prompt when we actually can. A
  //    non-interactive dry run is a pure preview and must not require a scope.
  const willCreate = !providedKey;
  if (willCreate && (!dryRun || canPrompt)) {
    const teamError = await ensureTeam(client, {
      machine,
      canPrompt,
      yes: Boolean(yes),
    });
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
