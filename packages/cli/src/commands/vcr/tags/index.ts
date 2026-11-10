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

const TAGS_CONFIG = {
  ls: ['ls', 'list'],
  inspect: ['inspect', 'get'],
};

export default async function tags(
  client: Client,
  argv: string[],
  telemetry: VcrTelemetryClient
): Promise<number> {
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    argv,
    TAGS_CONFIG
  );

  if (subcommand == null) {
    const message =
      argv.length === 0
        ? getInvalidSubcommand(TAGS_CONFIG)
        : `Unknown "vcr tag" subcommand "${argv[0]}".`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, 'vcr tag --help'),
            when: 'Show valid tag subcommands',
          },
        ],
      },
      2
    );
    output.error(`${message} Run \`vercel vcr tag --help\`.`);
    return 2;
  }

  switch (subcommand) {
    case 'ls':
      return (await import('./ls')).default(client, args, telemetry);
    case 'inspect':
      if (subcommandOriginal === 'get') {
        warnDeprecatedSubcommand(client, 'vcr tag get', 'vcr tag inspect');
      }
      return (await import('./inspect')).default(client, args, telemetry);
    default:
      output.error(`Unhandled tags subcommand: ${subcommand}`);
      return 1;
  }
}
