import { DeploymentFile } from './utils/hashes';
import {
  fetch,
  prepareFiles,
  createDebug,
  getApiDeploymentsUrl,
} from './utils';
import { checkDeploymentStatus } from './check-deployment-status';
import { generateQueryString } from './utils/query-string';
import { isReady, isAliasAssigned } from './utils/ready-state';
import {
  Deployment,
  DeploymentOptions,
  NowConfig,
  NowClientOptions,
  DeploymentEventType,
} from './types';

async function* createDeployment(
  files: Map<string, DeploymentFile>,
  clientOptions: NowClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
  const debug = createDebug(clientOptions.debug);
  const preparedFiles = prepareFiles(files, clientOptions);
  const apiDeployments = getApiDeploymentsUrl(deploymentOptions);

  debug('Sending deployment creation API request');
  try {
    const dpl = await fetch(
      `${apiDeployments}${generateQueryString(clientOptions)}`,
      clientOptions.token,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...deploymentOptions,
          files: preparedFiles,
        }),
        apiUrl: clientOptions.apiUrl,
        userAgent: clientOptions.userAgent,
      }
    );

    const json = await dpl.json();

    debug('Deployment response:', JSON.stringify(json));

    if (!dpl.ok || json.error) {
      debug('Error: Deployment request status is', dpl.status);
      // Return error object
      return yield {
        type: 'error',
        payload: json.error
          ? { ...json.error, status: dpl.status }
          : { ...json, status: dpl.status },
      };
    }

    for (const [name, value] of dpl.headers.entries()) {
      if (name.startsWith('x-now-warning-')) {
        debug('Deployment created with a warning:', value);
        yield { type: 'warning', payload: value };
      }
      if (name.startsWith('x-now-notice-')) {
        debug('Deployment created with a notice:', value);
        yield { type: 'notice', payload: value };
      }
      if (name.startsWith('x-now-tip-')) {
        debug('Deployment created with a tip:', value);
        yield { type: 'tip', payload: value };
      }
    }

    yield { type: 'created', payload: json };
  } catch (e) {
    return yield { type: 'error', payload: e };
  }
}

function getDefaultName(
  files: Map<string, DeploymentFile>,
  clientOptions: NowClientOptions
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
  files: Map<string, DeploymentFile>,
  nowConfig: NowConfig,
  clientOptions: NowClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<{ type: string; payload: any }> {
  const debug = createDebug(clientOptions.debug);

  // Check if we should default to a static deployment
  if (!deploymentOptions.version && !deploymentOptions.name) {
    deploymentOptions.version = 2;
    deploymentOptions.name =
      files.size === 1 ? 'file' : getDefaultName(files, clientOptions);

    if (deploymentOptions.name === 'file') {
      debug('Setting deployment name to "file" for single-file deployment');
    }
  }

  if (
    files.size === 1 &&
    deploymentOptions.builds === undefined &&
    deploymentOptions.routes === undefined &&
    deploymentOptions.cleanUrls === undefined &&
    deploymentOptions.rewrites === undefined &&
    deploymentOptions.redirects === undefined &&
    deploymentOptions.headers === undefined &&
    deploymentOptions.trailingSlash === undefined
  ) {
    debug(`Assigning '/' route for single file deployment`);
    const filePath = Array.from(files.values())[0].names[0];

    deploymentOptions.routes = [
      {
        src: '/',
        dest: `/${filePath.split('/').pop()}`,
      },
    ];
  }

  if (!deploymentOptions.name) {
    deploymentOptions.name =
      clientOptions.defaultName || getDefaultName(files, clientOptions);
    debug('No name provided. Defaulting to', deploymentOptions.name);
  }

  if (
    deploymentOptions.version === 1 &&
    !deploymentOptions.deploymentType &&
    nowConfig.type
  ) {
    debug(`Setting 'type' for 1.0 deployment to '${nowConfig.type}'`);
    deploymentOptions.deploymentType = nowConfig.type.toUpperCase() as DeploymentOptions['deploymentType'];
  }

  if (deploymentOptions.version === 1 && !deploymentOptions.config) {
    debug(`Writing 'config' values for 1.0 deployment`);
    deploymentOptions.config = { ...nowConfig };
    delete deploymentOptions.config.version;
  }

  if (
    deploymentOptions.version === 1 &&
    !deploymentOptions.forceNew &&
    clientOptions.force
  ) {
    debug(`Setting 'forceNew' for 1.0 deployment`);
    deploymentOptions.forceNew = clientOptions.force;
  }

  if (clientOptions.withCache) {
    debug(
      `'withCache' is provided. Force deploy will be performed with cache retention`
    );
  }

  let deployment: Deployment | undefined;

  try {
    debug('Creating deployment');
    for await (const event of createDeployment(
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
