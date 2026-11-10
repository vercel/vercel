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
import { warnDeprecatedSubcommand } from '../../../util/warn-deprecated-subcommand';
import { getCommandAliases } from '../..';
import { imageRmSubcommand } from './command';

const IMAGE_CONFIG = {
  ls: ['ls', 'list'],
  inspect: ['inspect', 'get'],
  delete: getCommandAliases(imageRmSubcommand),
};

export default async function image(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    argv,
    IMAGE_CONFIG
  );

  if (subcommand == null) {
    const message =
      argv.length === 0
        ? getInvalidSubcommand(IMAGE_CONFIG)
        : `Unknown "vcr image" subcommand "${argv[0]}".`;
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
              'vcr image --help'
            ),
            when: 'Show valid image subcommands',
          },
        ],
      },
      2
    );
    output.error(`${message} Run \`vercel vcr image --help\`.`);
    return 2;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args, telemetry);
    case 'inspect':
      if (subcommandOriginal === 'get') {
        warnDeprecatedSubcommand(client, 'vcr image get', 'vcr image inspect');
      }
      return (await import('./inspect')).default(client, args, telemetry);
    case 'delete':
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          'vcr image remove',
          'vcr image delete'
        );
      }
      return (await import('./rm')).default(client, args, telemetry);
    default:
      output.error(`Unhandled image subcommand: ${subcommand}`);
      return 1;
  }
}
