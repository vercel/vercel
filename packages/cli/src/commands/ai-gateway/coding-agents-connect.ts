import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
import {
  isValidExpiry,
  presetToExpiresAt,
  VALID_EXPIRY_VALUES,
} from '../../util/ai-gateway/expiry';
import { resolveAgents } from '../../util/ai-gateway/coding-agents/resolve';
import { getAgentById } from '../../util/ai-gateway/coding-agents/agents';
import {
  ensureTeam,
  createKey,
  promptKeyName,
  promptQuota,
  promptExpiry,
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
import { KEY_PLACEHOLDER } from '../../util/ai-gateway/coding-agents/gateway';
import {
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { connectSubcommand } from './command';
import { AiGatewayCodingAgentsConnectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/coding-agents-connect';

export default async function codingAgentsConnect(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayCodingAgentsConnectTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(connectSubcommand.options);
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
  const expiration = opts['--expiration'] as string | undefined;
  const name = opts['--name'] as string | undefined;
  const dryRun = opts['--dry-run'] as boolean | undefined;
  const noBackup = opts['--no-backup'] as boolean | undefined;
  const agentConfig = opts['--agent-config'] as string[] | undefined;
  const shellRcOverride = opts['--shell-rc'] as string | undefined;
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliOptionAgent(agentFlags as [string] | undefined);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionKey(providedKey);
  telemetry.trackCliOptionBudget(budget);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionExpiration(expiration);
  telemetry.trackCliOptionName(name);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagNoBackup(noBackup);
  telemetry.trackCliOptionAgentConfig(agentConfig);
  telemetry.trackCliOptionShellRc(shellRcOverride);
  telemetry.trackCliFlagYes(yes);

  const machine = shouldEmitNonInteractiveCommandError(client);
  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();

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
  if (expiration && !isValidExpiry(expiration)) {
    return failValidation(
      client,
      machine,
      AGENT_REASON.INVALID_EXPIRATION,
      `Invalid expiration "${expiration}". Must be one of: ${VALID_EXPIRY_VALUES.join(', ')}.`
    );
  }
  const flagExpiresAt =
    expiration && expiration !== 'none'
      ? presetToExpiresAt(expiration)
      : undefined;

  // Parse `--agent-config <id>=<path>` overrides up front. Validate the format
  // and that each id is a known agent; the "must be selected" check happens
  // after agent resolution.
  const overrides: Record<string, string> = {};
  for (const pair of agentConfig ?? []) {
    const eq = pair.indexOf('=');
    const id = eq > 0 ? pair.slice(0, eq).trim().toLowerCase() : '';
    const path = eq > 0 ? pair.slice(eq + 1).trim() : '';
    if (!id || !path) {
      return failValidation(
        client,
        machine,
        AGENT_REASON.INVALID_ARGUMENTS,
        `Invalid --agent-config "${pair}". Use <agent>=<path>, e.g. claude-code=/path/settings.json.`
      );
    }
    if (!getAgentById(id)) {
      return failValidation(
        client,
        machine,
        AGENT_REASON.INVALID_ARGUMENTS,
        `Unknown agent "${id}" in --agent-config.`
      );
    }
    overrides[id] = resolve(path);
  }

  if (dryRun && !machine) {
    output.log(
      `${chalk.bold('Dry run')} — previewing changes only. No files will be written and no API key will be created.`
    );
  }

  const selection = await resolveAgents({
    client,
    agentFlags,
    all,
    canPrompt,
    yes: Boolean(yes),
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

  // A path override only makes sense for an agent we're actually configuring.
  for (const id of Object.keys(overrides)) {
    if (!selected.some(a => a.id === id)) {
      return failValidation(
        client,
        machine,
        AGENT_REASON.INVALID_ARGUMENTS,
        `--agent-config set for "${id}", which isn't selected. Add --agent ${id} (or --all).`
      );
    }
  }

  const willCreate = !providedKey;
  let keyName = name;
  let keyBudget = budget;
  let keyRefresh = refreshPeriod;
  let keyExpiresAt = flagExpiresAt;
  if (willCreate && (!dryRun || canPrompt)) {
    const promptCreate = canPrompt && !yes;

    if (promptCreate && keyName === undefined) {
      keyName = await promptKeyName(client);
    }

    const teamError = await ensureTeam(client, {
      machine,
      canPrompt,
      yes: Boolean(yes),
    });
    if (teamError) {
      return teamError;
    }

    if (promptCreate) {
      if (keyBudget === undefined && keyRefresh === undefined) {
        const quota = await promptQuota(client);
        keyBudget = quota.budget;
        keyRefresh = quota.refreshPeriod;
      }
      if (keyExpiresAt === undefined && !expiration) {
        keyExpiresAt = await promptExpiry(client);
      }
    }
  }
  // If a selected agent isn't at its default/native location, offer custom
  // paths (opt-in, so normal setups aren't interrupted). Flags pin paths in
  // either mode; this just surfaces the option interactively.
  if (canPrompt && !yes) {
    const missing = selected.filter(
      a =>
        !overrides[a.id] &&
        !existsSync(dirname(a.configPath({ apiKey: '', home })))
    );
    if (missing.length > 0) {
      const customize = await client.input.confirm(
        "Some agents weren't found at their default location. Set custom config paths?",
        false
      );
      if (customize) {
        for (const agent of missing) {
          const resolved = agent.configPath({
            apiKey: '',
            home,
          });
          const answer = await client.input.text({
            message: `${agent.displayName} config path`,
            default: resolved,
          });
          const picked = answer.trim();
          if (picked && resolve(picked) !== resolved) {
            overrides[agent.id] = resolve(picked);
          }
        }
      }
    }
  }
  const previewKey = providedKey ?? KEY_PLACEHOLDER;

  const previewPlan = await buildSetupPlan(selected, {
    apiKey: previewKey,
    home,
    overrides,
    shellRcOverride,
  });

  const changed = previewPlan.changes.filter(
    c => c.status === 'create' || c.status === 'update'
  );
  const errored = previewPlan.changes.filter(c => c.status === 'error');

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
        createKey(client, {
          name: keyName,
          budget: keyBudget,
          refreshPeriod: keyRefresh,
          includeByok,
          expiresAt: keyExpiresAt,
        }),
      overrides,
      shellRcOverride,
      home,
    });
  }

  if (changed.length === 0 && errored.length === 0) {
    output.log(
      'All selected agents are already configured for the AI Gateway.'
    );
    if (providedKey) {
      printKey(providedKey);
    }
    return 0;
  }

  printPlan(previewPlan, previewKey);
  printResolvedState({
    selected,
    willCreate,
    name: keyName,
    budget: keyBudget,
    refreshPeriod: keyRefresh,
    expiresAt: keyExpiresAt,
  });

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

  let keySource: KeySource;
  try {
    keySource = providedKey
      ? { key: providedKey, created: false }
      : {
          key: await createKey(client, {
            name: keyName,
            budget: keyBudget,
            refreshPeriod: keyRefresh,
            includeByok,
            expiresAt: keyExpiresAt,
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

  const applyPlanResult = await buildSetupPlan(selected, {
    apiKey: keySource.key,
    home,
    overrides,
    shellRcOverride,
  });

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
  printKey(keySource.key);
  return 0;
}

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
