import { lstatSync } from 'fs-extra';
import { isAbsolute, join, relative, sep } from 'path';
import { FilesMap, hash, hashes, mapToObject } from './utils/hashes';
import { upload } from './upload';
import { deploy } from './deploy';
import {
  buildFileTree,
  createDebug,
  queryMissingFiles,
  prepareFiles,
  getInlineFiles,
  getDefaultDeploymentName,
  getPreUploadedFiles,
} from './utils';
import { DeploymentError } from './errors';
import { isErrnoException } from '@vercel/error-utils';
import type {
  VercelClientOptions,
  DeploymentOptions,
  DeploymentEventType,
} from './types';
import { streamToBufferChunks } from '@vercel/build-utils';
import tar from 'tar-fs';
import { createGzip } from 'zlib';

// Maximum size of all the files combined that we can upload inline, when creating
// a deployment.
const MAX_INLINE_SIZE = 250 * 1024; // 250KB

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

    let files: FilesMap;
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

    const defaultDeploymentName = getDefaultDeploymentName(
      files,
      clientOptions
    );

    if (clientOptions.apiUrl) {
      debug(`Using provided API URL: ${clientOptions.apiUrl}`);
    }

    if (clientOptions.userAgent) {
      debug(`Using provided user agent: ${clientOptions.userAgent}`);
    }

    debug(`Setting platform version to harcoded value 2`);
    deploymentOptions.version = 2;

    // Scan the `files` map and extract only the information that will be required
    // to pre-upload the files or upload them inline.
    const preparedFiles = prepareFiles(files, clientOptions);
    const totalSize = preparedFiles.reduce((sum, file) => sum + file.size, 0);
    debug(
      `Total file size: ${totalSize} bytes (${preparedFiles.length} files to upload)`
    );

    // Strategy 1: If total size of all the files combined is less than 250KB,
    // upload all files as inline (in the same POST deployment query).
    if (totalSize < MAX_INLINE_SIZE) {
      debug('All files are small enough for inline upload');
      const inlineFiles = getInlineFiles(preparedFiles);
      for await (const event of deploy(
        defaultDeploymentName,
        clientOptions,
        deploymentOptions,
        { inline: inlineFiles, preUploaded: [] }
      )) {
        debug(`Yielding a '${event.type}' event`);
        yield event as any;
      }
      return;
    }

    // If we could not use strategy 1, fetch the SHA of all the missing files
    // that need to be uploaded.
    debug(
      'Files are too large for direct inline upload, querying missing files...'
    );
    let missingShas: string[];
    const allShas = preparedFiles.map(f => f.sha);
    try {
      missingShas = (await queryMissingFiles(
        allShas,
        clientOptions
      )) as string[];
    } catch (err) {
      debug(`Failed to query missing files - Error: ${err}`);
      missingShas = allShas;
    }

    const missingFiles = preparedFiles.filter(f => missingShas.includes(f.sha));
    const existingFiles = preparedFiles.filter(
      f => !missingShas.includes(f.sha)
    );
    const missingFilesTotalSize = missingFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
    debug(
      `Missing files size: ${missingFilesTotalSize} bytes (${missingFiles.length} files)`
    );

    // Strategy 2: If total size of all the missing files combined is less than 250KB,
    // upload all the missing files as inline (in the same POST deployment query).
    if (missingFilesTotalSize < MAX_INLINE_SIZE) {
      debug('Missing files are small enough for inline upload');
      const inlineFiles = getInlineFiles(missingFiles);
      const preUploadedFiles = getPreUploadedFiles(existingFiles);
      for await (const event of deploy(
        defaultDeploymentName,
        clientOptions,
        deploymentOptions,
        { inline: inlineFiles, preUploaded: preUploadedFiles }
      )) {
        debug(`Yielding a '${event.type}' event`);
        yield event as any;
      }
      return;
    }

    // Strategy 3: Not implemented yet, TODO.
    // If total size of all the missing files combined is more than 250KB,
    // use a hybrid approach: upload smaller files inline (up to 250KB of total combined
    // size), and larger files separately.
    //
    // Now, we are just defaulting to the previous method: try to create the deployment,
    // get the missing files and proceed to pre-upload all of them.
    debug(`Creating the deployment and starting upload...`);
    for await (const event of upload(files, clientOptions, deploymentOptions)) {
      debug(`Yielding a '${event.type}' event`);
      yield event;
    }
  };
}
