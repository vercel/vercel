import type Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link.js';
import handleError from '../../util/handle-error.js';
import { isErrnoException } from '@vercel/error-utils';
import ms from 'ms';
import requestPromote from './request-promote.js';
import promoteStatus from './status.js';
import { promoteCommand } from './command.js';
import { help } from '../help.js';

/**
 * `vc promote` command
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
      help(promoteCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const yes = argv['--yes'] ?? false;

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

      return await promoteStatus({
        client,
        project,
        timeout,
      });
    }

    return await requestPromote({
      client,
      deployId: actionOrDeployId,
      timeout,
      yes,
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
