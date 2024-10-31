import { handleError } from '../../util/error';
import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import status from './status';
import enable from './enable';
import disable from './disable';
import { telemetryCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { TelemetryTelemetryClient } from '../../util/telemetry/commands/telemetry';
import chalk from 'chalk';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  status: ['status'],
  enable: ['enable'],
  disable: ['disable'],
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
    handleError(err);
    return 1;
  }

  const { subcommand } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  if (parsedArguments.flags['--help']) {
    telemetryClient.trackCliFlagHelp('telemetry', subcommand);
    output.print(help(telemetryCommand, { columns: client.stderr.columns }));
  }

  switch (subcommand) {
    case 'status':
      telemetryClient.trackCliSubcommandStatus(subcommand);
      return status(client);
    case 'enable':
      telemetryClient.trackCliSubcommandEnable(subcommand);
      return enable(client);
    case 'disable':
      return disable(client);
    default: {
      const errorMessage =
        parsedArguments.args.length !== 2
          ? `Invalid number of arguments`
          : `Invalid subcommand`;
      output.print(
        `${chalk.red('Error')}: ${errorMessage}. See help instructions for usage:\n`
      );
      output.print(help(telemetryCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
