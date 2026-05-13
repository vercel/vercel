import output from '../../output-manager';
import { getCommandAliases } from '..';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import resolveSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { type Command, help } from '../help';
import { dbCommand, querySubcommand, shellSubcommand } from './command';
import type Client from '../../util/client';
import query from './query';
import shell from './shell';

const COMMAND_CONFIG = {
  query: getCommandAliases(querySubcommand),
  shell: getCommandAliases(shellSubcommand),
};

export default async function db(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(dbCommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = resolveSubcommand(subArgs, COMMAND_CONFIG);
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: dbCommand, columns: client.stderr.columns })
    );
  }

  if (!subcommand && needHelp) {
    output.print(help(dbCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'query':
      if (needHelp) {
        printHelp(querySubcommand);
        return 2;
      }
      return query(client, args);
    case 'shell':
      if (needHelp) {
        printHelp(shellSubcommand);
        return 2;
      }
      return shell(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(dbCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
