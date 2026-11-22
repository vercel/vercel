import { homedir } from 'node:os';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import {
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  setupVercelPlugin,
  type PluginSetupResult,
} from '../../util/agent/auto-install-agentic';
import { setupCodexPlugin } from '../../util/agent/setup-codex-plugin';
import { setupOpenCodePlugin } from '../../util/agent/setup-opencode-plugin';
import { setupCodingAgents } from '../ai-gateway/coding-agents-setup';
import { getAgentById } from '../../util/ai-gateway/coding-agents/agents';
import type { CodingAgentsSetupResult } from '../../util/ai-gateway/coding-agents/types';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import {
  gatewaySubcommand,
  pluginSubcommand,
  setupCommand,
  skillsSubcommand,
} from './command';
import { SetupTelemetryClient } from '../../util/telemetry/commands/setup';

const COMMAND_CONFIG = {
  plugin: getCommandAliases(pluginSubcommand),
  gateway: getCommandAliases(gatewaySubcommand),
  skills: getCommandAliases(skillsSubcommand),
};

/** Flags shared by bare `setup` and its `plugin` and `gateway` subcommands. */
interface StepFlags {
  '--help'?: boolean;
  '--plugin'?: boolean;
  '--gateway'?: boolean;
  '--agent'?: string[];
  '--dry-run'?: boolean;
  '--yes'?: boolean;
  // `setup gateway` only: forwarded to the AI Gateway step.
  '--all'?: boolean;
  '--key'?: string;
  '--reconfigure'?: boolean;
  '--no-session-migration'?: boolean;
}

type StepId = 'plugin' | 'gateway';

interface StepOutcome {
  ok: boolean;
  complete: boolean;
  summary: string;
}

const STEP_LABELS: Record<StepId, string> = {
  plugin: 'Vercel plugin',
  gateway: 'AI Gateway',
};

