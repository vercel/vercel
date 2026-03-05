import { help } from '../help';
import { listAliasesCommand } from './command';
import { commandsStructs, getCommandAliases } from '../index';

import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';

export default async function listAliases(client: Client): Promise<number> {
  const flagsSpecification = getFlagsSpecification(listAliasesCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(listAliasesCommand, { columns: client.stderr.columns }));
    return 0;
  }

  // Build a list of commands with their aliases
  const commandList: { name: string; aliases: string[] }[] = [];

  for (const command of commandsStructs) {
    const aliases = getCommandAliases(command).slice(1); // Remove the first entry (name itself)
    commandList.push({
      name: command.name,
      aliases: aliases as string[],
    });
  }

  // Sort by command name
  commandList.sort((a, b) => a.name.localeCompare(b.name));

  // Find the longest command name for alignment
  const maxNameLength = Math.max(...commandList.map(c => c.name.length));

  output.log('Available commands and aliases:\n');

  for (const { name, aliases } of commandList) {
    const paddedName = name.padEnd(maxNameLength);
    if (aliases.length > 0) {
      output.print(`  ${paddedName}  (aliases: ${aliases.join(', ')})\n`);
    } else {
      output.print(`  ${paddedName}\n`);
    }
  }

  return 0;
}
