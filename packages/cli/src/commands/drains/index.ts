import type Client from '../../util/client';
import { printError } from '../../util/error';
import { isArgumentError, takeCommand } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { DrainsTelemetryClient } from '../../util/telemetry/commands/drains';
import { getCommandAliases } from '..';
import type { CommandOption } from '../help';
import { printUnknownCommand } from '../print-command-help';
import { drainsCommand } from './command';
import create from './create';
import deleteDrain from './delete';
import inspect from './inspect';
import list from './list';
import { pause, resume } from './set-status';
import { handleUnexpectedError } from './shared';
import update from './update';

const RUN: Record<string, (client: Client, argv: string[]) => Promise<number>> =
  {
    list,
    inspect,
    create,
    update,
    pause,
    resume,
    delete: deleteDrain,
  };

const COMMAND_CONFIG = Object.fromEntries(
  drainsCommand.subcommands.map(command => [
    command.name,
    getCommandAliases(command),
  ])
);

const routingFlags = getFlagsSpecification(
  drainsCommand.subcommands.flatMap(
    (command): ReadonlyArray<CommandOption> => command.options
  )
);

/**
 * Routes `vercel drains <subcommand>`. The CLI entry point answers `--help`
 * from the command metadata before this runs. `list` is the default.
 */
export default async function drains(client: Client): Promise<number> {
  let selected;
  try {
    const group = takeCommand(client.argv.slice(2), routingFlags);
    selected = takeCommand(group.args, routingFlags);
  } catch (err) {
    printError(err, client);
    return isArgumentError(err) ? 2 : 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    selected.command ? [selected.command] : [],
    COMMAND_CONFIG
  );
  if (!subcommand && selected.command) {
    printUnknownCommand(client, selected.command, ['drains']);
    return 2;
  }

  const name = typeof subcommand === 'string' ? subcommand : 'list';
  const telemetry = new DrainsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const track: Record<string, (actual: string) => void> = {
    list: a => telemetry.trackCliSubcommandList(a),
    inspect: a => telemetry.trackCliSubcommandInspect(a),
    create: a => telemetry.trackCliSubcommandCreate(a),
    update: a => telemetry.trackCliSubcommandUpdate(a),
    pause: a => telemetry.trackCliSubcommandPause(a),
    resume: a => telemetry.trackCliSubcommandResume(a),
    delete: a => telemetry.trackCliSubcommandDelete(a),
  };
  track[name](subcommandOriginal);

  try {
    return await RUN[name](client, selected.args);
  } catch (err) {
    return handleUnexpectedError(client, selected.args.includes('--json'), err);
  }
}
