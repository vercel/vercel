import getDeploymentByIdOrHost from './get-deployment-by-id-or-host';
import getDeploymentsByAppName from './get-deployments-by-appname';
import { Output } from '../output';
import Client from '../client';
import { User } from '../../types';

export default async function getAppLastDeployment(
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
