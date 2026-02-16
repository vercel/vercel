import { FilesMap } from './utils/hashes';
import { generateQueryString } from './utils/query-string';
import { isReady, isAliasAssigned } from './utils/ready-state';
import { checkDeploymentStatus } from './check-deployment-status';
import {
  fetch,
  prepareFiles,
  createDebug,
  getApiDeploymentsUrl,
} from './utils';
import {
  Deployment,
  DeploymentOptions,
  VercelClientOptions,
  DeploymentEventType,
} from './types';

async function* postDeployment(
  files: FilesMap,
  clientOptions: VercelClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<{
  type: DeploymentEventType;
  payload: any;
  action?: string;
  link?: string;
}> {
  const debug = createDebug(clientOptions.debug);
  const preparedFiles = prepareFiles(files, clientOptions);
  const apiDeployments = getApiDeploymentsUrl();

  if (deploymentOptions?.builds && !deploymentOptions.functions) {
    clientOptions.skipAutoDetectionConfirmation = true;
  }

  // Preview deployments are the default - no need to set `target`
  if (deploymentOptions.target === 'preview') {
    deploymentOptions.target = undefined;
  }

  // "production" environment need to use `target`,
  // otherwise use `customEnvironmentSlugOrId` for a Custom Environment
  if (deploymentOptions.target && deploymentOptions.target !== 'production') {
    deploymentOptions.customEnvironmentSlugOrId = deploymentOptions.target;
    deploymentOptions.target = undefined;
  }

  debug('Sending deployment creation API request');
  try {
    const response = await fetch(
      `${apiDeployments}${generateQueryString(clientOptions)}`,
      clientOptions.token,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...deploymentOptions,
          files: preparedFiles,
        }),
        apiUrl: clientOptions.apiUrl,
        userAgent: clientOptions.userAgent,
        dispatcher: clientOptions.dispatcher,
      }
    );

    let deployment = undefined;
    try {
      deployment = await response.json();
    } catch (error) {
      throw new Error('Invalid JSON response');
    }

    if (clientOptions.debug) {
      // Wrapped because there is no need to
      // call JSON.stringify if we don't debug.
      debug('Deployment response:', JSON.stringify(deployment));
    }

    if (!response.ok || deployment.error) {
      debug('Error: Deployment request status is', response.status);
      // Return error object
      return yield {
        type: 'error',
        payload: deployment.error
          ? { ...deployment.error, status: response.status }
          : { ...deployment, status: response.status },
      };
    }

    const indications = new Set(['warning', 'notice', 'tip']);
    const regex = /^x-(?:vercel|now)-(warning|notice|tip)-(.*)$/;
    for (const [name, payload] of response.headers.entries()) {
      const match = name.match(regex);
      if (match) {
        const [, type, identifier] = match;
        const action = response.headers.get(`x-vercel-action-${identifier}`);
        const link = response.headers.get(`x-vercel-link-${identifier}`);

        if (indications.has(type)) {
          debug(`Deployment created with a ${type}: `, payload);
          yield { type, payload, action, link };
        }
      }
    }
    yield { type: 'created', payload: deployment };
  } catch (e) {
    return yield { type: 'error', payload: e };
  }
}

function getDefaultName(
  files: FilesMap,
  clientOptions: VercelClientOptions
): string {
  const debug = createDebug(clientOptions.debug);
  const { isDirectory, path } = clientOptions;

  if (isDirectory && typeof path === 'string') {
    debug('Provided path is a directory. Using last segment as default name');
    return path.split('/').pop() || path;
  } else {
    debug(
      'Provided path is not a directory. Using last segment of the first file as default name'
    );
    const filePath = Array.from(files.values())[0].names[0];
    return filePath.split('/').pop() || filePath;
  }
}

export async function* deploy(
  files: FilesMap,
  clientOptions: VercelClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
  const debug = createDebug(clientOptions.debug);

  // Check if we should default to a static deployment
  if (!deploymentOptions.name && files.size > 0) {
    deploymentOptions.version = 2;
    deploymentOptions.name =
      files.size === 1 ? 'file' : getDefaultName(files, clientOptions);

    if (deploymentOptions.name === 'file') {
      debug('Setting deployment name to "file" for single-file deployment');
    }
  }

  if (!deploymentOptions.name && files.size > 0) {
    deploymentOptions.name =
      clientOptions.defaultName || getDefaultName(files, clientOptions);
    debug('No name provided. Defaulting to', deploymentOptions.name);
  }

  if (clientOptions.withCache) {
    debug(
      `'withCache' is provided. Force deploy will be performed with cache retention`
    );
  }

  let deployment: Deployment | undefined;

  try {
    debug('Creating deployment');
    for await (const event of postDeployment(
      files,
      clientOptions,
      deploymentOptions
    )) {
      if (event.type === 'created') {
        debug('Deployment created');
        deployment = event.payload;
      }

      yield event;
    }
  } catch (e) {
    debug('An unexpected error occurred when creating the deployment');
    return yield { type: 'error', payload: e };
  }

  /**
   * When using manual, the deployment will remain INITIALIZING until it is
   * manually continued so we skip waiting for Ready State.
   */
  if (clientOptions.manual) {
    debug('Manual mode - skipping ready state check');
    return;
  }

  if (deployment) {
    if (isReady(deployment) && isAliasAssigned(deployment)) {
      debug('Deployment state changed to READY 3');
      yield { type: 'ready', payload: deployment };

      debug('Deployment alias assigned');
      return yield { type: 'alias-assigned', payload: deployment };
    }

    try {
      debug('Waiting for deployment to be ready...');
      for await (const event of checkDeploymentStatus(
        deployment,
        clientOptions
      )) {
        yield event;
      }
    } catch (e) {
      debug(
        'An unexpected error occurred while waiting for deployment to be ready'
      );
      return yield { type: 'error', payload: e };
    }
  }
}
