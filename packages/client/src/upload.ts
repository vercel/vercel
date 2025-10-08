import http from 'http';
import https from 'https';
import { Readable } from 'stream';
import { EventEmitter } from 'node:events';
import retry from 'async-retry';
import { Sema } from 'async-sema';

import { DeploymentFile, FilesMap } from './utils/hashes';
import { fetch, API_FILES, createDebug } from './utils';
import { DeploymentError } from './errors';
import { deploy } from './deploy';
import { VercelClientOptions, DeploymentOptions } from './types';

const isClientNetworkError = (err: Error) => {
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
  files: FilesMap,
  clientOptions: VercelClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<any> {
  const { token, teamId, apiUrl, userAgent } = clientOptions;
  const debug = createDebug(clientOptions.debug);

  if (!files && !token && !teamId) {
    debug(`Neither 'files', 'token' nor 'teamId are present. Exiting`);
    return;
  }

  let shas: string[] = [];

  debug('Determining necessary files for upload...');

  for await (const event of deploy(files, clientOptions, deploymentOptions)) {
    if (event.type === 'error') {
      if (event.payload.code === 'missing_files') {
        shas = event.payload.missing;

        debug(`${shas.length} files are required to upload`);
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

  const uploads = shas.map(sha => {
    return new UploadProgress(sha, files.get(sha)!);
  });

  yield {
    type: 'file-count',
    payload: { total: files, missing: shas, uploads },
  };

  const uploadList: { [key: string]: Promise<any> } = {};
  debug('Building an upload list...');

  const semaphore = new Sema(50, { capacity: 50 });
  const defaultAgent = apiUrl?.startsWith('https://')
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });
  const abortControllers = new Set<AbortController>();
  let aborted = false;

  shas.forEach((sha, index) => {
    const uploadProgress = uploads[index];

    uploadList[sha] = retry(
      async (bail): Promise<any> => {
        const file = files.get(sha);

        if (!file) {
          debug(`File ${sha} is undefined. Bailing`);
          return bail(new Error(`File ${sha} is undefined`));
        }

        await semaphore.acquire();

        if (aborted) {
          return bail(new Error('Upload aborted'));
        }

        const { data } = file;
        if (typeof data === 'undefined') {
          // Directories don't need to be uploaded
          return;
        }

        uploadProgress.bytesUploaded = 0;

        // Split out into chunks
        const body = new Readable();
        const originalRead = body.read.bind(body);
        body.read = function (...args) {
          const chunk = originalRead(...args);
          if (chunk) {
            uploadProgress.bytesUploaded += chunk.length;
            uploadProgress.emit('progress');
          }
          return chunk;
        };

        const chunkSize = 16384; /* 16kb - default Node.js `highWaterMark` */
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          body.push(chunk);
        }
        body.push(null);

        let err;
        let result;
        const abortController = new AbortController();
        abortControllers.add(abortController);

        try {
          const res = await fetch(
            API_FILES,
            token,
            {
              agent: clientOptions.agent || defaultAgent,
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': data.length,
                'x-now-digest': sha,
                'x-now-size': data.length,
              },
              body,
              teamId,
              apiUrl,
              userAgent,
              // @ts-expect-error: typescript is getting confused with the signal types from node (web & server) and node-fetch (server only)
              signal: abortController.signal,
            },
            clientOptions.debug
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
        } catch (e: any) {
          debug(`An unexpected error occurred in upload promise:\n${e}`);
          err = new Error(e);
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
            if (!aborted) {
              aborted = true;
              abortControllers.forEach(controller => controller.abort());
            }
            return bail(err);
          }
        }

        abortControllers.delete(abortController);
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
      const event = await Promise.race(Object.values(uploadList));

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

class UploadProgress extends EventEmitter {
  sha: string;
  file: DeploymentFile;
  bytesUploaded: number;
  constructor(sha: string, file: DeploymentFile) {
    super();
    this.sha = sha;
    this.file = file;
    this.bytesUploaded = 0;
  }
}
