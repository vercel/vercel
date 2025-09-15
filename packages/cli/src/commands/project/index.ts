import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import add from './add';
import inspect from './inspect';
import list from './list';
import rm from './rm';
import {
  addSubcommand,
  inspectSubcommand,
  listSubcommand,
  projectCommand,
  removeSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getSubcommand from '../../util/get-subcommand';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  list: getCommandAliases(listSubcommand),
  add: getCommandAliases(addSubcommand),
  remove: getCommandAliases(removeSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new ProjectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(projectCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  // eslint-disable-next-line prefer-const
  let { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('project');
    output.print(help(projectCommand, { columns: client.stderr.columns }));
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: projectCommand, columns: client.stderr.columns })
    );
    return 0;
  }

  if (!parsedArgs.args[1]) {
    subcommand = 'list';
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(projectCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
