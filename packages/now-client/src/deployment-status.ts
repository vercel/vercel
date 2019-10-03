import sleep from 'sleep-promise';
import ms from 'ms';
import { fetch, API_DEPLOYMENTS, API_DEPLOYMENTS_LEGACY } from './utils';
import { isDone, isReady, isFailed } from './utils/ready-state';
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
  debug: Function
): AsyncIterableIterator<DeploymentStatus> {
  let deploymentState = deployment;
  let allBuildsCompleted = false;
  const buildsState: { [key: string]: DeploymentBuild } = {};
  let apiDeployments = version === 2 ? API_DEPLOYMENTS : API_DEPLOYMENTS_LEGACY;

  debug(`Using ${version ? `${version}.0` : '2.0'} API for status checks`);

  // If the deployment is ready, we don't want any of this to run
  if (isDone(deploymentState)) {
    debug(`Deployment is already READY. Not running status checks`);
    return;
  }

  // Build polling
  debug('Waiting for builds and the deployment to complete...');
  while (true) {
    if (!allBuildsCompleted) {
      const buildsData = await fetch(
        `${apiDeployments}/${deployment.id}/builds${
          teamId ? `?teamId=${teamId}` : ''
        }`,
        token
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
        token
      );
      const deploymentUpdate = await deploymentData.json();

      if (deploymentUpdate.error) {
        debug('Deployment status check has errorred');
        return yield { type: 'error', payload: deploymentUpdate.error };
      }

      if (isReady(deploymentUpdate)) {
        debug('Deployment state changed to READY');
        return yield { type: 'ready', payload: deploymentUpdate };
      }

      if (isFailed(deploymentUpdate)) {
        debug('Deployment has failed');
        return yield {
          type: 'error',
          payload: deploymentUpdate.error || deploymentUpdate,
        };
      }
    }

    await sleep(ms('1.5s'));
  }
}
