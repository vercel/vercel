import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import list from './list';
import listVersions from './list-versions';
import inspect from './inspect';
import add from './add';
import {
  routesCommand,
  listSubcommand,
  listVersionsSubcommand,
  inspectSubcommand,
  addSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { RoutesTelemetryClient } from '../../util/telemetry/commands/routes';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  'list-versions': getCommandAliases(listVersionsSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  add: getCommandAliases(addSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new RoutesTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(routesCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('routes');
    output.print(help(routesCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: routesCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'list-versions':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(listVersionsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandListVersions(subcommandOriginal);
      return listVersions(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(routesCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
