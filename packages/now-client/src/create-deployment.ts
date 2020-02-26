import { upload } from './upload';
import readdir from 'recursive-readdir';
import { DeploymentError } from './errors';
import { relative, join, isAbsolute } from 'path';
import hashes, { mapToObject } from './utils/hashes';
import { readdir as readRootFolder, lstatSync } from 'fs-extra';
import { getNowIgnore, createDebug, parseNowJSON } from './utils';
import {
  NowConfig,
  NowClientOptions,
  DeploymentOptions,
  DeploymentEventType,
} from './types';

export async function* createDeployment(
  clientOptions: NowClientOptions,
  deploymentOptions: DeploymentOptions = {},
  nowConfig?: NowConfig
): AsyncIterableIterator<{ type: DeploymentEventType; payload: any }> {
  const { path } = clientOptions;

  const debug = createDebug(clientOptions.debug);
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

  let rootFiles: string[];

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
  let { ig, ignores } = await getNowIgnore(path);

  debug(`Found ${ig.ignores.length} rules in .nowignore`);

  let fileList: string[];

  debug('Building file tree...');

  if (clientOptions.isDirectory && !Array.isArray(path)) {
    // Directory path
    const dirContents = await readdir(path, ignores);
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

  if (nowConfig) {
    // We'll apply all properties from `now.json`
    // except for some to the payload.
    const include = Object.assign({}, nowConfig);

    delete include.scope;
    delete include.github;

    Object.assign(deploymentOptions, include);
  }

  // This is a useful warning because it prevents people
  // from getting confused about a deployment that renders 404.
  if (
    fileList.length === 0 ||
    fileList.every(item =>
      item
        ? item // eslint-disable-line @typescript-eslint/no-non-null-assertion
            .split('/')
            .pop()!
            .startsWith('.')
        : true
    )
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

  if (clientOptions.apiUrl) {
    debug(`Using provided API URL: ${clientOptions.apiUrl}`);
  }

  if (clientOptions.userAgent) {
    debug(`Using provided user agent: ${clientOptions.userAgent}`);
  }

  debug(`Creating the deployment and starting upload...`);
  for await (const event of upload(files, clientOptions, deploymentOptions)) {
    debug(`Yielding a '${event.type}' event`);
    yield event;
  }
}
