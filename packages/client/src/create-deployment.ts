import { mapToObject } from './utils/hashes';
import { deploy } from './deploy';
import { upload } from './upload';
import { createDebug } from './utils';
import { DeploymentError } from './errors';
import {
  VercelClientOptions,
  DeploymentOptions,
  DeploymentEventType,
} from './types';
import {
  assertDeploymentPath,
  collectDeploymentFiles,
} from './collect-deployment-files';

export default function buildCreateDeployment() {
  return async function* createDeployment(
    clientOptions: VercelClientOptions,
    deploymentOptions: DeploymentOptions = {}
  ): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
    const { path } = clientOptions;

    const debug = createDebug(clientOptions.debug);

    debug('Creating deployment...');

    assertDeploymentPath(path, debug);

    if (typeof clientOptions.token !== 'string') {
      debug(
        `Error: 'token' is expected to be a string. Received ${typeof clientOptions.token}`
      );

      throw new DeploymentError({
        code: 'token_not_provided',
        message: 'Options object must include a `token`',
      });
    }

    /**
     * Manual deployment is an experimental feature that supports only prebuilt
     * deployments. We could implicitly pass prebuilt=true when hitting the
     * API but it is more intentional to require the user to set it.
     */
    if (clientOptions.manual) {
      debug('Manual provisioning mode enabled');
      if (!clientOptions.prebuilt) {
        throw new DeploymentError({
          code: 'invalid_options',
          message: 'The `manual` option requires `prebuilt` to be true',
        });
      }

      // Once the feature becomes stable we will use a new body parameter
      deploymentOptions.build = deploymentOptions.build || {};
      deploymentOptions.build.env = deploymentOptions.build.env || {};
      deploymentOptions.build.env.VERCEL_MANUAL_PROVISIONING = '1';
      deploymentOptions.version = 2;

      debug('Creating deployment with manual provisioning...');
      yield* deploy(new Map(), clientOptions, deploymentOptions);
      return;
    }

    const { fileList, filesMap: files } = await collectDeploymentFiles(
      path,
      clientOptions,
      debug
    );

    // This is a useful warning because it prevents people
    // from getting confused about a deployment that renders 404.
    if (fileList.length === 0) {
      debug('Deployment path has no files. Yielding a warning event');
      yield {
        type: 'warning',
        payload: 'There are no files inside your deployment.',
      };
    }

    debug(`Yielding a 'hashes-calculated' event with ${files.size} hashes`);
    yield { type: 'hashes-calculated', payload: mapToObject(files) };

    if (clientOptions.apiUrl) {
      debug(`Using provided API URL: ${clientOptions.apiUrl}`);
    }

    if (clientOptions.userAgent) {
      debug(`Using provided user agent: ${clientOptions.userAgent}`);
    }

    debug(`Setting platform version to harcoded value 2`);
    deploymentOptions.version = 2;

    debug(`Creating the deployment and starting upload...`);
    for await (const event of upload(files, clientOptions, deploymentOptions)) {
      debug(`Yielding a '${event.type}' event`);
      yield event;
    }
  };
}
