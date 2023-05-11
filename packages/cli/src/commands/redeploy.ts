import chalk from 'chalk';
import type Client from '../util/client';
// import { ensureLink } from '../util/link/ensure-link';
import getArgs from '../util/get-args';
import { getDeploymentByIdOrURL } from '../util/deploy/get-deployment-by-id-or-url';
import { getPkgName } from '../util/pkg-name';
import getScope from '../util/get-scope';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import validatePaths from '../util/validate-paths';
import { printDeploymentStatus } from '../util/deploy/print-deployment-status';
import stamp from '../util/output/stamp';

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} ${getPkgName()} redeploy`
  )} [deploymentId|deploymentName]

  Rebuild and deploy a previous deployment.

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
    --no-wait                      Don't wait for the redeploy to finish
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Redeploy a deployment using id or url

    ${chalk.cyan(`$ ${getPkgName()} redeploy <deployment id/url>`)}
`);
};

/**
 * `vc redeploy` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--debug': Boolean,
      '-d': '--debug',
      '--no-wait': Boolean,
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

  const actionOrDeployId = argv._[1] || 'status';
  const { contextName } = await getScope(client);
  const noWait = !!argv['--no-wait'];

  const fromDeployment = await getDeploymentByIdOrURL({
    client,
    contextName,
    deployId: actionOrDeployId,
  });

  const deployStamp = stamp();

  const deployment = await client.fetch<any>(`/v13/deployments?forceNew=1`, {
    body: {
      deploymentId: fromDeployment.id,
      meta: {
        action: 'redeploy',
      },
      name: fromDeployment.name,
      target: fromDeployment.target || 'production',
    },
    method: 'POST',
  });

  if (!noWait) {
    // poll until the deployment finishes
  }

  return printDeploymentStatus(client, deployment, deployStamp, noWait);
};
