import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { alertsCommand, schemaSubcommand } from './command';

const COMMAND_CONFIG = {
  schema: getCommandAliases(schemaSubcommand),
};

export default async function alerts(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(alertsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    output.print(help(alertsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  function printSubcommandHelp(command: Command) {
    output.print(
      help(command, { parent: alertsCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'schema': {
      if (needHelp) {
        printSubcommandHelp(schemaSubcommand);
        return 0;
      }

      const schemaFn = (await import('./schema')).default;
      return schemaFn(client);
    }
    default: {
      if (needHelp) {
        output.print(help(alertsCommand, { columns: client.stderr.columns }));
        return 0;
      }

      const listFn = (await import('./list')).default;
      return listFn(client);
    }
  }
}
