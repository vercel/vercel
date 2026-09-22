import { createReadStream } from 'fs';
import { Readable, Transform } from 'stream';
import { EventEmitter } from 'node:events';
import retry from 'async-retry';
import { Sema } from 'async-sema';

import { DeploymentFile, FilesMap } from './utils/hashes';
import { fetchApi, API_FILES, createDebug } from './utils';
import { DeploymentError } from './errors';
import { deploy } from './deploy';
import type {
  FetchDispatcher,
  VercelClientOptions,
  DeploymentOptions,
  DeploymentEventType,
} from './types';

const isClientNetworkError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false;
  }

  if (err.message) {
    // These are common network errors that may happen occasionally and we should retry if we encounter these
    const matches =
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('EAI_FAIL') ||
      err.message.includes('socket hang up') ||
      err.message.includes('network socket disconnected');
    if (matches) {
      return true;
    }
  }

  // Native `fetch` reports network failures as `TypeError: fetch failed` and
  // carries the underlying error (with the code) in `cause`.
  return isClientNetworkError((err as { cause?: unknown }).cause);
};

export async function* upload(
  files: FilesMap,
  clientOptions: VercelClientOptions,
  deploymentOptions: DeploymentOptions
): AsyncIterableIterator<any> {
  const debug = createDebug(clientOptions.debug);

  if (!files && !clientOptions.token && !clientOptions.teamId) {
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
      // If the deployment has succeeded or v2 checks failed, don't continue
      if (
        event.type === 'alias-assigned' ||
        event.type === 'checks-v2-failed'
      ) {
        debug(
          event.type === 'alias-assigned'
            ? 'Deployment succeeded on file check'
            : 'v2 deployment-alias check failed on file check'
        );

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

  const uploadGenerator = uploadFiles({
    dispatcher: clientOptions.dispatcher,
    apiUrl: clientOptions.apiUrl,
    debug: clientOptions.debug,
    teamId: clientOptions.teamId,
    token: clientOptions.token,
    userAgent: clientOptions.userAgent,
    files,
    shas,
    uploads,
  });

  for await (const event of uploadGenerator) {
    if (event.type === 'error') {
      return yield event;
    } else {
      yield event;
    }
  }

  debug('All files uploaded');
  yield { type: 'all-files-uploaded', payload: files };

  try {
    debug('Starting deployment creation');
    for await (const event of deploy(files, clientOptions, deploymentOptions)) {
      if (
        event.type === 'alias-assigned' ||
        event.type === 'checks-v2-failed'
      ) {
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

/**
 * Uploads files to the /v2/files endpoint with retry and fault tolerance.
 */
export async function* uploadFiles(options: {
  dispatcher?: FetchDispatcher;
  apiUrl?: string;
  debug?: boolean;
  files: FilesMap;
  shas: string[];
  teamId?: string;
  token: string;
  uploads: UploadProgress[];
  userAgent?: string;
}): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
  const debug = createDebug(options.debug);

  const uploadList: { [key: string]: Promise<any> } = {};
  debug('Building an upload list...');

  const semaphore = new Sema(50, { capacity: 50 });
  const abortControllers = new Set<AbortController>();
  let aborted = false;

  options.shas.forEach((sha, index) => {
    const uploadProgress = options.uploads[index];

    uploadList[sha] = retry(
      async (bail): Promise<any> => {
        const file = options.files.get(sha);

        if (!file) {
          debug(`File ${sha} is undefined. Bailing`);
          return bail(new Error(`File ${sha} is undefined`));
        }

        await semaphore.acquire();

        if (aborted) {
          semaphore.release();
          return bail(new Error('Upload aborted'));
        }

        const { data, size, names } = file;

        uploadProgress.bytesUploaded = 0;

        let body: Readable;
        let contentLength: number;

        // Count bytes for progress reporting as chunks flow through, instead
        // of intercepting reads: native `fetch` may drain the entire stream
        // in a single `read()`, which would collapse progress to one jump.
        const counter = new Transform({
          transform(chunk, _encoding, callback) {
            uploadProgress.bytesUploaded += chunk.length;
            uploadProgress.emit('progress');
            callback(null, chunk);
          },
        });

        if (typeof data !== 'undefined') {
          contentLength = data.length;

          // Split the in-memory buffer out into chunks.
          const chunkSize = 16384; /* 16kb - default Node.js `highWaterMark` */
          function* chunks() {
            for (let i = 0; i < data!.length; i += chunkSize) {
              yield data!.slice(i, i + chunkSize);
            }
          }
          const buffered = Readable.from(chunks());
          buffered.on('error', err => counter.destroy(err));
          body = buffered.pipe(counter);
        } else if (typeof size === 'number') {
          // File too large to hold in memory (see hashes.ts): stream it from
          // disk. A fresh stream is created on each `retry` attempt, and bytes
          // are counted as they flow through for progress reporting.
          contentLength = size;
          const fileStream = createReadStream(names[0]);
          fileStream.on('error', err => counter.destroy(err));
          counter.on('close', () => fileStream.destroy());
          body = fileStream.pipe(counter);
        } else {
          /**
           * Note: This branch is unreachable. Directories have undefined hash
           * in FilesMap and are filtered out by mapToObject before being sent
           * to the server, so they can't appear in the missing_files response.
           */
          semaphore.release();
          return;
        }

        let err;
        let result;
        const abortController = new AbortController();
        abortControllers.add(abortController);

        try {
          const res = await fetchApi(
            API_FILES,
            options.token,
            {
              dispatcher: options.dispatcher,
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(contentLength),
                'x-now-digest': sha,
                'x-now-size': String(contentLength),
              },
              body,
              teamId: options.teamId,
              apiUrl: options.apiUrl,
              userAgent: options.userAgent,
              signal: abortController.signal,
            },
            options.debug
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
          // Preserve the original error: native `fetch` reports the network
          // error code in `cause`, which wrapping would discard.
          err = e instanceof Error ? e : new Error(String(e));
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
}

export class UploadProgress extends EventEmitter {
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
