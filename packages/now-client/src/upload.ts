import { createReadStream } from 'fs';
import { Agent } from 'https';
import retry from 'async-retry';
import { Sema } from 'async-sema';
import { DeploymentFile } from './utils/hashes';
import { fetch, API_FILES, createDebug } from './utils';
import { DeploymentError } from './errors';
import { deploy } from './deploy';
import { NowClientOptions, DeploymentOptions } from './types';

const isClientNetworkError = (err: Error | DeploymentError) => {
  if (err.message) {
    // These are common network errors that may happen occasionally and we should retry if we encounter these
    return (
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('EAI_FAIL') ||
      err.message.includes('socket hang up') ||
      err.message.includes('network socket disconnected')
    );
  }

  return false;
};

export async function* upload(
  files: Map<string, DeploymentFile>,
  clientOptions: NowClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<any> {
  const { token, teamId, apiUrl, userAgent } = clientOptions;
  const debug = createDebug(clientOptions.debug);

  if (!files && !token && !teamId) {
    debug(`Neither 'files', 'token' nor 'teamId are present. Exiting`);
    return;
  }

  let missingFiles = [];

  debug('Determining necessary files for upload...');

  for await (const event of deploy(files, clientOptions, deploymentOptions)) {
    if (event.type === 'error') {
      if (event.payload.code === 'missing_files') {
        missingFiles = event.payload.missing;

        debug(`${missingFiles.length} files are required to upload`);
      } else {
        return yield event;
      }
    } else {
      // If the deployment has succeeded here, don't continue
      if (event.type === 'alias-assigned') {
        debug('Deployment succeeded on file check');

        return yield event;
      }

      yield event;
    }
  }

  const shas = missingFiles;

  yield { type: 'file-count', payload: { total: files, missing: shas } };

  const uploadList: { [key: string]: Promise<any> } = {};
  debug('Building an upload list...');

  const semaphore = new Sema(50, { capacity: 50 });
  const agent = new Agent({ keepAlive: true });

  shas.map((sha: string): void => {
    uploadList[sha] = retry(
      async (bail): Promise<any> => {
        const file = files.get(sha);

        if (!file) {
          debug(`File ${sha} is undefined. Bailing`);
          return bail(new Error(`File ${sha} is undefined`));
        }

        await semaphore.acquire();

        const fPath = file.names[0];
        const stream = createReadStream(fPath);
        const { data } = file;

        let err;
        let result;

        try {
          const res = await fetch(
            API_FILES,
            token,
            {
              agent,
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': data.length,
                'x-now-digest': sha,
                'x-now-size': data.length,
              },
              body: stream,
              teamId,
              apiUrl,
              userAgent,
            },
            clientOptions.debug,
            true
          );

          if (res.status === 200) {
            debug(
              `File ${sha} (${file.names[0]}${
                file.names.length > 1 ? ` +${file.names.length}` : ''
              }) uploaded`
            );
            result = {
              type: 'file-uploaded',
              payload: { sha, file },
            };
          } else if (res.status > 200 && res.status < 500) {
            // If something is wrong with our request, we don't retry
            debug(
              `An internal error occurred in upload request. Not retrying...`
            );
            const { error } = await res.json();

            err = new DeploymentError(error);
          } else {
            // If something is wrong with the server, we retry
            debug(`A server error occurred in upload request. Retrying...`);
            const { error } = await res.json();

            throw new DeploymentError(error);
          }
        } catch (e) {
          debug(`An unexpected error occurred in upload promise:\n${e}`);
          err = new Error(e);
        } finally {
          stream.close();
          stream.destroy();
        }

        semaphore.release();

        if (err) {
          if (isClientNetworkError(err)) {
            debug('Network error, retrying: ' + err.message);
            // If it's a network error, we retry
            throw err;
          } else {
            debug('Other error, bailing: ' + err.message);
            // Otherwise we bail
            return bail(err);
          }
        }

        return result;
      },
      {
        retries: 5,
        factor: 6,
        minTimeout: 10,
      }
    );
  });

  debug('Starting upload');

  while (Object.keys(uploadList).length > 0) {
    try {
      const event = await Promise.race(
        Object.keys(uploadList).map((key): Promise<any> => uploadList[key])
      );

      delete uploadList[event.payload.sha];
      yield event;
    } catch (e) {
      return yield { type: 'error', payload: e };
    }
  }

  debug('All files uploaded');
  yield { type: 'all-files-uploaded', payload: files };

  try {
    debug('Starting deployment creation');
    for await (const event of deploy(files, clientOptions, deploymentOptions)) {
      if (event.type === 'alias-assigned') {
        debug('Deployment is ready');
        return yield event;
      }

      yield event;
    }
  } catch (e) {
    debug('An unexpected error occurred when starting deployment creation');
    yield { type: 'error', payload: e };
  }
}
