import execa from 'execa';
import retry from 'async-retry';
import { homedir, tmpdir } from 'os';
import { execFileSync, spawn } from 'child_process';
import { Readable } from 'stream';
import once from '@tootallnate/once';
import { join, dirname, basename, normalize, sep } from 'path';
import {
  readFile,
  writeFile,
  pathExists,
  mkdirp,
  move,
  remove,
  rmdir,
  readdir,
} from 'fs-extra';
import {
  BuildOptions,
  Files,
  PrepareCacheOptions,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  createLambda,
  getWriteableDirectory,
  shouldServe,
  debug,
  cloneEnv,
} from '@vercel/build-utils';

const TMP = tmpdir();

import {
  createGo,
  getAnalyzedEntrypoint,
  cacheDir,
  OUT_EXTENSION,
} from './go-helpers';
const handlerFileName = `handler${OUT_EXTENSION}`;

export { shouldServe };

interface Analyzed {
  found?: boolean;
  packageName: string;
  functionName: string;
}

interface PortInfo {
  port: number;
}

// Initialize private git repo for Go Modules
async function initPrivateGit(credentials: string) {
  const gitCredentialsPath = join(homedir(), '.git-credentials');

  await execa('git', [
    'config',
    '--global',
    'credential.helper',
    `store --file ${gitCredentialsPath}`,
  ]);

  await writeFile(gitCredentialsPath, credentials);
}

/**
 * Since `go build` does not support files that begin with a square bracket,
 * we must rename to something temporary to support Path Segments.
 * The output file is not renamed because v3 builders can't rename outputs
 * which works great for this feature. We also need to add a suffix during `vercel dev`
 * since the entrypoint is already stripped of its suffix before build() is called.
 */
function getRenamedEntrypoint(entrypoint: string): string | undefined {
  const filename = basename(entrypoint);
  if (filename.startsWith('[')) {
    const newEntrypoint = entrypoint.replace('/[', '/now-bracket[');

    debug(`Renamed entrypoint from ${entrypoint} to ${newEntrypoint}`);
    return newEntrypoint;
  }

  return undefined;
}

type UndoFileAction = {
  from: string;
  to: string | undefined;
};

type UndoFunctionRename = {
  fsPath: string;
  from: string;
  to: string;
};

export const version = 3;

