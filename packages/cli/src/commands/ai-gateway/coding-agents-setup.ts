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
import {
  isValidExpiry,
  presetToExpiresAt,
  VALID_EXPIRY_VALUES,
} from '../../util/ai-gateway/expiry';
import { resolveAgents } from '../../util/ai-gateway/coding-agents/resolve';
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
  printNotes,
  printKey,
  printKeyRow,
  printReceiptPath,
  printStatus,
  printWarning,
} from '../../util/ai-gateway/coding-agents/render';
import { runMachine } from '../../util/ai-gateway/coding-agents/machine';
import { KEY_PLACEHOLDER } from '../../util/ai-gateway/coding-agents/gateway';
import {
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_STATUS, AGENT_REASON } from '../../util/agent-output-constants';
import { setupSubcommand } from './command';
import { AiGatewayCodingAgentsSetupTelemetryClient } from '../../util/telemetry/commands/ai-gateway/coding-agents-setup';

export default async function codingAgentsSetup(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new AiGatewayCodingAgentsSetupTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(setupSubcommand.options);
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
  const reconfigure = opts['--reconfigure'] as boolean | undefined;
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliOptionAgent(agentFlags as [string] | undefined);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionKey(providedKey);
  telemetry.trackCliOptionBudget(budget);
  telemetry.trackCliOptionRefreshPeriod(refreshPeriod);
  telemetry.trackCliFlagIncludeByok(includeByok);
  telemetry.trackCliOptionExpiration(expiration);
  telemetry.trackCliOptionName(name);
  telemetry.trackCliFlagReconfigure(reconfigure);
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
    printWarning(note);
  }

  // With no --key we create one. Resolve the owning team first — it decides
  // where the key lives (and can fail) — then collect name, quota, and expiry.
  const willCreate = !providedKey;
  let keyName = name;
  let keyBudget = budget;
  let keyRefresh = refreshPeriod;
  let keyExpiresAt = flagExpiresAt;
  if (willCreate) {
    const promptCreate = canPrompt && !yes;

    const teamError = await ensureTeam(client, {
      machine,
      canPrompt,
      yes: Boolean(yes),
    });
    if (teamError) {
      return teamError;
    }

    if (promptCreate && keyName === undefined) {
      keyName = await promptKeyName(client);
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

  const previewKey = providedKey ?? KEY_PLACEHOLDER;
  const previewPlan = await buildSetupPlan(selected, {
    apiKey: previewKey,
    home,
  });
  const changed = previewPlan.changes.filter(
    c => c.status === 'create' || c.status === 'update'
  );
  const errored = previewPlan.changes.filter(c => c.status === 'error');
  const alreadyConfigured = changed.length === 0 && errored.length === 0;

  const mintKey = () =>
    createKey(client, {
      name: keyName,
      budget: keyBudget,
      refreshPeriod: keyRefresh,
      includeByok,
      expiresAt: keyExpiresAt,
    });

  if (machine) {
    return runMachine({
      client,
      selected,
      unsupported,
      keySource: providedKey ? { key: providedKey, created: false } : null,
      createKey: mintKey,
      backup: true,
      home,
      alreadyConfigured,
      reconfigure: Boolean(reconfigure),
    });
  }

  // Already wired up: instead of a dead-end no-op, offer to rotate the key or
  // reconfigure (e.g. a rotated/expired key, or a different team).
  // `--reconfigure` skips the prompt.
  if (alreadyConfigured) {
    let doReconfigure = Boolean(reconfigure);
    if (!doReconfigure && canPrompt && !yes) {
      doReconfigure = await client.input.confirm(
        'These agents are already configured for the AI Gateway. Reconfigure them?',
        false
      );
    }
    if (!doReconfigure) {
      printStatus(
        'All selected agents are already configured for the AI Gateway.'
      );
      if (providedKey) {
        printKey(providedKey);
      }
      return 0;
    }
  }

  let keySource: KeySource;
  try {
    keySource = providedKey
      ? { key: providedKey, created: false }
      : { key: await mintKey(), created: true };
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const plan = await buildSetupPlan(selected, { apiKey: keySource.key, home });
  const results = await applyPlan(plan, { backup: true });

  if (results.length === 0 && keySource.created) {
    // Rotated with a fresh key but nothing in the config files changed (e.g. the
    // key is resolved from the environment rather than embedded).
    output.print('\n');
    printAlignedLabel('Rotated', 'AI Gateway API key', { gutter: '✓' });
    printKeyRow(keySource.key);
    output.print(chalk.dim('  No config files changed.\n'));
  }
  if (results.length > 0) {
    // One ✓ for the completed phase; everything else is a secondary
    // receipt row behind the blank gutter.
    const failed = new Set(errored.flatMap(c => c.owners));
    const connected = selected
      .map(a => a.displayName)
      .filter(name => !failed.has(name));
    output.print('\n');
    printAlignedLabel('Connected', connected.join(', '), { gutter: '✓' });
    for (const result of results) {
      printReceiptPath(
        result.action === 'created' ? 'Created' : 'Updated',
        result.path
      );
    }
    printKeyRow(keySource.key);
    if (results.some(r => r.backupPath)) {
      output.print(chalk.dim('  Previous files saved alongside as .bak\n'));
    }
  }
  for (const change of errored) {
    printWarning(
      `Skipped ${change.label} (${change.path}): ${change.error}. Fix or remove the file, then re-run.`
    );
  }

  printNotes(plan);
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
