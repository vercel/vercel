import chalk from 'chalk';
import type Client from '../util/client';
import { ensureLink } from '../util/link/ensure-link';
import getArgs from '../util/get-args';
import { getPkgName } from '../util/pkg-name';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import ms from 'ms';
import requestRollback from '../util/rollback/request-rollback';
import rollbackStatus from '../util/rollback/status';
import validatePaths from '../util/validate-paths';

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} ${getPkgName()} rollback`
  )} [deploymentId|deploymentName]

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

    ${chalk.cyan(`$ ${getPkgName()} rollback`)}
    ${chalk.cyan(`$ ${getPkgName()} rollback status`)}
    ${chalk.cyan(`$ ${getPkgName()} rollback status --timeout 30s`)}

  ${chalk.gray('–')} Rollback a deployment using id or url

    ${chalk.cyan(`$ ${getPkgName()} rollback <deployment id/url>`)}
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
      '--debug': Boolean,
      '-d': '--debug',
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

  // ensure the current directory is good
  const cwd = argv['--cwd'] || process.cwd();
  const pathValidation = await validatePaths(client, [cwd]);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }

  // ensure the current directory is a linked project
  const linkedProject = await ensureLink(
    'rollback',
    client,
    pathValidation.path,
    {
      autoConfirm: Boolean(argv['--yes']),
    }
  );
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  // validate the timeout
  let timeout = argv['--timeout'];
  if (timeout && ms(timeout) === undefined) {
    client.output.error(`Invalid timeout "${timeout}"`);
    return 1;
  }

  const { project } = linkedProject;
  const actionOrDeployId = argv._[1] || 'status';

  if (actionOrDeployId === 'status') {
    return await rollbackStatus({
      client,
      project,
      timeout,
    });
  }

  return await requestRollback({
    client,
    deployId: actionOrDeployId,
    project,
    timeout,
  });
};
