import type Client from '../../util/client';
import getArgs from '../../util/get-args';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import handleError from '../../util/handle-error';
import { isErrnoException } from '@vercel/error-utils';
import transformNodejs from './nodejs';
import { promoteCommand } from './command';
import { help } from '../help';

/**
 * `vc promote` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help'] || argv._[0] === 'help') {
    client.output.print(
      help(promoteCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const yes = argv['--yes'] ?? false;

  try {
    return await transformNodejs({
      client
    });

  } catch (err) {
    if (isErrnoException(err)) {
      if (err.code === 'ERR_CANCELED') {
        return 0;
      }
      if (err.code === 'ERR_INVALID_CWD' || err.code === 'ERR_LINK_PROJECT') {
        // do not show the message
        return 1;
      }
    }

    client.output.prettyError(err);
    return 1;
  }
};
