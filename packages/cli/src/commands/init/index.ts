import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import Client from '../../util/client';
import handleError from '../../util/handle-error';
import init from './init';
import { isError } from '@vercel/error-utils';
import { help } from '../help';
import { initCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';

const COMMAND_CONFIG = {
  init: ['init'],
};

export default async function main(client: Client) {
  const { output } = client;

  let args;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(initCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(initCommand, { columns: client.stderr.columns }));
    return 2;
  }

  args = getSubcommand(parsedArgs.args.slice(1), COMMAND_CONFIG).args;

  if (parsedArgs.args.length > 3) {
    output.error('Too much arguments.');
    return 1;
  }

  try {
    return await init(client, parsedArgs.flags, args);
  } catch (err: unknown) {
    output.prettyError(err);
    if (isError(err) && typeof err.stack === 'string') {
      output.debug(err.stack);
    }
    return 1;
  }
}
