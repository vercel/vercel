import type Client from '../../util/client';
import { isArgumentError, takeCommand } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import type { Command } from '../help';
import { printUnknownCommand } from '../print-command-help';
import { DaemonsTelemetryClient } from '../../util/telemetry/commands/daemons';
import * as commands from './command';
import { instancesList, list } from './list';
import scale from './scale';
import inspect from './inspect';
import { instancesInspect, instancesRestart } from './instances';
import * as api from './api';
import { getCommandNamePlain } from '../../util/pkg-name';

type Run = (client: Client, argv: string[]) => Promise<number>;
type Routes = Array<[Command, Run]>;

const INSTANCES: Routes = [
  [commands.instancesListSubcommand, instancesList],
  [commands.instancesInspectSubcommand, instancesInspect],
  [commands.instancesRestartSubcommand, instancesRestart],
];

const ROOT: Routes = [
  [commands.listSubcommand, list],
  [commands.inspectSubcommand, inspect],
  [commands.scaleSubcommand, scale],
  [
    commands.instancesSubcommand,
    (client, argv) => route(client, argv, INSTANCES, ['daemons', 'instances']),
  ],
];

const routingFlags = getFlagsSpecification(
  [...ROOT, ...INSTANCES].flatMap(([command]) => command.options)
);

export default async function daemons(client: Client): Promise<number> {
  try {
    const group = takeCommand(client.argv.slice(2), routingFlags);
    return await route(client, group.args, ROOT, ['daemons']);
  } catch (err) {
    return api.reportError(client, err, isArgumentError(err) ? 2 : 1);
  }
}

/** Runs the named subcommand. `list`, the first route, is the default. */
async function route(
  client: Client,
  argv: string[],
  routes: Routes,
  path: string[]
): Promise<number> {
  const config = Object.fromEntries(
    routes.map(([command]) => [command.name, getCommandAliases(command)])
  );
  const selected = takeCommand(argv, routingFlags);
  const { subcommand, subcommandOriginal } = getSubcommand(
    selected.command ? [selected.command] : [],
    config
  );
  if (!subcommand && selected.command && !selected.command.startsWith('-')) {
    if (api.isJsonOutput(client)) {
      return api.failure(
        client,
        'unknown_command',
        `Unknown command ${selected.command} for ${getCommandNamePlain(path.join(' '))}.`,
        {
          command: `${path.slice(1).join(' ')} --help`.trim(),
          when: 'See all commands',
        },
        2
      );
    }
    printUnknownCommand(client, selected.command, path);
    return 2;
  }
  const [command, run] =
    routes.find(([command]) => command.name === subcommand) ?? routes[0];
  new DaemonsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  }).trackSubcommand(command.name, subcommandOriginal);
  return run(client, subcommand ? selected.args : argv);
}
