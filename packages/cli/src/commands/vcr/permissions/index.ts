import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import getSubcommand from '../../../util/get-subcommand';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import output from '../../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';
import {
  PERMISSIONS_ACTIONS,
  permissionsLsSubcommand,
  permissionsClearSubcommand,
} from './command';

const USAGE = 'vcr permissions <repository> <ls|add|rm|clear>';

/**
 * Flags accepted by any `vcr permissions` action. The router parses
 * permissively with the full set so flag values (e.g. `--project my-app`) are
 * not mistaken for positional arguments while locating the action word.
 */
const ROUTING_OPTIONS = [
  ...permissionsLsSubcommand.options,
  ...permissionsClearSubcommand.options,
];

export default async function permissions(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  // This group uses `vcr permissions <repository> <action>` ordering, so the
  // action is the second positional argument rather than the first.
  let positionals: string[];
  try {
    const parsed = parseArguments(
      argv,
      getFlagsSpecification(ROUTING_OPTIONS),
      { permissive: true }
    );
    positionals = parsed.args;
  } catch {
    // A malformed flag: fall through with raw args so the strict per-action
    // parse (or the unknown-action error below) reports it.
    positionals = argv.filter(arg => !arg.startsWith('-'));
  }

  const repository = positionals[0];
  const { subcommand } = getSubcommand(
    positionals.slice(1),
    PERMISSIONS_ACTIONS
  );

  if (!repository || subcommand == null) {
    const message = !repository
      ? `Missing repository. Usage: \`vercel ${USAGE}\`.`
      : positionals.length < 2
        ? `Please specify an action. Usage: \`vercel ${USAGE}\`.`
        : `Unknown "vcr permissions" action "${positionals[1]}". Usage: \`vercel ${USAGE}\`.`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'vcr permissions --help'
            ),
            when: 'Show valid permissions actions',
          },
        ],
      },
      1
    );
    output.error(`${message} Run \`vercel vcr permissions --help\`.`);
    return 1;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, argv, telemetry);
    case 'add':
      return (await import('./add')).default(client, argv, telemetry);
    case 'rm':
      return (await import('./rm')).default(client, argv, telemetry);
    case 'clear':
      return (await import('./clear')).default(client, argv, telemetry);
    default:
      output.error(`Unhandled permissions action: ${subcommand}`);
      return 1;
  }
}
