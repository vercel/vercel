import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import status from './status';
import enable from './enable';
import disable from './disable';
import flush from './flush';
import {
  disableSubcommand,
  enableSubcommand,
  statusSubcommand,
  telemetryCommand,
  flushSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { TelemetryTelemetryClient } from '../../util/telemetry/commands/telemetry';
import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  status: getCommandAliases(statusSubcommand),
  enable: getCommandAliases(enableSubcommand),
  disable: getCommandAliases(disableSubcommand),
  flush: getCommandAliases(flushSubcommand),
};

export default async function telemetry(client: Client) {
  const telemetryClient = new TelemetryTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(telemetryCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: telemetryCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetryClient.trackCliFlagHelp('telemetry', subcommand);
    output.print(help(telemetryCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'status':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(statusSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandStatus(subcommandOriginal);
      return status(client);
    case 'flush':
      return flush(client, args);
    case 'enable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(enableSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client);
    case 'disable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(disableSubcommand);
        return 2;
      }
      return disable(client);
    default: {
      const errorMessage =
        parsedArguments.args.length !== 2
          ? 'Invalid number of arguments'
          : 'Invalid subcommand';
      output.print(
        `${chalk.red('Error')}: ${errorMessage}. See help instructions for usage:\n`
      );
      output.print(help(telemetryCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
