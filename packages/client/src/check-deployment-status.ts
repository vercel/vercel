import sleep from 'sleep-promise';
import { fetch, getApiDeploymentsUrl } from './utils';
import { getPollingDelay } from './utils/get-polling-delay';
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
  VercelClientOptions,
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
  clientOptions: VercelClientOptions
): AsyncIterableIterator<DeploymentStatus> {
  const { token, teamId, apiUrl, userAgent } = clientOptions;
  const debug = createDebug(clientOptions.debug);
  const apiDeployments = getApiDeploymentsUrl();

  // If the deployment is ready, we don't want any of this to run
  if (isDone(deployment) && isAliasAssigned(deployment)) {
    debug(
      `Deployment is already READY and aliases are assigned. Not running status checks`
    );
    return;
  }

  // Build polling
  debug('Waiting for builds and the deployment to complete...');
  const finishedEvents = new Set();
  const startTime = Date.now();

  while (true) {
    // Deployment polling
    const deploymentData = await fetch(
      `${apiDeployments}/${deployment.id || deployment.deploymentId}${
        teamId ? `?teamId=${teamId}` : ''
      }`,
      token,
      { apiUrl, userAgent, agent: clientOptions.agent }
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

    if (deploymentUpdate.checksState !== undefined) {
      if (
        deploymentUpdate.checksState === 'completed' &&
        !finishedEvents.has('checks-completed')
      ) {
        finishedEvents.add('checks-completed');

        if (deploymentUpdate.checksConclusion === 'succeeded') {
          yield {
            type: 'checks-conclusion-succeeded',
            payload: deploymentUpdate,
          };
        } else if (deploymentUpdate.checksConclusion === 'failed') {
          yield { type: 'checks-conclusion-failed', payload: deploymentUpdate };
        } else if (deploymentUpdate.checksConclusion === 'skipped') {
          yield {
            type: 'checks-conclusion-skipped',
            payload: deploymentUpdate,
          };
        } else if (deploymentUpdate.checksConclusion === 'canceled') {
          yield {
            type: 'checks-conclusion-canceled',
            payload: deploymentUpdate,
          };
        }
      }

      if (
        deploymentUpdate.checksState === 'registered' &&
        !finishedEvents.has('checks-registered')
      ) {
        finishedEvents.add('checks-registered');
        yield { type: 'checks-registered', payload: deploymentUpdate };
      }

      if (
        deploymentUpdate.checksState === 'running' &&
        !finishedEvents.has('checks-running')
      ) {
        finishedEvents.add('checks-running');
        yield { type: 'checks-running', payload: deploymentUpdate };
      }
    }

    if (isAliasAssigned(deploymentUpdate)) {
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

    const elapsed = Date.now() - startTime;
    const duration = getPollingDelay(elapsed);
    await sleep(duration);
  }
}
