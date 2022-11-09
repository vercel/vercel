import chalk from 'chalk';
import getArgs from '../util/get-args';
import getDeploymentByIdOrHost from '../util/deploy/get-deployment-by-id-or-host';
import getRollbackStatus from '../util/deploy/get-rollback-status';
import getScope from '../util/get-scope';
import { getPkgName } from '../util/pkg-name';
import handleError from '../util/handle-error';
import { isValidName } from '../util/is-valid-name';
import logo from '../util/output/logo';
import type Client from '../util/client';

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
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Show the status of any current pending rollbacks

    ${chalk.cyan(`$ ${getPkgName()} rollback`)}

  ${chalk.gray('–')} Rollback a deployment using id or url

    ${chalk.cyan(`$ ${getPkgName()} rollback <deploymnent id/url>`)}
`);
};

export default async (client: Client): Promise<number> => {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {});
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help'] || argv._[0] === 'help') {
    help();
    return 2;
  }

  const actionOrDeployId = argv._[1];

  if (actionOrDeployId === 'cancel') {
    return await cancel();
  }

  if (actionOrDeployId) {
    return await rollback(client, actionOrDeployId);
  }

  return await status(client);
};

async function cancel(): Promise<number> {
  return 0;
}

async function rollback(client: Client, deployId: string): Promise<number> {
  const { output } = client;

  if (!isValidName(deployId)) {
    output.error(
      `The provided argument "${deployId}" is not a valid deployment or project`
    );
    return 1;
  }

  const { contextName } = await getScope(client);

  output.spinner(
    `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}`
  );

  try {
    const deployment = await getDeploymentByIdOrHost(
      client,
      contextName,
      deployId
    );
    console.log(deployment);
    await getRollbackStatus(client);
  } catch (e) {
    return 1;
  } finally {
    output.stopSpinner();
  }

  // POST /api/v1/projects/:projectID/rollback/:deployId

  return 0;
}

async function status(client: Client): Promise<number> {
  const { output } = client;

  output.log(`Checking rollback status of ${'????'}`);

  // Checking rollback status of projectname requested at lastRollbackResult.requestedAt

  return 0;
}
