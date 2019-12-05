import sleep from 'sleep-promise';
import ms from 'ms';
import { fetch, getApiDeploymentsUrl } from './utils';
import {
  isDone,
  isReady,
  isFailed,
  isAliasAssigned,
  isAliasError,
} from './utils/ready-state';
import { Deployment, DeploymentBuild } from './types';

interface DeploymentStatus {
  type: string;
  payload: Deployment | DeploymentBuild[];
}

/* eslint-disable */
export default async function* checkDeploymentStatus(
  deployment: Deployment,
  token: string,
  version: number | undefined,
  teamId: string | undefined,
  debug: Function,
  apiUrl?: string,
  userAgent?: string
): AsyncIterableIterator<DeploymentStatus> {
  let deploymentState = deployment;
  let allBuildsCompleted = false;
  const buildsState: { [key: string]: DeploymentBuild } = {};

  const apiDeployments = getApiDeploymentsUrl({
    version,
    builds: deployment.builds,
    functions: deployment.functions,
  });

  debug(`Using ${version ? `${version}.0` : '2.0'} API for status checks`);

  // If the deployment is ready, we don't want any of this to run
  if (isDone(deploymentState) && isAliasAssigned(deploymentState)) {
    debug(
      `Deployment is already READY and aliases are assigned. Not running status checks`
    );
    return;
  }

  // Build polling
  debug('Waiting for builds and the deployment to complete...');
  let readyEventFired = false;
  while (true) {
    if (!allBuildsCompleted) {
      const buildsData = await fetch(
        `${apiDeployments}/${deployment.id}/builds${
          teamId ? `?teamId=${teamId}` : ''
        }`,
        token,
        { apiUrl, userAgent }
      );

      const data = await buildsData.json();
      const { builds = [] } = data;

      for (const build of builds) {
        const prevState = buildsState[build.id];

        if (!prevState || prevState.readyState !== build.readyState) {
          debug(
            `Build state for '${build.entrypoint}' changed to ${build.readyState}`
          );
          yield { type: 'build-state-changed', payload: build };
        }

        if (build.readyState.includes('ERROR')) {
          debug(`Build '${build.entrypoint}' has errorred`);
          return yield { type: 'error', payload: build };
        }

        buildsState[build.id] = build;
      }

      const readyBuilds = builds.filter((b: DeploymentBuild) => isDone(b));

      if (readyBuilds.length === builds.length) {
        debug('All builds completed');
        allBuildsCompleted = true;
        yield { type: 'all-builds-completed', payload: readyBuilds };
      }
    } else {
      // Deployment polling
      const deploymentData = await fetch(
        `${apiDeployments}/${deployment.id || deployment.deploymentId}${
          teamId ? `?teamId=${teamId}` : ''
        }`,
        token,
        { apiUrl, userAgent }
      );
      const deploymentUpdate = await deploymentData.json();

      if (deploymentUpdate.error) {
        debug('Deployment status check has errorred');
        return yield { type: 'error', payload: deploymentUpdate.error };
      }

      if (isReady(deploymentUpdate) && !readyEventFired) {
        debug('Deployment state changed to READY 2');
        readyEventFired = true;
        yield { type: 'ready', payload: deploymentUpdate };
      }

      if (isAliasAssigned(deploymentUpdate)) {
        debug('Deployment alias assigned');
        return yield { type: 'alias-assigned', payload: deploymentUpdate };
      }

      const aliasError = isAliasError(deploymentUpdate);

      if (isFailed(deploymentUpdate) || aliasError) {
        debug(
          aliasError
            ? 'Alias assignment error has occurred'
            : 'Deployment has failed'
        );
        return yield {
          type: 'error',
          payload: aliasError
            ? deploymentUpdate.aliasError
            : deploymentUpdate.error || deploymentUpdate,
        };
      }
    }

    await sleep(ms('1.5s'));
  }
}
