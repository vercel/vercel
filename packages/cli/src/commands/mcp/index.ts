import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { help } from '../help';
import { mcpCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import mcp from './mcp';

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(mcpCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(mcpCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // Add the parsed flags to client.argv so the mcp function can access them
  if (parsedArgs.flags['--project']) {
    client.argv.push('--project');
  }

  try {
    return await mcp(client);
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }
}
