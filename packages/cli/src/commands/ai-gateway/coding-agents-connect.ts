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
  const noKeychain = opts['--no-keychain'] as boolean | undefined;
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
  telemetry.trackCliFlagNoKeychain(noKeychain);
  telemetry.trackCliFlagYes(yes);

  const machine = shouldEmitNonInteractiveCommandError(client);
  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();
  // Prefer the macOS Keychain when available so the key stays out of plaintext
  // config files; `--no-keychain` (or a non-macOS host) falls back to embedding.
  const wantKeychain = !noKeychain && isKeychainAvailable();

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
  if (expiration && !isValidExpiry(expiration)) {
    return failValidation(
      client,
      machine,
      AGENT_REASON.INVALID_EXPIRATION,
      `Invalid expiration "${expiration}". Must be one of: ${VALID_EXPIRY_VALUES.join(', ')}.`
    );
  }
  // Resolve the `--expiration` flag to an absolute timestamp up front; `none`
  // (and an unset flag) leaves the key non-expiring.
  const flagExpiresAt =
    expiration && expiration !== 'none'
      ? presetToExpiresAt(expiration)
      : undefined;

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

  // 2. Decide the key source. Defer creation until after confirmation so we
  //    never mint an orphan key; preview diffs with a masked placeholder.
  //    Resolve the key's options up front (including dry runs) so the previewed
  //    flow matches a real apply — but only prompt when we actually can. A
  //    non-interactive dry run is a pure preview and must not require a scope.
  //    Flags win; interactive prompts fill the rest in this order: name, team,
  //    quota (+ refresh), expiry. Name carries the "we'll create a key"
  //    explainer, so it comes first.
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
      // Quota and expiry both default to "no"; only prompt for the ones the
      // user did not already pin with a flag.
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
  // Offer to keep the key in the macOS Keychain when it's available; default
  // yes. Non-interactive runs use availability (with --no-keychain to opt out).
  let useKeychain = wantKeychain;
  if (wantKeychain && canPrompt && !yes) {
    useKeychain = await promptKeychain(client);
  }
  const previewKey = providedKey ?? KEY_PLACEHOLDER;

  // 3. Build the preview plan.
  const previewPlan = await buildSetupPlan(selected, {
    apiKey: previewKey,
    home,
    useKeychain,
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
        createKey(client, {
          name: keyName,
          budget: keyBudget,
          refreshPeriod: keyRefresh,
          includeByok,
          expiresAt: keyExpiresAt,
        }),
      useKeychain,
      home,
    });
  }

  // Interactive / human mode.
  if (changed.length === 0 && errored.length === 0) {
    output.log(
      'All selected agents are already configured for the AI Gateway.'
    );
    if (providedKey) {
      printKey(providedKey);
    }
    return 0;
  }

  // Show the planned changes first, then a summary of what will happen, then ask
  // to apply.
  printPlan(previewPlan, previewKey);
  printResolvedState({
    selected,
    willCreate,
    name: keyName,
    budget: keyBudget,
    refreshPeriod: keyRefresh,
    expiresAt: keyExpiresAt,
    keychain: wantKeychain ? useKeychain : undefined,
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

  // 4. Mint the key now (if needed), then rebuild the plan with the real key.
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

  // Stash the secret in the Keychain before writing; on failure fall back to
  // embedding it in the config so the run still produces a working setup.
  if (useKeychain && !storeKeyInKeychain(keySource.key)) {
    output.warn(
      'Could not store the key in the macOS Keychain; writing it to the config instead.'
    );
    useKeychain = false;
  }

  const applyPlanResult = await buildSetupPlan(selected, {
    apiKey: keySource.key,
    home,
    useKeychain,
  });

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
  printKey(keySource.key, { keychain: useKeychain });
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
