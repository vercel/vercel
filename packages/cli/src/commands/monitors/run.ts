import getSubcommand from '../../util/get-subcommand';
import output from '../../output-manager';
import type Client from '../../util/client';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { takeCommand } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { MonitorsTelemetryClient } from '../../util/telemetry/commands/monitors';
import {
  monitorsCommand,
  monitorsNotificationsAggregateCommand,
} from './command';
import type { MonitorsApi } from './types';

export const MONITORS_CONFIG = {
  ls: ['ls', 'list'],
  schema: ['schema'],
  add: ['add', 'create'],
  inspect: ['inspect', 'get'],
  remove: ['remove', 'rm', 'delete'],
  update: ['update', 'patch'],
  notifications: ['notifications'],
};

/** The flags of every monitors command, to find a subcommand after flags. */
export const monitorsRoutingFlags = getFlagsSpecification(
  [
    ...monitorsCommand.subcommands,
    ...monitorsNotificationsAggregateCommand.subcommands,
  ].flatMap(command => [...command.options])
);

/**
 * Runs the monitors subcommand named in `argv`, the arguments after the
 * command name. Flags may come before the subcommand, as in
 * `vercel monitors --scope acme remove ar_abc123`. `ls` is the default.
 * `api` selects the API to call: the monitors API for `vercel monitors`,
 * the legacy alert-rules API for `vercel alerts rules`.
 */
export async function runMonitors(
  client: Client,
  argv: string[],
  api: MonitorsApi
): Promise<number> {
  const { command, args: argsWithoutCommand } = takeCommand(
    argv,
    monitorsRoutingFlags
  );
  const found = command ? getSubcommand([command], MONITORS_CONFIG) : undefined;
  if (command && found?.subcommand == null) {
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Unknown "monitors" subcommand "${command}".`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'monitors --help'
            ),
            when: 'Show valid monitors subcommands',
          },
        ],
      },
      2
    );
    output.error(
      `Unknown "monitors" subcommand "${command}". Run \`vercel monitors --help\`.`
    );
    return 2;
  }

  const resolved = found?.subcommand ?? 'ls';
  const original = found?.subcommandOriginal ?? 'ls';
  const args = found ? argsWithoutCommand : argv;
  const telemetry = new MonitorsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  switch (resolved) {
    case 'ls':
      telemetry.trackCliSubcommandLs(original);
      return (await import('./ls')).default(client, args, api, telemetry);
    case 'schema':
      telemetry.trackCliSubcommandSchema(original);
      return (await import('./schema')).default(client, args, api);
    case 'add':
      telemetry.trackCliSubcommandAdd(original);
      if (original === 'create') {
        warnDeprecatedSubcommand(client, 'monitors create', 'monitors add');
      }
      return (await import('./add')).default(client, args, api);
    case 'inspect':
      telemetry.trackCliSubcommandInspect(original);
      if (original === 'get') {
        warnDeprecatedSubcommand(client, 'monitors get', 'monitors inspect');
      }
      return (await import('./rule-inspect')).default(client, args, api);
    case 'remove':
      telemetry.trackCliSubcommandRemove(original);
      if (original === 'delete') {
        warnDeprecatedSubcommand(client, 'monitors delete', 'monitors remove');
      }
      return (await import('./rm')).default(client, args, api);
    case 'update':
      telemetry.trackCliSubcommandUpdate(original);
      if (original === 'patch') {
        warnDeprecatedSubcommand(client, 'monitors patch', 'monitors update');
      }
      return (await import('./update')).default(client, args, api);
    case 'notifications':
      return (await import('./notifications')).default(
        client,
        args,
        api,
        telemetry
      );
    default:
      output.error(`Unhandled monitors subcommand: ${String(resolved)}`);
      return 1;
  }
}
