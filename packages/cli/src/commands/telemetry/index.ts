import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import status from './status';
import enable from './enable';
import disable from './disable';
import flush, { TELEMETRY_FLUSH_TIMEOUT_MS } from './flush';
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

  try {
    // A subcommand's own options are accepted only after that subcommand.
    const argv = client.argv.slice(2);
    const { subcommand: typed } = getSubcommand(
      parseArguments(argv, getFlagsSpecification(telemetryCommand.options), {
        permissive: true,
      }).args.slice(1),
      COMMAND_CONFIG
    );
    parsedArguments = parseArguments(
      argv,
      getFlagsSpecification([
        ...telemetryCommand.options,
        ...(typed === 'status' ? statusSubcommand.options : []),
      ])
    );
  } catch (err) {
    printError(err);
    return 2;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        columns: client.stderr.columns,
        parent: telemetryCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetryClient.trackCliFlagHelp('telemetry', subcommand);
    output.print(
      help(telemetryCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'status':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(statusSubcommand);
        return 0;
      }
      telemetryClient.trackCliSubcommandStatus(subcommandOriginal);
      return status(client, Boolean(parsedArguments.flags['--json']));
    case 'flush': {
      // Bound the worker even if initialization or a response body never settles.
      const deadline = setTimeout(
        () => process.exit(1),
        TELEMETRY_FLUSH_TIMEOUT_MS + 1_000
      );
      deadline.unref();
      try {
        return await flush(client, args);
      } finally {
        clearTimeout(deadline);
      }
    }
    case 'enable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(enableSubcommand);
        return 0;
      }
      telemetryClient.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client);
    case 'disable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('telemetry', subcommandOriginal);
        printHelp(disableSubcommand);
        return 0;
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
      output.print(
        help(telemetryCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
    }
  }
}
