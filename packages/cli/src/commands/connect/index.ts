import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import type Client from '../../util/client';
import { connectCommand } from './command';
import connect from './connect';
import { help } from '../help';
import output from '../../output-manager';

export default async function main(client: Client) {
  let parsedArgs;

  const flagsSpecification = getFlagsSpecification(connectCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(connectCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { flags } = parsedArgs;
  // Skip the command name ("connect") from args
  const args = parsedArgs.args.slice(1);

  return await connect(client, flags, args);
}
