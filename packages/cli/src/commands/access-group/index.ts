import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import inspect from './inspect';
import ls from './ls';
import {
  accessGroupCommand,
  inspectSubcommand,
  listSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { AccessGroupTelemetryClient } from '../../util/telemetry/commands/access-group';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  ls: getCommandAliases(listSubcommand),
};

export default async function accessGroup(client: Client) {
  const { telemetryEventStore } = client;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(accessGroupCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const telemetry = new AccessGroupTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const { subcommand, subcommandOriginal, args } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('access-group', subcommand);
    output.print(help(accessGroupCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: accessGroupCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
