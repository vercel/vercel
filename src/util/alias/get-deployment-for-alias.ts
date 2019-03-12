import chalk from 'chalk';

import getAppLastDeployment from '../deploy/get-app-last-deployment';
import getAppName from '../deploy/get-app-name';
import fetchDeploymentByIdOrHost from '../../util/deploy/get-deployment-by-id-or-host';
import wait from '../../util/output/wait';
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
  const cancelWait = wait(
    `Fetching deployment to alias in ${chalk.bold(contextName)}`
  );
  let deployment;

  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args;
    deployment = await fetchDeploymentByIdOrHost(
      client,
      contextName,
      deploymentId
    );
  } else {
    const appName = await getAppName(output, localConfig, localConfigPath);
    deployment = await getAppLastDeployment(
      output,
      client,
      appName,
      user,
      contextName
    );
  }

  cancelWait();
  return deployment;
}
