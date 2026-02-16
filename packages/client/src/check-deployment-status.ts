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

// If an error occurs, how should our retries behave?
const RETRY_COUNT = 5;
// Maximum value to cap `Retry-After` to in order to avoid hanging if we get a
// `Retry-After` value in the far future. This limit is applied before
// `RETRY_DELAY_SKEW_MS`, so the total duration can exceed this.
const RETRY_DELAY_MAX_MS = 60_000;
const RETRY_DELAY_MIN_MS = 5_000;
// We add between 0 and RETRY_DELAY_SKEW_MS of skew to the retry duration.
const RETRY_DELAY_SKEW_MS = 30_000;
const RETRY_DELAY_DEFAULT_MS = 5_000;

export function parseRetryAfterMs(response: any): number | null {
  // HTTP 429 (Too Many Requests) or 503 (Service Unavailable)
  if (response.status === 429 || response.status === 503) {
    let header: string | null = response.headers.get('Retry-After');
    if (header == null) {
      return RETRY_DELAY_DEFAULT_MS;
    }

    let retryAfterMs = Number(header) * 1000;
    if (Number.isNaN(retryAfterMs)) {
      let retryAfterDateMs = Date.parse(header);
      if (Number.isNaN(retryAfterDateMs)) {
        retryAfterMs = RETRY_DELAY_DEFAULT_MS;
      } else {
        retryAfterMs = retryAfterDateMs - Date.now();
      }
    }

    return Math.min(
      RETRY_DELAY_MAX_MS,
      Math.max(RETRY_DELAY_MIN_MS, retryAfterMs)
    );
  } else if (response.status >= 500 && response.status <= 599) {
    // HTTP 5xx: Server error, assume it's safe to retry
    return RETRY_DELAY_DEFAULT_MS;
  } else {
    return null;
  }
}

/* eslint-disable */
export async function* checkDeploymentStatus(
  deployment: Deployment,
  clientOptions: VercelClientOptions
): AsyncIterableIterator<DeploymentStatus> {
  const { token, teamId, apiUrl, userAgent } = clientOptions;
  const debug = createDebug(clientOptions.debug);

  let deploymentState = deployment;

  const apiDeployments = getApiDeploymentsUrl();

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
  const startTime = Date.now();

  // Deployment polling
  while (true) {
    let deploymentResponse: any;
    let retriesLeft = RETRY_COUNT;
    while (true) {
      deploymentResponse = await fetch(
        `${apiDeployments}/${deployment.id || deployment.deploymentId}${
          teamId ? `?teamId=${teamId}` : ''
        }`,
        token,
        { apiUrl, userAgent, dispatcher: clientOptions.dispatcher }
      );

      retriesLeft--;
      if (retriesLeft == 0) {
        break;
      }

      const retryAfterMs = parseRetryAfterMs(deploymentResponse);
      if (retryAfterMs != null) {
        // The `Retry-After` header from the api tells us when the next rate
        // limit token is available. There may only be a single rate limit token
        // available at that time. Add a random skew to prevent creating a
        // thundering herd.
        const randomSkewMs = Math.floor(RETRY_DELAY_SKEW_MS * Math.random());
        debug(
          'Received a transient error or rate limit ' +
            `(HTTP ${deploymentResponse.status}) while querying deployment ` +
            `status, retrying after ${retryAfterMs + randomSkewMs}ms ` +
            `(${retryAfterMs} + ${randomSkewMs}ms of random skew)`
        );
        await sleep(retryAfterMs + randomSkewMs);
        continue;
      }

      break;
    }
    const deploymentUpdate = await deploymentResponse.json();

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
