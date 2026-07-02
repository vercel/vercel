import getSubcommand from '../../../util/get-subcommand';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import output from '../../../output-manager';
import type Client from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';

const TAGS_CONFIG = {
  ls: ['ls', 'list'],
  inspect: ['inspect', 'get'],
};

export default async function tags(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { subcommand, args } = getSubcommand(argv, TAGS_CONFIG);

  if (subcommand == null) {
    const message =
      argv.length === 0
        ? getInvalidSubcommand(TAGS_CONFIG)
        : `Unknown "vcr tags" subcommand "${argv[0]}".`;
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
              'vcr tags --help'
            ),
            when: 'Show valid tags subcommands',
          },
        ],
      },
      1
    );
    output.error(`${message} Run \`vercel vcr tags --help\`.`);
    return 1;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args, telemetry);
    case 'inspect':
      return (await import('./inspect')).default(client, args, telemetry);
    default:
      output.error(`Unhandled tags subcommand: ${subcommand}`);
      return 1;
  }
}
