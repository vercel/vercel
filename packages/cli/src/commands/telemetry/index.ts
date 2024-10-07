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
import chalk from 'chalk';

const COMMAND_CONFIG = {
  status: ['status'],
  enable: ['enable'],
  disable: ['disable'],
};

export default async function telemetry(client: Client) {
  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(telemetryCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    client.output.print(
      help(telemetryCommand, { columns: client.stderr.columns })
    );
  }

  const { subcommand } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  switch (subcommand) {
    case 'status':
      return status(client);
    case 'enable':
      return enable(client);
    case 'disable':
      return disable(client);
    default: {
      const errorMessage =
        parsedArguments.args.length !== 2
          ? `Invalid number of arguments`
          : `Invalid subcommand`;
      client.output.print(
        `${chalk.red('Error')}: ${errorMessage}. See help instructions for usage:\n`
      );
      client.output.print(
        help(telemetryCommand, { columns: client.stderr.columns })
      );
      return 2;
    }
  }
}
