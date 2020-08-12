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
import { createDebug } from './utils';
import {
  Deployment,
  NowClientOptions,
  DeploymentBuild,
  DeploymentEventType,
} from './types';

interface DeploymentStatus {
  type: DeploymentEventType;
  payload: Deployment | DeploymentBuild[];
}

/* eslint-disable */
export async function* checkDeploymentStatus(
  deployment: Deployment,
  clientOptions: NowClientOptions
): AsyncIterableIterator<DeploymentStatus> {
  const { token, teamId, apiUrl, userAgent } = clientOptions;
  const debug = createDebug(clientOptions.debug);

  let deploymentState = deployment;

  const apiDeployments = getApiDeploymentsUrl({
    builds: deployment.builds,
    functions: deployment.functions,
  });

  // If the deployment is ready, we don't want any of this to run
  if (isDone(deploymentState) && isAliasAssigned(deploymentState)) {
    debug(
      `Deployment is already READY and aliases are assigned. Not running status checks`
    );
    return;
  }

  // Build polling
  debug('Waiting for builds and the deployment to complete...');
  const finishedEvents = new Set();

  while (true) {
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

    if (
      deploymentUpdate.readyState === 'BUILDING' &&
      !finishedEvents.has('building')
    ) {
      debug('Deployment state changed to BUILDING');
      finishedEvents.add('building');
      yield { type: 'building', payload: deploymentUpdate };
    }

    if (
      deploymentUpdate.readyState === 'CANCELED' &&
      !finishedEvents.has('canceled')
    ) {
      debug('Deployment state changed to CANCELED');
      finishedEvents.add('canceled');
      yield { type: 'canceled', payload: deploymentUpdate };
    }

    if (isReady(deploymentUpdate) && !finishedEvents.has('ready')) {
      debug('Deployment state changed to READY');
      finishedEvents.add('ready');
      yield { type: 'ready', payload: deploymentUpdate };
    }

    if (isAliasAssigned(deploymentUpdate)) {
      if (
        deploymentUpdate.aliasWarning &&
        deploymentUpdate.aliasWarning.message
      ) {
        yield {
          type: 'warning',
          payload: deploymentUpdate.aliasWarning.message,
        };
      }

      debug('Deployment alias assigned');
      return yield { type: 'alias-assigned', payload: deploymentUpdate };
    }

    if (isAliasError(deploymentUpdate)) {
      return yield { type: 'error', payload: deploymentUpdate.aliasError };
    }

    if (
      deploymentUpdate.readyState === 'ERROR' &&
      deploymentUpdate.errorCode === 'BUILD_FAILED'
    ) {
      return yield { type: 'error', payload: deploymentUpdate };
    }

    if (isFailed(deploymentUpdate)) {
      return yield {
        type: 'error',
        payload: deploymentUpdate.error || deploymentUpdate,
      };
    }

    await sleep(ms('1.5s'));
  }
}
