import getSubcommand from '../../../util/get-subcommand';
import output from '../../../output-manager';
import type Client from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import type { VcrTelemetryClient } from '../../../util/telemetry/commands/vcr';

const IMAGE_CONFIG = {
  ls: ['ls', 'list'],
  inspect: ['inspect', 'get'],
  rm: ['rm', 'remove', 'delete'],
};

export default async function image(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { subcommand, args } = getSubcommand(argv, IMAGE_CONFIG);

  if (subcommand == null) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown "vcr image" subcommand "${argv[0]}".`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'vcr image --help'
            ),
            when: 'Show valid image subcommands',
          },
        ],
      },
      1
    );
    output.error(
      `Unknown "vcr image" subcommand "${argv[0]}". Run \`vercel vcr image --help\`.`
    );
    return 1;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args, telemetry);
    case 'inspect':
      return (await import('./inspect')).default(client, args, telemetry);
    case 'rm':
      return (await import('./rm')).default(client, args, telemetry);
    default:
      output.error(`Unhandled image subcommand: ${subcommand}`);
      return 1;
  }
}
