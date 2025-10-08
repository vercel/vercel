import { lstatSync } from 'fs-extra';
import { isAbsolute, join, relative, sep } from 'path';
import { hash, hashes, mapToObject } from './utils/hashes';
import { upload } from './upload';
import { buildFileTree, createDebug } from './utils';
import { DeploymentError } from './errors';
import { isErrnoException } from '@vercel/error-utils';
import {
  VercelClientOptions,
  DeploymentOptions,
  DeploymentEventType,
} from './types';
import { streamToBufferChunks } from '@vercel/build-utils';
import tar from 'tar-fs';
import { createGzip } from 'zlib';

export default function buildCreateDeployment() {
  return async function* createDeployment(
    clientOptions: VercelClientOptions,
    deploymentOptions: DeploymentOptions = {}
  ): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
    const { path } = clientOptions;

    const debug = createDebug(clientOptions.debug);

    debug('Creating deployment...');

    if (typeof path !== 'string' && !Array.isArray(path)) {
      debug(
        `Error: 'path' is expected to be a string or an array. Received ${typeof path}`
      );

      throw new DeploymentError({
        code: 'missing_path',
        message: 'Path not provided',
      });
    }

    if (typeof clientOptions.token !== 'string') {
      debug(
        `Error: 'token' is expected to be a string. Received ${typeof clientOptions.token}`
      );

      throw new DeploymentError({
        code: 'token_not_provided',
        message: 'Options object must include a `token`',
      });
    }

    clientOptions.isDirectory =
      !Array.isArray(path) && lstatSync(path).isDirectory();

    if (Array.isArray(path)) {
      for (const filePath of path) {
        if (!isAbsolute(filePath)) {
          throw new DeploymentError({
            code: 'invalid_path',
            message: `Provided path ${filePath} is not absolute`,
          });
        }
      }
    } else if (!isAbsolute(path)) {
      throw new DeploymentError({
        code: 'invalid_path',
        message: `Provided path ${path} is not absolute`,
      });
    }

    if (clientOptions.isDirectory && !Array.isArray(path)) {
      debug(`Provided 'path' is a directory.`);
    } else if (Array.isArray(path)) {
      debug(`Provided 'path' is an array of file paths`);
    } else {
      debug(`Provided 'path' is a single file`);
    }

    const { fileList } = await buildFileTree(path, clientOptions, debug);

    // This is a useful warning because it prevents people
    // from getting confused about a deployment that renders 404.
    if (fileList.length === 0) {
      debug('Deployment path has no files. Yielding a warning event');
      yield {
        type: 'warning',
        payload: 'There are no files inside your deployment.',
      };
    }

    // Populate Files -> FileFsRef mapping
    const workPath = typeof path === 'string' ? path : path[0];

    let files;

    try {
      if (clientOptions.archive === 'tgz') {
        debug('Packing tarball');
        const tarStream = tar
          .pack(workPath, {
            entries: fileList.map(file => relative(workPath, file)),
          })
          .pipe(createGzip());
        const chunkedTarBuffers = await streamToBufferChunks(tarStream);
        debug(`Packed tarball into ${chunkedTarBuffers.length} chunks`);
        files = new Map(
          chunkedTarBuffers.map((chunk, index) => [
            hash(chunk),
            {
              names: [join(workPath, `.vercel/source.tgz.part${index + 1}`)],
              data: chunk,
              mode: 0o666,
            },
          ])
        );
      } else {
        files = await hashes(fileList);
      }
    } catch (err: unknown) {
      if (
        clientOptions.prebuilt &&
        isErrnoException(err) &&
        err.code === 'ENOENT' &&
        err.path
      ) {
        const errPath = relative(workPath, err.path);
        err.message = `File does not exist: "${relative(workPath, errPath)}"`;
        if (errPath.split(sep).includes('node_modules')) {
          err.message = `Please ensure project dependencies have been installed:\n${err.message}`;
        }
      }
      throw err;
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
