import { readdir as readRootFolder, lstatSync } from 'fs-extra';

import readdir from 'recursive-readdir';
import { relative, join } from 'path';
import hashes, { mapToObject } from './utils/hashes';
import uploadAndDeploy from './upload';
import { getNowIgnore, createDebug, parseNowJSON } from './utils';
import { DeploymentError } from './errors';
import {
  CreateDeploymentFunction,
  DeploymentOptions,
  NowJsonOptions,
} from './types';

export { EVENTS } from './utils';

export default function buildCreateDeployment(
  version: number
): CreateDeploymentFunction {
  return async function* createDeployment(
    path: string | string[],
    options: DeploymentOptions = {},
    nowConfig?: NowJsonOptions
  ): AsyncIterableIterator<any> {
    const debug = createDebug(options.debug);
    const cwd = process.cwd();

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

    if (typeof options.token !== 'string') {
      debug(
        `Error: 'token' is expected to be a string. Received ${typeof options.token}`
      );

      throw new DeploymentError({
        code: 'token_not_provided',
        message: 'Options object must include a `token`',
      });
    }

    const isDirectory = !Array.isArray(path) && lstatSync(path).isDirectory();

    let rootFiles: string[];

    if (isDirectory && !Array.isArray(path)) {
      debug(`Provided 'path' is a directory. Reading subpaths... `);
      rootFiles = await readRootFolder(path);
      debug(`Read ${rootFiles.length} subpaths`);
    } else if (Array.isArray(path)) {
      debug(`Provided 'path' is an array of file paths`);
      rootFiles = path;
    } else {
      debug(`Provided 'path' is a single file`);
      rootFiles = [path];
    }

    // Get .nowignore
    let ig = await getNowIgnore(path);

    debug(`Found ${ig.ignores.length} rules in .nowignore`);

    let fileList: string[];

    debug('Building file tree...');

    if (isDirectory && !Array.isArray(path)) {
      // Directory path
      const dirContents = await readdir(path);
      const relativeFileList = dirContents.map(filePath =>
        relative(process.cwd(), filePath)
      );
      fileList = ig
        .filter(relativeFileList)
        .map((relativePath: string) => join(process.cwd(), relativePath));

      debug(`Read ${fileList.length} files in the specified directory`);
    } else if (Array.isArray(path)) {
      // Array of file paths
      fileList = path;
      debug(`Assigned ${fileList.length} files provided explicitly`);
    } else {
      // Single file
      fileList = [path];
      debug(`Deploying the provided path as single file`);
    }

    if (!nowConfig) {
      // If the user did not provide a nowConfig,
      // then use the now.json file in the root.
      const fileName = 'now.json';
      const absolutePath = fileList.find(f => relative(cwd, f) === fileName);
      debug(absolutePath ? `Found ${fileName}` : `Missing ${fileName}`);
      nowConfig = await parseNowJSON(absolutePath);
    }

    if (
      version === 1 &&
      nowConfig &&
      Array.isArray(nowConfig.files) &&
      nowConfig.files.length > 0
    ) {
      // See the docs: https://zeit.co/docs/v1/features/configuration/#files-(array)
      debug('Filtering file list based on `files` key in now.json');
      const allowList = new Set(nowConfig.files);
      allowList.add('Dockerfile');
      fileList = fileList.filter(f => allowList.has(relative(cwd, f)));
      debug(`Found ${fileList.length} files`);
    }

    // This is a useful warning because it prevents people
    // from getting confused about a deployment that renders 404.
    if (
      fileList.length === 0 ||
      fileList.every((item): boolean => {
        if (!item) {
          return true;
        }

        const segments = item.split('/');

        return segments[segments.length - 1].startsWith('.');
      })
    ) {
      debug(
        `Deployment path has no files (or only dotfiles). Yielding a warning event`
      );
      yield {
        type: 'warning',
        payload:
          'There are no files (or only files starting with a dot) inside your deployment.',
      };
    }

    const files = await hashes(fileList);

    debug(`Yielding a 'hashes-calculated' event with ${files.size} hashes`);
    yield { type: 'hashes-calculated', payload: mapToObject(files) };

    const {
      token,
      teamId,
      force,
      defaultName,
      debug: debug_,
      ...metadata
    } = options;

    debug(`Setting platform version to ${version}`);
    metadata.version = version;

    const deploymentOpts = {
      debug: debug_,
      totalFiles: files.size,
      nowConfig,
      token,
      isDirectory,
      path,
      teamId,
      force,
      defaultName,
      metadata,
    };

    debug(`Creating the deployment and starting upload...`);
    for await (const event of uploadAndDeploy(files, deploymentOpts)) {
      debug(`Yielding a '${event.type}' event`);
      yield event;
    }
  };
}
