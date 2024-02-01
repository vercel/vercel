import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import Client from '../../util/client';
import handleError from '../../util/handle-error';
import init from './init';
import { isError } from '@vercel/error-utils';
import { help } from '../help';
import { initCommand } from './command';

const COMMAND_CONFIG = {
  init: ['init'],
};

export default async function main(client: Client) {
  const { output } = client;
  let argv;
  let args;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--force': Boolean,
      '-f': '--force',
    });
    args = getSubcommand(argv._.slice(1), COMMAND_CONFIG).args;
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    client.output.print(help(initCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (argv._.length > 3) {
    output.error('Too much arguments.');
    return 1;
  }

  try {
    return await init(client, argv, args);
  } catch (err: unknown) {
    output.prettyError(err);
    if (isError(err) && typeof err.stack === 'string') {
      output.debug(err.stack);
    }
    return 1;
  }
}
