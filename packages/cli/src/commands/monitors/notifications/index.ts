import getSubcommand from '../../../util/get-subcommand';
import output from '../../../output-manager';
import type Client from '../../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../../util/agent-output';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { warnDeprecatedSubcommand } from '../../../util/warn-deprecated-subcommand';
import { takeCommand } from '../../../util/get-args';
import type { MonitorsTelemetryClient } from '../../../util/telemetry/commands/monitors';
import { monitorsRoutingFlags } from '../run';
import type { MonitorsApi } from '../types';

const NOTIFICATIONS_CONFIG = {
  ls: ['ls', 'list'],
  link: ['link'],
  update: ['update', 'patch'],
  unlink: ['unlink'],
};

export default async function notifications(
  client: Client,
  argv: string[],
  api: MonitorsApi,
  telemetry: MonitorsTelemetryClient
): Promise<number> {
  const { command, args: argsWithoutCommand } = takeCommand(
    argv,
    monitorsRoutingFlags
  );
  if (!command || command.startsWith('ar_')) {
    telemetry.trackCliSubcommandNotifications(command ? 'inspect' : 'ls');
    return (await import('./ls')).default(client, argv, api);
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    [command],
    NOTIFICATIONS_CONFIG
  );
  const args = argsWithoutCommand;
  if (subcommand == null) {
    telemetry.trackCliSubcommandNotifications('unknown');
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown "monitors notifications" subcommand "${command}".`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'monitors notifications --help'
            ),
            when: 'Show valid notification subcommands',
          },
        ],
      },
      2
    );
    output.error(
      `Unknown "monitors notifications" subcommand "${command}". Run \`vercel monitors notifications --help\`.`
    );
    return 2;
  }

  switch (subcommand) {
    case 'ls':
      telemetry.trackCliSubcommandNotifications(
        args[0]?.startsWith('ar_') ? 'inspect' : 'ls'
      );
      return (await import('./ls')).default(client, args, api);
    case 'link':
    case 'update':
    case 'unlink':
      telemetry.trackCliSubcommandNotifications(subcommandOriginal);
      if (subcommandOriginal === 'patch') {
        warnDeprecatedSubcommand(
          client,
          'monitors notifications patch',
          'monitors notifications update'
        );
      }
      return (await import('./mutate')).default(client, args, api, subcommand);
    default:
      output.error(`Unhandled notifications subcommand: ${String(subcommand)}`);
      return 1;
  }
}
