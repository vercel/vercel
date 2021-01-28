import path from 'path';
import chalk from 'chalk';
import Client from '../client';
import { Output } from '../output';
import { User } from '../../types';
import { NowConfig } from '../dev/types';
import getDeploymentsByAppName from '../deploy/get-deployments-by-appname';
import getDeploymentByIdOrHost from '../deploy/get-deployment-by-id-or-host';

async function getAppLastDeployment(
  output: Output,
  client: Client,
  appName: string,
  user: User,
  contextName: string
) {
  output.debug(`Looking for deployments matching app ${appName}`);
  const deployments = await getDeploymentsByAppName(client, appName);
  const deploymentItem = deployments
    .sort((a, b) => b.created - a.created)
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0];

  // Try to fetch deployment details
  if (deploymentItem) {
    return getDeploymentByIdOrHost(client, contextName, deploymentItem.uid);
  }

  return null;
}

export async function getDeploymentForAlias(
  client: Client,
  output: Output,
  args: string[],
  localConfigPath: string | undefined,
  user: User,
  contextName: string,
  localConfig: NowConfig
) {
  output.spinner(`Fetching deployment to alias in ${chalk.bold(contextName)}`);

  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args;
    const deployment = await getDeploymentByIdOrHost(
      client,
      contextName,
      deploymentId
    );
    output.stopSpinner();
    return deployment;
  }

  const appName =
    (localConfig && localConfig.name) ||
    path.basename(path.resolve(process.cwd(), localConfigPath || ''));

  if (!appName) {
    return null;
  }

  const deployment = await getAppLastDeployment(
    output,
    client,
    appName,
    user,
    contextName
  );
  output.stopSpinner();
  return deployment;
}
