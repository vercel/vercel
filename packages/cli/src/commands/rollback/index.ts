import type Client from '../../util/client';
import getArgs from '../../util/get-args';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import handleError from '../../util/handle-error';
import { isErrnoException } from '@vercel/error-utils';
import ms from 'ms';
import requestRollback from './request-rollback';
import rollbackStatus from './status';
import { help } from '../help';
import { rollbackCommand } from './command';

/**
 * `vc rollback` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--timeout': String,
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help'] || argv._[0] === 'help') {
    client.output.print(
      help(rollbackCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  // validate the timeout
  let timeout = argv['--timeout'];
  if (timeout && ms(timeout) === undefined) {
    client.output.error(`Invalid timeout "${timeout}"`);
    return 1;
  }

  const actionOrDeployId = argv._[1] || 'status';

  try {
    if (actionOrDeployId === 'status') {
      const project = await getProjectByCwdOrLink({
        autoConfirm: Boolean(argv['--yes']),
        client,
        commandName: 'promote',
        cwd: client.cwd,
        projectNameOrId: argv._[2],
      });

      return await rollbackStatus({
        client,
        project,
        timeout,
      });
    }

    return await requestRollback({
      client,
      deployId: actionOrDeployId,
      timeout,
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
