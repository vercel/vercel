import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import status from './status';
import enable from './enable';
import disable from './disable';
import {
  disableSubcommand,
  enableSubcommand,
  statusSubcommand,
  guidanceCommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { GuidanceTelemetryClient } from '../../util/telemetry/commands/guidance';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  status: getCommandAliases(statusSubcommand),
  enable: getCommandAliases(enableSubcommand),
  disable: getCommandAliases(disableSubcommand),
};

export default async function guidance(client: Client) {
  if (!process.env.FF_GUIDANCE_MODE) {
    // technically unreachable because `main` will not call this.
    // present here to allow us to unit test.
    output.error('The guidance subcommand does not exist');
    return 1;
  }

  const telemetryClient = new GuidanceTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(guidanceCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: guidanceCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetryClient.trackCliFlagHelp('guidance', subcommand);
    output.print(help(guidanceCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'status':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('guidance', subcommandOriginal);
        printHelp(statusSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandStatus(subcommandOriginal);
      return status(client);
    case 'enable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('guidance', subcommandOriginal);
        printHelp(enableSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client);
    case 'disable':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('guidance', subcommandOriginal);
        printHelp(disableSubcommand);
        return 2;
      }
      return disable(client);
    default: {
      output.print(help(guidanceCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
