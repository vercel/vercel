import path from 'path';
import chalk from 'chalk';
import Client from '../client';
import { Output } from '../output';
import type { User } from '@vercel-internals/types';
import { VercelConfig } from '../dev/types';
import getDeploymentsByAppName from '../deploy/get-deployments-by-appname';
import getDeployment from '../get-deployment';

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
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.id)[0];

  // Try to fetch deployment details
  if (deploymentItem) {
    return await getDeployment(client, contextName, deploymentItem.uid);
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
  localConfig?: VercelConfig
) {
  output.spinner(`Fetching deployment to alias in ${chalk.bold(contextName)}`);

  // When there are no args at all we try to get the targets from the config
  if (args.length === 2) {
    const [deploymentId] = args;
    try {
      return await getDeployment(client, contextName, deploymentId);
    } finally {
      output.stopSpinner();
    }
  }

  const appName =
    localConfig?.name ||
    path.basename(path.resolve(process.cwd(), localConfigPath || ''));

  if (!appName) {
    return null;
  }

  try {
    return await getAppLastDeployment(
      output,
      client,
      appName,
      user,
      contextName
    );
  } finally {
    output.stopSpinner();
  }
}
