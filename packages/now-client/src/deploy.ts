import { DeploymentFile } from './utils/hashes';
import {
  parseNowJSON,
  fetch,
  API_DEPLOYMENTS,
  prepareFiles,
  API_DEPLOYMENTS_LEGACY,
  createDebug,
} from './utils';
import checkDeploymentStatus from './deployment-status';
import { generateQueryString } from './utils/query-string';

export interface Options {
  metadata: DeploymentOptions;
  totalFiles: number;
  path: string | string[];
  token: string;
  teamId?: string;
  force?: boolean;
  isDirectory?: boolean;
  defaultName?: string;
  preflight?: boolean;
  debug?: boolean;
}

async function* createDeployment(
  metadata: DeploymentOptions,
  files: Map<string, DeploymentFile>,
  options: Options,
  debug: Function
): AsyncIterableIterator<{ type: string; payload: any }> {
  const preparedFiles = prepareFiles(files, options);

  let apiDeployments =
    metadata.version === 2 ? API_DEPLOYMENTS : API_DEPLOYMENTS_LEGACY;

  debug('Sending deployment creation API request');
  try {
    const dpl = await fetch(
      `${apiDeployments}${generateQueryString(options)}`,
      options.token,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify({
          ...metadata,
          files: preparedFiles,
        }),
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
    }

    yield { type: 'created', payload: json };
  } catch (e) {
    return yield { type: 'error', payload: e };
  }
}

const getDefaultName = (
  path: string | string[] | undefined,
  isDirectory: boolean | undefined,
  files: Map<string, DeploymentFile>,
  debug: Function
): string => {
  if (isDirectory && typeof path === 'string') {
    debug('Provided path is a directory. Using last segment as default name');
    const segments = path.split('/');

    return segments[segments.length - 1];
  } else {
    debug(
      'Provided path is not a directory. Using last segment of the first file as default name'
    );
    const filePath = Array.from(files.values())[0].names[0];
    const segments = filePath.split('/');

    return segments[segments.length - 1];
  }
};

export default async function* deploy(
  files: Map<string, DeploymentFile>,
  options: Options
): AsyncIterableIterator<{ type: string; payload: any }> {
  const debug = createDebug(options.debug);
  delete options.debug;

  debug(`Trying to read 'now.json'`);
  const nowJson: DeploymentFile | undefined = Array.from(files.values()).find(
    (file: DeploymentFile): boolean => {
      return Boolean(
        file.names.find((name: string): boolean => name.includes('now.json'))
      );
    }
  );

  debug(`'now.json' ${nowJson ? 'found' : "doesn't exist"}`);

  const nowJsonMetadata: NowJsonOptions = parseNowJSON(nowJson);

  delete nowJsonMetadata.github;
  delete nowJsonMetadata.scope;

  const meta = options.metadata || {};
  const metadata = { ...nowJsonMetadata, ...meta };
  if (nowJson) {
    debug(
      `Merged 'now.json' metadata and locally provided metadata:`,
      JSON.stringify(metadata)
    );
  }

  // Check if we should default to a static deployment
  if (!metadata.version && !metadata.name) {
    metadata.version = 2;
    metadata.name =
      options.totalFiles === 1
        ? 'file'
        : getDefaultName(options.path, options.isDirectory, files, debug);

    if (metadata.name === 'file') {
      debug('Setting deployment name to "file" for single-file deployment');
    }
  }

  if (options.totalFiles === 1 && !metadata.builds && !metadata.routes) {
    debug(`Assigning '/' route for single file deployment`);
    const filePath = Array.from(files.values())[0].names[0];
    const segments = filePath.split('/');

    metadata.routes = [
      {
        src: '/',
        dest: `/${segments[segments.length - 1]}`,
      },
    ];
  }

  if (!metadata.name) {
    metadata.name =
      options.defaultName ||
      getDefaultName(options.path, options.isDirectory, files, debug);
    debug('No name provided. Defaulting to', metadata.name);
  }

  if (metadata.version === 1 && !metadata.deploymentType) {
    debug(`Setting 'type' for 1.0 deployment to '${nowJsonMetadata.type}'`);
    metadata.deploymentType = nowJsonMetadata.type;
  }

  if (metadata.version === 1) {
    debug(`Writing 'config' values for 1.0 deployment`);
    const nowConfig = { ...nowJsonMetadata };
    delete nowConfig.version;

    metadata.config = {
      ...nowConfig,
      ...metadata.config,
    };
  }

  let deployment: Deployment | undefined;

  try {
    debug('Creating deployment');
    for await (const event of createDeployment(
      metadata,
      files,
      options,
      debug
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
    if (deployment.readyState === 'READY') {
      debug('Deployment is READY. Not performing additional polling');
      return yield { type: 'ready', payload: deployment };
    }

    try {
      debug('Waiting for deployment to be ready...');
      for await (const event of checkDeploymentStatus(
        deployment,
        options.token,
        metadata.version,
        options.teamId,
        debug
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
