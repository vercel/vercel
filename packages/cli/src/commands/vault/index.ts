import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import add from './add';
import update from './update';
import { vaultCommand, addSubcommand, updateSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  update: getCommandAliases(updateSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(vaultCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    output.print(help(vaultCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: vaultCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        printHelp(addSubcommand);
        return 2;
      }
      return add(client, args);
    case 'update':
      if (needHelp) {
        printHelp(updateSubcommand);
        return 2;
      }
      return update(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(vaultCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
