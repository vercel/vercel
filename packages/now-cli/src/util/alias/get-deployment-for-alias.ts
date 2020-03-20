import chalk from 'chalk';

import getAppLastDeployment from '../deploy/get-app-last-deployment';
import getAppName from '../deploy/get-app-name';
import fetchDeploymentByIdOrHost from '../deploy/get-deployment-by-id-or-host';
import Client from '../client';
import { Output } from '../output';
import { User, Config } from '../../types';

export default async function getDeploymentForAlias(
  client: Client,
  output: Output,
  args: string[],
  localConfigPath: string | undefined,
  user: User,
  contextName: string,
  localConfig: Config
) {
  const cancelWait = output.spinner(
    `Fetching deployment to alias in ${chalk.bold(contextName)}`
  );

  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args;
    const deployment = await fetchDeploymentByIdOrHost(
      client,
      contextName,
      deploymentId
    );
    cancelWait();
    return deployment;
  }

  const appName = await getAppName(output, localConfig, localConfigPath);

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
  cancelWait();
  return deployment;
}
