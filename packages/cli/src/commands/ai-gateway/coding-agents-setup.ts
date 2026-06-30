import { homedir } from 'node:os';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { resolveAgents } from '../../util/ai-gateway/coding-agents/resolve';
import {
  ensureTeam,
  createKey,
  promptKeyName,
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
import { AGENT_STATUS } from '../../util/agent-output-constants';
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
  const name = opts['--name'] as string | undefined;
  const reconfigure = opts['--reconfigure'] as boolean | undefined;
  const yes = opts['--yes'] as boolean | undefined;

  telemetry.trackCliOptionAgent(agentFlags as [string] | undefined);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionKey(providedKey);
  telemetry.trackCliOptionName(name);
  telemetry.trackCliFlagReconfigure(reconfigure);
  telemetry.trackCliFlagYes(yes);

  const machine = shouldEmitNonInteractiveCommandError(client);
  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();

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
  // where the key lives (and can fail), so it comes before any naming.
  const willCreate = !providedKey;
  let keyName = name;
  if (willCreate) {
    const teamError = await ensureTeam(client, {
      machine,
      canPrompt,
      yes: Boolean(yes),
    });
    if (teamError) {
      return teamError;
    }
    if (canPrompt && !yes && keyName === undefined) {
      keyName = await promptKeyName(client);
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

  if (machine) {
    return runMachine({
      client,
      selected,
      unsupported,
      keySource: providedKey ? { key: providedKey, created: false } : null,
      createKey: () => createKey(client, { name: keyName }),
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
      : { key: await createKey(client, { name: keyName }), created: true };
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
