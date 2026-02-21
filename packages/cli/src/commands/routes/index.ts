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
  editSubcommand,
  deleteSubcommand,
  enableSubcommand,
  disableSubcommand,
  reorderSubcommand,
  publishSubcommand,
  restoreSubcommand,
  discardSubcommand,
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
  edit: getCommandAliases(editSubcommand),
  delete: getCommandAliases(deleteSubcommand),
  enable: getCommandAliases(enableSubcommand),
  disable: getCommandAliases(disableSubcommand),
  reorder: getCommandAliases(reorderSubcommand),
  publish: getCommandAliases(publishSubcommand),
  restore: getCommandAliases(restoreSubcommand),
  'discard-staging': getCommandAliases(discardSubcommand),
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
    case 'edit':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(editSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandEdit(subcommandOriginal);
      return (await import('./edit')).default(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(deleteSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      return (await import('./delete')).default(client, args);
    case 'enable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(enableSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandEnable(subcommandOriginal);
      return (await import('./enable')).default(client, args);
    case 'disable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(disableSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDisable(subcommandOriginal);
      return (await import('./disable')).default(client, args);
    case 'reorder':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(reorderSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandReorder(subcommandOriginal);
      return (await import('./reorder')).default(client, args);
    case 'publish':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(publishSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPublish(subcommandOriginal);
      return (await import('./publish')).default(client, args);
    case 'restore':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(restoreSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRestore(subcommandOriginal);
      return (await import('./restore')).default(client, args);
    case 'discard-staging':
      if (needHelp) {
        telemetry.trackCliFlagHelp('routes', subcommandOriginal);
        printHelp(discardSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandDiscardStaging(subcommandOriginal);
      return (await import('./discard')).default(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(routesCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