export default async function setup(client: Client): Promise<number> {
  const machine = shouldEmitNonInteractiveCommandError(client);
  const telemetry = new SetupTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  // Subcommands parse their own options strictly once routed.
  let routingArgs;
  try {
    routingArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(setupCommand.options),
      { permissive: true }
    );
  } catch (error) {
    printError(error);
    return 2;
  }
  const { subcommand, subcommandOriginal } = getSubcommand(
    routingArgs.args.slice(1),
    COMMAND_CONFIG
  );
  if (subcommand === 'skills') {
    if (routingArgs.flags['--help']) {
      telemetry.trackCliFlagHelp('setup', subcommandOriginal);
      output.print(
        help(skillsSubcommand, {
          stream: client.stderr,
          parent: setupCommand,
          columns: client.stderr.columns,
        })
      );
      return 0;
    }
    telemetry.trackCliSubcommandSkills(subcommandOriginal);
    // Loaded on demand: the module carries the bundled skill files.
    const { default: setupSkills } = await import('./skills');
    return setupSkills(client);
  }

  // `setup plugin` and `setup gateway` run one step; bare `setup` runs both.
  const stepSubcommand =
    subcommand === 'plugin' || subcommand === 'gateway'
      ? subcommand
      : undefined;
  const command =
    stepSubcommand === 'plugin'
      ? pluginSubcommand
      : stepSubcommand === 'gateway'
        ? gatewaySubcommand
        : setupCommand;

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(command.options)
    );
  } catch (error) {
    if (machine) {
      writeSetupError(
        client,
        AGENT_REASON.INVALID_ARGUMENTS,
        `Invalid setup arguments. Run vercel setup${stepSubcommand ? ` ${stepSubcommand}` : ''} --help for usage.`
      );
    }
    printError(error);
    return 2;
  }
  const flags: StepFlags = parsedArgs.flags;

  if (flags['--help']) {
    telemetry.trackCliFlagHelp(
      'setup',
      stepSubcommand ? subcommandOriginal : undefined
    );
    output.print(
      help(command, {
        stream: client.stderr,
        parent: stepSubcommand ? setupCommand : undefined,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  // args: ['setup', ...] or ['setup', '<step>', ...]
  if (parsedArgs.args.length > (stepSubcommand ? 2 : 1)) {
    const message =
      'The setup command does not accept positional arguments. Use vercel setup plugin, gateway, or skills to run one step.';
    if (machine) {
      writeSetupError(client, AGENT_REASON.INVALID_ARGUMENTS, message);
    }
    output.fatal(message);
    return 2;
  }

  if (flags['--plugin']) {
    warnDeprecatedSubcommand(client, 'setup --plugin', 'setup plugin');
  }
  if (flags['--gateway']) {
    warnDeprecatedSubcommand(client, 'setup --gateway', 'setup gateway');
  }
  const onlyPlugin = stepSubcommand === 'plugin' || Boolean(flags['--plugin']);
  const onlyGateway =
    stepSubcommand === 'gateway' || Boolean(flags['--gateway']);
  const dryRun = flags['--dry-run'];
  const yes = flags['--yes'];
  const agents = flags['--agent']
    ? [...new Set(flags['--agent'].map(agent => agent.toLowerCase()))]
    : undefined;

  if (
    agents?.some(
      agent =>
        !getAgentById(agent) ||
        (onlyPlugin &&
          !onlyGateway &&
          !['claude-code', 'codex', 'opencode'].includes(agent))
    )
  ) {
    const message =
      onlyPlugin && !onlyGateway
        ? 'Plugin setup supports --agent claude-code, --agent codex, and --agent opencode.'
        : 'Unknown coding agent. Run vercel ai-gateway setup --help for supported agents.';
    if (machine)
      writeSetupError(client, AGENT_REASON.INVALID_ARGUMENTS, message);
    output.fatal(message);
    return 2;
  }

  if (stepSubcommand === 'plugin') {
    telemetry.trackCliSubcommandPlugin(subcommandOriginal);
  } else if (stepSubcommand === 'gateway') {
    telemetry.trackCliSubcommandGateway(subcommandOriginal);
  }
  telemetry.trackCliOptionAgent(agents as [string] | undefined);
  telemetry.trackCliFlagPlugin(flags['--plugin']);
  telemetry.trackCliFlagGateway(flags['--gateway']);
  telemetry.trackCliFlagDryRun(dryRun);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliFlagAll(flags['--all']);
  telemetry.trackCliOptionKey(flags['--key']);
  telemetry.trackCliFlagReconfigure(flags['--reconfigure']);
  telemetry.trackCliFlagNoSessionMigration(flags['--no-session-migration']);

  // A step subcommand (or its deprecated flag) narrows the run; none means all.
  const steps: StepId[] = [];
  if (onlyPlugin || !onlyGateway) steps.push('plugin');
  if (onlyGateway || !onlyPlugin) steps.push('gateway');

  const canPrompt = Boolean(client.stdin.isTTY) && !machine;
  const home = homedir();

  const outcomes = new Map<StepId, StepOutcome>();
  try {
    for (const step of steps) {
      output.print(`\n${chalk.bold(`  ${STEP_LABELS[step]}`)}\n`);
      const outcome =
        step === 'plugin'
          ? await runPluginStep(client, {
              yes: Boolean(yes),
              dryRun: Boolean(dryRun),
              canPrompt,
              home,
              machine,
              onlyStep: steps.length === 1,
              agents,
            })
          : await runGatewayStep(client, {
              yes: Boolean(yes),
              dryRun: Boolean(dryRun),
              agents,
              all: Boolean(flags['--all']),
              key: flags['--key'],
              reconfigure: Boolean(flags['--reconfigure']),
              noSessionMigration: Boolean(flags['--no-session-migration']),
            });
      outcomes.set(step, outcome);
      // A plugin error or missing confirmation owns the machine response.
      // Stop before the gateway can mutate state or emit a second JSON object.
      if (machine && !outcome.ok) break;
    }
  } catch (error) {
    output.stopSpinner();
    if (machine) {
      writeSetupError(client, 'setup_failed', 'Failed to complete setup.');
    }
    printError(error);
    return 1;
  }

  // Step results own stdout in machine mode; the human receipt uses stderr.
  const failed = [...outcomes.values()].some(o => !o.ok);
  const complete = [...outcomes.values()].every(o => o.complete);
  const gutter = failed ? chalk.red('✗') : complete ? chalk.green('✓') : ' ';
  const heading = !complete
    ? 'Setup incomplete'
    : dryRun
      ? 'Dry run complete'
      : 'Setup complete';
  output.print(`\n${gutter} ${chalk.bold(heading)}\n`);
  for (const [step, outcome] of outcomes) {
    printAlignedLabel(STEP_LABELS[step], outcome.summary);
  }
  return failed ? 1 : 0;
}

function writeSetupError(client: Client, reason: string, message: string) {
  client.stdout.write(
    `${JSON.stringify({ status: AGENT_STATUS.ERROR, reason, message }, null, 2)}\n`
  );
}

async function runPluginStep(
  client: Client,
  opts: {
    yes: boolean;
    dryRun: boolean;
    canPrompt: boolean;
    home: string;
    machine: boolean;
    onlyStep: boolean;
    agents?: string[];
  }
): Promise<StepOutcome> {
  const targets = [
    { agent: 'claude-code', name: 'Claude Code', setup: setupVercelPlugin },
    { agent: 'codex', name: 'Codex', setup: setupCodexPlugin },
    { agent: 'opencode', name: 'OpenCode', setup: setupOpenCodePlugin },
  ].filter(target => !opts.agents || opts.agents.includes(target.agent));
  const results: Array<PluginSetupResult & { agent: string; name: string }> =
    [];
  for (const target of targets) {
    const result = await target.setup(client, opts);
    results.push({ ...result, agent: target.agent, name: target.name });
  }
  // Omit undetected agents from the human receipt when another supported agent
  // was found. Keep every attempted target in the structured result.
  const detected = results.filter(result => result.status !== 'not_detected');
  const visible = detected.length > 0 ? detected : results;
  for (const result of visible) output.print(`  ${result.message}\n`);
  // A failure takes precedence over confirmation, then unfinished and applied
  // work. One agent being current must not hide another agent's failed install.
  const statusOrder: PluginSetupResult['status'][] = [
    'failed',
    'confirmation_required',
    'declined',
    'disabled',
    'installed',
    'enabled',
    'updated',
    'dry_run',
    'up_to_date',
    'unsupported',
    'not_detected',
  ];
  const result = statusOrder
    .map(status => results.find(result => result.status === status))
    .find(result => result !== undefined) ?? {
    status: 'not_detected' as const,
    message: 'No Vercel plugin is available for the selected agents.',
  };
  const message =
    visible.map(result => result.message).join(' ') || result.message;
  if (visible.length === 0) output.print(`  ${message}\n`);
  const confirmationRequired = result.status === 'confirmation_required';
  const ok = result.status !== 'failed' && !confirmationRequired;
  if (opts.machine && (opts.onlyStep || !ok)) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: confirmationRequired
            ? AGENT_STATUS.ACTION_REQUIRED
            : ok
              ? AGENT_STATUS.OK
              : AGENT_STATUS.ERROR,
          reason: confirmationRequired
            ? AGENT_REASON.CONFIRMATION_REQUIRED
            : `plugin_${result.status}`,
          message,
          plugins: results,
          ...(confirmationRequired && {
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  `setup${opts.onlyStep ? ' plugin' : ''}${opts.agents?.map(agent => ` --agent ${agent}`).join('') ?? ''} --yes`,
                  undefined,
                  { globalFlags: 'all' }
                ),
              },
            ],
          }),
        },
        null,
        2
      )}\n`
    );
  }
  return {
    ok,
    complete:
      ok && !['declined', 'disabled', 'unsupported'].includes(result.status),
    summary:
      visible.length > 0
        ? visible.map(result => summarizePlugin(result, result.name)).join('; ')
        : 'Skipped (no plugin available for the selected agents)',
  };
}

function summarizePlugin(result: PluginSetupResult, name: string): string {
  switch (result.status) {
    case 'installed':
      return `Installed for ${name}`;
    case 'enabled':
      return `Enabled for ${name}`;
    case 'updated':
      return `Updated for ${name}`;
    case 'up_to_date':
      return `Already installed for ${name}`;
    case 'not_detected':
      return `Skipped (${name} not detected)`;
    case 'unsupported':
      return `Skipped (${name} needs an upgrade)`;
    case 'disabled':
      return `Disabled in ${name} config`;
    case 'declined':
      return `Skipped for ${name}`;
    case 'confirmation_required':
      return `Confirmation required for ${name} (re-run with --yes)`;
    case 'dry_run':
      return `Would ${result.action ?? 'install'} for ${name}`;
    case 'failed':
      return `Failed for ${name}`;
  }
}

async function runGatewayStep(
  client: Client,
  opts: {
    yes: boolean;
    dryRun: boolean;
    agents?: string[];
    all?: boolean;
    key?: string;
    reconfigure?: boolean;
    noSessionMigration?: boolean;
  }
): Promise<StepOutcome> {
  const argv: string[] = [];
  if (opts.yes) argv.push('--yes');
  if (opts.dryRun) argv.push('--dry-run');
  for (const agent of opts.agents ?? []) argv.push('--agent', agent);
  if (opts.all) argv.push('--all');
  if (opts.key !== undefined) argv.push('--key', opts.key);
  if (opts.reconfigure) argv.push('--reconfigure');
  if (opts.noSessionMigration) argv.push('--no-session-migration');
  const result = await setupCodingAgents(client, argv);
  const summaries: Record<CodingAgentsSetupResult['outcome'], string> = {
    configured: 'Completed (see above)',
    already_configured: 'Already configured',
    dry_run: 'Previewed (see above)',
    canceled: 'Canceled (no changes applied)',
    skipped: 'Skipped (see above)',
    agent_prompt: 'Prompt generated (apply it with your agent)',
    failed: 'Failed — see the messages above',
  };
  return {
    ok: result.exitCode === 0,
    complete:
      result.exitCode === 0 &&
      result.outcome !== 'canceled' &&
      result.outcome !== 'skipped' &&
      result.outcome !== 'agent_prompt',
    summary: summaries[result.outcome],
  };
}