export async function build({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions) {
  const goPath = await getWriteableDirectory();
  const srcPath = join(goPath, 'src', 'lambda');
  const downloadPath = meta.skipDownload ? workPath : srcPath;
  await download(files, downloadPath, meta);

  // keep track of file system actions we need to undo
  // the keys "from" and "to" refer to what needs to be done
  // in order to undo the action, not what the original action was
  const undoFileActions: UndoFileAction[] = [];
  const undoDirectoryCreation: string[] = [];
  const undoFunctionRenames: UndoFunctionRename[] = [];

  try {
    if (process.env.GIT_CREDENTIALS) {
      debug('Initialize Git credentials...');
      await initPrivateGit(process.env.GIT_CREDENTIALS);
    }

    if (process.env.GO111MODULE) {
      console.log(`\nManually assigning 'GO111MODULE' is not recommended.

  By default:
    - 'GO111MODULE=on' If entrypoint package name is not 'main'
    - 'GO111MODULE=off' If entrypoint package name is 'main'

  We highly recommend you leverage Go Modules in your project.
  Learn more: https://github.com/golang/go/wiki/Modules
  `);
    }

    const originalEntrypointAbsolute = join(workPath, entrypoint);
    const renamedEntrypoint = getRenamedEntrypoint(entrypoint);
    if (renamedEntrypoint) {
      await move(join(workPath, entrypoint), join(workPath, renamedEntrypoint));
      undoFileActions.push({
        to: join(workPath, entrypoint),
        from: join(workPath, renamedEntrypoint),
      });
      entrypoint = renamedEntrypoint;
    }

    const entrypointAbsolute = join(workPath, entrypoint);
    const entrypointArr = entrypoint.split(sep);

    debug(`Parsing AST for "${entrypoint}"`);
    let analyzed: string;
    try {
      const goModAbsPath = await findGoModPath(workPath);
      if (goModAbsPath) {
        debug(`Found ${goModAbsPath}"`);
      }

      analyzed = await getAnalyzedEntrypoint(
        workPath,
        entrypointAbsolute,
        dirname(goModAbsPath)
      );
    } catch (err) {
      console.log(`Failed to parse AST for "${entrypoint}"`);
      throw err;
    }

    if (!analyzed) {
      const err = new Error(
        `Could not find an exported function in "${entrypoint}"
  Learn more: https://vercel.com/docs/runtimes#official-runtimes/go
        `
      );
      console.log(err.message);
      throw err;
    }

    const parsedAnalyzed = JSON.parse(analyzed) as Analyzed;

    // find `go.mod` in modFiles
    const entrypointDirname = dirname(entrypointAbsolute);
    let isGoModExist = false;
    let goModPath = '';
    let isGoModInRootDir = false;

    const modFileRefs = await glob('**/*.mod', workPath);
    const modFiles = Object.keys(modFileRefs);

    for (const file of modFiles) {
      const fileDirname = dirname(file);
      if (file === 'go.mod') {
        isGoModExist = true;
        isGoModInRootDir = true;
        goModPath = join(workPath, fileDirname);
      } else if (file.endsWith('go.mod')) {
        if (entrypointDirname === fileDirname) {
          isGoModExist = true;
          goModPath = join(workPath, fileDirname);

          debug(`Found file dirname equals entrypoint dirname: ${fileDirname}`);
          break;
        }

        if (!isGoModInRootDir && config.zeroConfig && file === 'api/go.mod') {
          // We didn't find `/go.mod` but we found `/api/go.mod` so move it to the root
          isGoModExist = true;
          isGoModInRootDir = true;
          goModPath = join(fileDirname, '..');
          const pathParts = file.split(sep);
          pathParts.pop(); // Remove go.mod
          pathParts.pop(); // Remove api
          pathParts.push('go.mod');

          const newRoot = pathParts.join(sep);
          const newFsPath = join(workPath, newRoot);

          debug(`Moving api/go.mod to root: ${file} to ${newFsPath}`);
          await move(file, newFsPath);
          undoFileActions.push({
            to: file,
            from: newFsPath,
          });

          const oldSumPath = join(dirname(file), 'go.sum');
          const newSumPath = join(dirname(newFsPath), 'go.sum');
          if (await pathExists(oldSumPath)) {
            debug(`Moving api/go.sum to root: ${oldSumPath} to ${newSumPath}`);
            await move(oldSumPath, newSumPath);
            undoFileActions.push({
              to: oldSumPath,
              from: newSumPath,
            });
          }
          break;
        }
      }
    }

    const input = entrypointDirname;
    const includedFiles: Files = {};

    if (config && config.includeFiles) {
      const patterns = Array.isArray(config.includeFiles)
        ? config.includeFiles
        : [config.includeFiles];
      for (const pattern of patterns) {
        const fsFiles = await glob(pattern, input);
        for (const [assetName, asset] of Object.entries(fsFiles)) {
          includedFiles[assetName] = asset;
        }
      }
    }

    const originalFunctionName = parsedAnalyzed.functionName;
    const handlerFunctionName = getNewHandlerFunctionName(
      originalFunctionName,
      entrypoint
    );
    await renameHandlerFunction(
      entrypointAbsolute,
      originalFunctionName,
      handlerFunctionName
    );
    undoFunctionRenames.push({
      fsPath: originalEntrypointAbsolute,
      from: handlerFunctionName,
      to: originalFunctionName,
    });

    if (!isGoModExist) {
      if (await pathExists(join(workPath, 'vendor'))) {
        throw new Error('`go.mod` is required to use a `vendor` directory.');
      }
    }

    // check if package name other than main
    // using `go.mod` way building the handler
    const packageName = parsedAnalyzed.packageName;

    if (isGoModExist && packageName === 'main') {
      throw new Error('Please change `package main` to `package handler`');
    }

    const outDir = await getWriteableDirectory();

    // in order to allow the user to have `main.go`,
    // we need our `main.go` to be called something else
    const mainGoFileName = 'main__vc__go__.go';

    if (packageName !== 'main') {
      const go = await createGo(
        workPath,
        goPath,
        process.platform,
        process.arch,
        {
          cwd: entrypointDirname,
          stdio: 'inherit',
        },
        true
      );
      if (!isGoModExist) {
        try {
          const defaultGoModContent = `module ${packageName}`;

          await writeFile(
            join(entrypointDirname, 'go.mod'),
            defaultGoModContent
          );

          undoFileActions.push({
            to: undefined, // delete
            from: join(entrypointDirname, 'go.mod'),
          });

          // remove the `go.sum` file that will be generated as well
          undoFileActions.push({
            to: undefined, // delete
            from: join(entrypointDirname, 'go.sum'),
          });
        } catch (err) {
          console.log(`Failed to create default go.mod for ${packageName}`);
          throw err;
        }
      }

      const modMainGoContents = await readFile(
        join(__dirname, 'main.go'),
        'utf8'
      );

      let goPackageName = `${packageName}/${packageName}`;
      const goFuncName = `${packageName}.${handlerFunctionName}`;

      if (isGoModExist) {
        const goModContents = await readFile(join(goModPath, 'go.mod'), 'utf8');
        const usrModName = goModContents.split('\n')[0].split(' ')[1];
        if (entrypointArr.length > 1 && isGoModInRootDir) {
          const cleanPackagePath = [...entrypointArr];
          cleanPackagePath.pop();
          goPackageName = `${usrModName}/${cleanPackagePath.join('/')}`;
        } else {
          goPackageName = `${usrModName}/${packageName}`;
        }
      }

      const mainModGoContents = modMainGoContents
        .replace('__VC_HANDLER_PACKAGE_NAME', goPackageName)
        .replace('__VC_HANDLER_FUNC_NAME', goFuncName);

      if (isGoModExist && isGoModInRootDir) {
        debug('[mod-root] Write main file to ' + downloadPath);
        await writeFile(join(downloadPath, mainGoFileName), mainModGoContents);
        undoFileActions.push({
          to: undefined, // delete
          from: join(downloadPath, mainGoFileName),
        });
      } else if (isGoModExist && !isGoModInRootDir) {
        debug('[mod-other] Write main file to ' + goModPath);
        await writeFile(join(goModPath, mainGoFileName), mainModGoContents);
        undoFileActions.push({
          to: undefined, // delete
          from: join(goModPath, mainGoFileName),
        });
      } else {
        debug('[entrypoint] Write main file to ' + entrypointDirname);
        await writeFile(
          join(entrypointDirname, mainGoFileName),
          mainModGoContents
        );
        undoFileActions.push({
          to: undefined, // delete
          from: join(entrypointDirname, mainGoFileName),
        });
      }

      // move user go file to folder
      try {
        // default path
        let finalDestination = join(entrypointDirname, packageName, entrypoint);

        // if `entrypoint` include folder, only use filename
        if (entrypointArr.length > 1) {
          finalDestination = join(
            entrypointDirname,
            packageName,
            entrypointArr[entrypointArr.length - 1]
          );
        }

        if (dirname(entrypointAbsolute) === goModPath || !isGoModExist) {
          debug(
            `moving entrypoint "${entrypointAbsolute}" to "${finalDestination}"`
          );

          await move(entrypointAbsolute, finalDestination);
          undoFileActions.push({
            to: entrypointAbsolute,
            from: finalDestination,
          });
          undoDirectoryCreation.push(dirname(finalDestination));
        }
      } catch (err) {
        console.log('Failed to move entry to package folder');
        throw err;
      }

      let baseGoModPath = '';
      if (isGoModExist && isGoModInRootDir) {
        baseGoModPath = downloadPath;
      } else if (isGoModExist && !isGoModInRootDir) {
        baseGoModPath = goModPath;
      } else {
        baseGoModPath = entrypointDirname;
      }

      debug('Tidy `go.mod` file...');
      try {
        // ensure go.mod up-to-date
        await go.mod();
      } catch (err) {
        console.log('failed to `go mod tidy`');
        throw err;
      }

      debug('Running `go build`...');
      const destPath = join(outDir, handlerFileName);

      try {
        const src = [join(baseGoModPath, mainGoFileName)];

        await go.build(src, destPath);
      } catch (err) {
        console.log('failed to `go build`');
        throw err;
      }
    } else {
      // legacy mode
      // we need `main.go` in the same dir as the entrypoint,
      // otherwise `go build` will refuse to build
      const go = await createGo(
        workPath,
        goPath,
        process.platform,
        process.arch,
        {
          cwd: entrypointDirname,
        },
        false
      );
      const originalMainGoContents = await readFile(
        join(__dirname, 'main.go'),
        'utf8'
      );
      const mainGoContents = originalMainGoContents
        .replace('"__VC_HANDLER_PACKAGE_NAME"', '')
        .replace('__VC_HANDLER_FUNC_NAME', handlerFunctionName);

      // Go doesn't like to build files in different directories,
      // so now we place `main.go` together with the user code
      await writeFile(join(entrypointDirname, mainGoFileName), mainGoContents);
      undoFileActions.push({
        to: undefined, // delete
        from: join(entrypointDirname, mainGoFileName),
      });

      // `go get` will look at `*.go` (note we set `cwd`), parse the `import`s
      // and download any packages that aren't part of the stdlib
      debug('Running `go get`...');
      try {
        await go.get();
      } catch (err) {
        console.log('Failed to `go get`');
        throw err;
      }

      debug('Running `go build`...');
      const destPath = join(outDir, handlerFileName);
      try {
        const src = [
          join(entrypointDirname, mainGoFileName),
          entrypointAbsolute,
        ].map(file => normalize(file));
        await go.build(src, destPath);
      } catch (err) {
        console.log('failed to `go build`');
        throw err;
      }
    }

    const lambda = await createLambda({
      files: { ...(await glob('**', outDir)), ...includedFiles },
      handler: handlerFileName,
      runtime: 'go1.x',
      supportsWrapper: true,
      environment: {},
    });

    return {
      output: lambda,
    };
  } catch (error) {
    debug('Go Builder Error: ' + error);

    throw error;
  } finally {
    try {
      await cleanupFileSystem(
        undoFileActions,
        undoDirectoryCreation,
        undoFunctionRenames
      );
    } catch (error) {
      console.log(`Build cleanup failed: ${error.message}`);
      debug('Cleanup Error: ' + error);
    }
  }
}

async function renameHandlerFunction(fsPath: string, from: string, to: string) {
  let fileContents = await readFile(fsPath, 'utf8');

  // This regex has to walk a fine line where it replaces the most-likely occurrences
  // of the handler's identifier without clobbering other syntax.
  // Left-hand Side: A single space was chosen because it can catch `func Handler`
  //   as well as `var _ http.HandlerFunc = Index`.
  // Right-hand Side: a word boundary was chosen because this can be an end of line
  //   or an open paren (as in `func Handler(`).
  const fromRegex = new RegExp(String.raw` ${from}\b`, 'g');
  fileContents = fileContents.replace(fromRegex, ` ${to}`);

  await writeFile(fsPath, fileContents);
}

export function getNewHandlerFunctionName(
  originalFunctionName: string,
  entrypoint: string
) {
  if (!originalFunctionName) {
    throw new Error(
      'Handler function renaming failed because original function name was empty.'
    );
  }

  if (!entrypoint) {
    throw new Error(
      'Handler function renaming failed because entrypoint was empty.'
    );
  }

  debug(`Found exported function "${originalFunctionName}" in "${entrypoint}"`);

  const pathSlug = entrypoint.replace(/(\s|\\|\/|\]|\[|-|\.)/g, '_');

  const newHandlerName = `${originalFunctionName}_${pathSlug}`;
  debug(
    `Renaming handler function temporarily from "${originalFunctionName}" to "${newHandlerName}"`
  );

  return newHandlerName;
}

async function cleanupFileSystem(
  undoFileActions: UndoFileAction[],
  undoDirectoryCreation: string[],
  undoFunctionRenames: UndoFunctionRename[]
) {
  // we have to undo the actions in reverse order in cases
  // where one file was moved multiple times, which happens
  // using files that start with brackets
  for (const action of undoFileActions.reverse()) {
    if (action.to) {
      await move(action.from, action.to);
    } else {
      await remove(action.from);
    }
  }

  // after files are moved back, we can undo function renames
  // these reference the original file location
  for (const rename of undoFunctionRenames) {
    await renameHandlerFunction(rename.fsPath, rename.from, rename.to);
  }

  const undoDirectoryPromises = undoDirectoryCreation.map(async directory => {
    const contents = await readdir(directory);
    // only delete an empty directory
    // if it has contents, either something went wrong during cleanup or this
    // directory contains project source code that should not be deleted
    if (!contents.length) {
      return rmdir(directory);
    }
    return undefined;
  });
  await Promise.all(undoDirectoryPromises);
}

async function findGoModPath(workPath: string): Promise<string> {
  let checkPath = join(workPath, 'go.mod');
  if (await pathExists(checkPath)) {
    return checkPath;
  }

  checkPath = join(workPath, 'api/go.mod');
  if (await pathExists(checkPath)) {
    return checkPath;
  }

  return '';
}

function isPortInfo(v: any): v is PortInfo {
  return v && typeof v.port === 'number';
}

function isReadable(v: any): v is Readable {
  return v && v.readable === true;
}

async function copyEntrypoint(entrypoint: string, dest: string): Promise<void> {
  const data = await readFile(entrypoint, 'utf8');

  // Modify package to `package main`
  const patched = data.replace(/\bpackage\W+\S+\b/, 'package main');

  await writeFile(join(dest, 'entrypoint.go'), patched);
}

async function copyDevServer(
  functionName: string,
  dest: string
): Promise<void> {
  const data = await readFile(join(__dirname, 'dev-server.go'), 'utf8');

  // Populate the handler function name
  const patched = data.replace('__HANDLER_FUNC_NAME', functionName);

  await writeFile(join(dest, 'vercel-dev-server-main.go'), patched);
}

export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  const { entrypoint, workPath, meta = {} } = opts;
  const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;
  const entrypointDir = dirname(entrypoint);

  // For some reason, if `entrypoint` is a path segment (filename contains `[]`
  // brackets) then the `.go` suffix on the entrypoint is missing. Fix that here…
  let entrypointWithExt = entrypoint;
  if (!entrypoint.endsWith('.go')) {
    entrypointWithExt += '.go';
  }

  const tmp = join(devCacheDir, 'go', Math.random().toString(32).substring(2));
  const tmpPackage = join(tmp, entrypointDir);
  await mkdirp(tmpPackage);

  let goModAbsPathDir = '';
  if (await pathExists(join(workPath, 'go.mod'))) {
    goModAbsPathDir = workPath;
  }
  const analyzedRaw = await getAnalyzedEntrypoint(
    workPath,
    entrypointWithExt,
    goModAbsPathDir
  );
  if (!analyzedRaw) {
    throw new Error(
      `Could not find an exported function in "${entrypointWithExt}"
Learn more: https://vercel.com/docs/runtimes#official-runtimes/go`
    );
  }
  const analyzed: Analyzed = JSON.parse(analyzedRaw);

  await Promise.all([
    copyEntrypoint(entrypointWithExt, tmpPackage),
    copyDevServer(analyzed.functionName, tmpPackage),
  ]);

  const portFile = join(
    TMP,
    `vercel-dev-port-${Math.random().toString(32).substring(2)}`
  );

  const env = cloneEnv(process.env, meta.env, {
    VERCEL_DEV_PORT_FILE: portFile,
  });

  const executable = `./vercel-dev-server-go${
    process.platform === 'win32' ? '.exe' : ''
  }`;

  debug(`SPAWNING go build -o ${executable} ./... CWD=${tmp}`);
  execFileSync('go', ['build', '-o', executable, './...'], {
    cwd: tmp,
    env,
    stdio: 'inherit',
  });

  debug(`SPAWNING ${executable} CWD=${tmp}`);
  const child = spawn(executable, [], {
    cwd: tmp,
    env,
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });

  child.on('close', async () => {
    try {
      await retry(() => remove(tmp));
    } catch (err: any) {
      console.error(`Could not delete tmp directory: ${tmp}: ${err}`);
    }
  });

  const portPipe = child.stdio[3];
  if (!isReadable(portPipe)) {
    throw new Error('File descriptor 3 is not readable');
  }

  // `dev-server.go` writes the ephemeral port number to FD 3 to be consumed here
  const onPort = new Promise<PortInfo>(resolve => {
    portPipe.setEncoding('utf8');
    portPipe.once('data', d => {
      resolve({ port: Number(d) });
    });
  });
  const onPortFile = waitForPortFile(portFile);
  const onExit = once.spread<[number, string | null]>(child, 'exit');
  const result = await Promise.race([onPort, onPortFile, onExit]);
  onExit.cancel();
  onPortFile.cancel();

  if (isPortInfo(result)) {
    return {
      port: result.port,
      pid: child.pid,
    };
  } else if (Array.isArray(result)) {
    // Got "exit" event from child process
    const [exitCode, signal] = result;
    const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
    throw new Error(`\`go run ${entrypointWithExt}\` failed with ${reason}`);
  } else {
    throw new Error(`Unexpected result type: ${typeof result}`);
  }
}

export interface CancelablePromise<T> extends Promise<T> {
  cancel: () => void;
}

function waitForPortFile(portFile: string) {
  const opts = { portFile, canceled: false };
  const promise = waitForPortFile_(opts) as CancelablePromise<PortInfo | void>;
  promise.cancel = () => {
    opts.canceled = true;
  };
  return promise;
}

async function waitForPortFile_(opts: {
  portFile: string;
  canceled: boolean;
}): Promise<PortInfo | void> {
  while (!opts.canceled) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const port = Number(await readFile(opts.portFile, 'ascii'));
      retry(() => remove(opts.portFile)).catch((err: Error) => {
        console.error('Could not delete port file: %j: %s', opts.portFile, err);
      });
      return { port };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  const cache = await glob(`${cacheDir}/**`, workPath);
  return cache;
}
