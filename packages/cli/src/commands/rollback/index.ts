import chalk from 'chalk';
import type Client from '../../util/client';
import getArgs from '../../util/get-args';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import { packageName, logo } from '../../util/pkg-name';
import handleError from '../../util/handle-error';
import { isErrnoException } from '@vercel/error-utils';
import ms from 'ms';
import requestRollback from './request-rollback';
import rollbackStatus from './status';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${packageName} rollback`)} [deployment id/url]

  Quickly revert back to a previous deployment.

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --no-color                     No color mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    --timeout=${chalk.bold.underline(
      'TIME'
    )}                 Time to wait for rollback completion [3m]
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Show the status of any current pending rollbacks

    ${chalk.cyan(`$ ${packageName} rollback`)}
    ${chalk.cyan(`$ ${packageName} rollback status`)}
    ${chalk.cyan(`$ ${packageName} rollback status <project>`)}
    ${chalk.cyan(`$ ${packageName} rollback status --timeout 30s`)}

  ${chalk.gray('–')} Rollback a deployment using id or url

    ${chalk.cyan(`$ ${packageName} rollback <deployment id/url>`)}
`);
};

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
    help();
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
