import { isErrnoException } from '@vercel/error-utils';
import { lstatSync } from 'fs-extra';
import { isAbsolute, relative, sep } from 'path';
import { DeploymentError } from './errors';
import type { VercelClientOptions } from './types';
import { buildFileTree, type Debug } from './utils';
import { createTgzFiles } from './utils/archive';
import { hashes, type FilesMap } from './utils/hashes';

type CollectDeploymentFilesOptions = Pick<
  VercelClientOptions,
  | 'archive'
  | 'bulkRedirectsPath'
  | 'isDirectory'
  | 'prebuilt'
  | 'projectName'
  | 'rootDirectory'
  | 'vercelOutputDir'
>;

export interface CollectedDeploymentFiles {
  fileList: string[];
  filesMap: FilesMap;
  workPath: string;
  isDirectory: boolean;
  ignoreList: string[];
}

export function assertDeploymentPath(
  path: VercelClientOptions['path'] | undefined,
  debug: Debug
): asserts path is VercelClientOptions['path'] {
  if (typeof path !== 'string' && !Array.isArray(path)) {
    debug(
      `Error: 'path' is expected to be a string or an array. Received ${typeof path}`
    );
    throw new DeploymentError({
      code: 'missing_path',
      message: 'Path not provided',
    });
  }
}

export async function collectDeploymentFiles(
  path: VercelClientOptions['path'] | undefined,
  clientOptions: CollectDeploymentFilesOptions,
  debug: Debug
): Promise<CollectedDeploymentFiles> {
  assertDeploymentPath(path, debug);

  const isDirectory = !Array.isArray(path) && lstatSync(path).isDirectory();
  clientOptions.isDirectory = isDirectory;

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

  if (isDirectory && !Array.isArray(path)) {
    debug(`Provided 'path' is a directory.`);
  } else if (Array.isArray(path)) {
    debug(`Provided 'path' is an array of file paths`);
  } else {
    debug(`Provided 'path' is a single file`);
  }

  const { fileList, ignoreList } = await buildFileTree(
    path,
    clientOptions,
    debug
  );
  const workPath = typeof path === 'string' ? path : path[0];

  let filesMap: FilesMap;
  try {
    filesMap =
      clientOptions.archive === 'tgz'
        ? await createTgzFiles(workPath, fileList, debug)
        : await hashes(fileList);
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

  return { fileList, filesMap, workPath, isDirectory, ignoreList };
}
