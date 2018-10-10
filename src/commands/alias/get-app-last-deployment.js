// @flow
import { Output, Now } from '../../util/types';
import type { User } from '../../util/types';
import fetchDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';
import fetchDeploymentsByAppName from './get-deployments-by-appname';

async function getAppLastDeployment(
  output: Output,
  now: Now,
  appName: string,
  user: User,
  contextName: string
) {
  output.debug(`Looking for deployments matching app ${appName}`);
  const deployments = await fetchDeploymentsByAppName(now, appName);
  const deploymentItem = deployments
    .sort((a, b) => b.created - a.created)
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0];

  // Try to fetch deployment details
  return deploymentItem
    ? await fetchDeploymentByIdOrHost(now, contextName, deploymentItem.uid)
    : null;
}

export default getAppLastDeployment;
