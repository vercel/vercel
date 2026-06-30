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
  promptKeychain,
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
  printKeyRow,
  printReceiptPath,
  printStatus,
  printWarning,
} from '../../util/ai-gateway/coding-agents/render';
import { runMachine } from '../../util/ai-gateway/coding-agents/machine';
import { KEY_PLACEHOLDER } from '../../util/ai-gateway/coding-agents/gateway';
import {
  isKeychainAvailable,
  storeKeyInKeychain,
} from '../../util/ai-gateway/coding-agents/keychain';
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
  const dryRun = opts['--dry-run'] as boolean | undefined;
  const noBackup = opts['--no-backup'] as boolean | undefined;
  const noKeychain = opts['--no-keychain'] as boolean | undefined;
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
  telemetry.trackCliFlagReconfigure(reconfigure);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagNoBackup(noBackup);
  telemetry.trackCliFlagNoKeychain(noKeychain);
  telemetry.trackCliOptionAgentConfig(agentConfig);
  telemetry.trackCliOptionShellRc(shellRcOverride);
  telemetry.trackCliFlagYes(yes);

  const machine = shouldEmitNonInteractiveCommandError(client);
  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();
  const wantKeychain = !noKeychain && isKeychainAvailable();

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
    printStatus(
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
    printWarning(note);
  }

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

  // With no --key we create one. Resolve the owning team first — it decides
  // where the key lives (and can fail) — then collect name, quota, and expiry.
  const willCreate = !providedKey;
  let keyName = name;
  let keyBudget = budget;
  let keyRefresh = refreshPeriod;
  let keyExpiresAt = flagExpiresAt;
  if (willCreate && (!dryRun || canPrompt)) {
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
  let useKeychain = wantKeychain;
  if (wantKeychain && canPrompt && !yes) {
    useKeychain = await promptKeychain(client);
  }

  if (canPrompt && !yes) {
    const missing = selected.filter(
      a =>
        !overrides[a.id] &&
        !existsSync(dirname(a.configPath({ apiKey: '', home })))
    );
    if (missing.length > 0) {
      const customize = await client.input.confirm(
        "Some agents weren't found at their default locations. Set custom config paths?",
        false
      );
      if (customize) {
        for (const agent of missing) {
          const resolved = agent.configPath({
            apiKey: '',
            home,
          });
          const answer = await client.input.text({
            message: `${agent.displayName} config path?`,
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
    useKeychain,
    overrides,
    shellRcOverride,
  });

  const changed = previewPlan.changes.filter(
    c => c.status === 'create' || c.status === 'update'
  );
  const errored = previewPlan.changes.filter(c => c.status === 'error');
  const alreadyConfigured = changed.length === 0 && errored.length === 0;

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
      useKeychain,
      overrides,
      shellRcOverride,
      home,
      alreadyConfigured,
      reconfigure: Boolean(reconfigure),
    });
  }

  // Already wired up: instead of a dead-end no-op, offer to rotate the key or
  // reconfigure (e.g. a rotated/expired key, or a different team).
  if (alreadyConfigured) {
    // A provided key on a Keychain setup: refresh the stored secret in place,
    // even though the config files themselves don't change.
    if (!dryRun && useKeychain && providedKey) {
      if (!storeKeyInKeychain(providedKey)) {
        output.error(
          'Failed to update the key in the macOS Keychain. Re-run with --no-keychain to write it to the config files instead.'
        );
        return 1;
      }
      output.log(
        'All selected agents are already configured; updated the macOS Keychain with the provided key.'
      );
      printKey(providedKey, { keychain: true });
      return 0;
    }
    // Otherwise offer to rotate/reconfigure. `--reconfigure` skips the prompt.
    let doReconfigure = Boolean(reconfigure);
    if (!doReconfigure && canPrompt && !yes && !dryRun) {
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
    // doReconfigure: fall through to (re)create the key and apply below.
  }

  // Resolved state first, then the mutation preview, then the confirm.
  printResolvedState({
    selected,
    willCreate,
    name: keyName,
    budget: keyBudget,
    refreshPeriod: keyRefresh,
    expiresAt: keyExpiresAt,
    keychain: wantKeychain ? useKeychain : undefined,
  });
  printPlan(previewPlan, previewKey, { backup: !noBackup });

  if (dryRun) {
    printStatus(
      `Dry run — no files written. Re-run without ${chalk.bold('--dry-run')} to apply.`
    );
    return 0;
  }

  if (changed.length > 0 && canPrompt && !yes) {
    const confirmed = await client.input.confirm('Apply these changes?', true);
    if (!confirmed) {
      printStatus('Aborted. No files were changed.');
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

  if (useKeychain && !storeKeyInKeychain(keySource.key)) {
    printWarning(
      'Failed to store the key in the macOS Keychain; writing it to the config files instead.'
    );
    useKeychain = false;
  }

  const applyPlanResult = await buildSetupPlan(selected, {
    apiKey: keySource.key,
    home,
    useKeychain,
    overrides,
    shellRcOverride,
  });

  const results = await applyPlan(applyPlanResult, { backup: !noBackup });

  if (results.length === 0 && keySource.created) {
    // Rotated with a fresh key but nothing in the config files changed (e.g. the
    // key is resolved from the environment rather than embedded).
    output.print('\n');
    printAlignedLabel('Rotated', 'AI Gateway API key', { gutter: '✓' });
    printKeyRow(keySource.key, { keychain: useKeychain });
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
    printKeyRow(keySource.key, { keychain: useKeychain });
    if (results.some(r => r.backupPath)) {
      output.print(chalk.dim('  Previous files saved alongside as .bak\n'));
    }
  }
  for (const change of errored) {
    printWarning(
      `Skipped ${change.label} (${change.path}): ${change.error}. Fix or remove the file, then re-run.`
    );
  }

  printNotes(applyPlanResult);
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
