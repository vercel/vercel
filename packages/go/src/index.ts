import execa from 'execa';
import retry from 'async-retry';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import once from '@tootallnate/once';
import { basename, dirname, join, normalize, posix, relative } from 'node:path';
import fs from 'fs-extra';
import {
  BuildOptions,
  Files,
  PrepareCacheOptions,
  StartDevServerOptions,
  StartDevServerResult,
  glob,
  download,
  Lambda,
  getWriteableDirectory,
  shouldServe,
  debug,
  cloneEnv,
} from '@vercel/build-utils';

const {
  readFile,
  writeFile,
  lstat,
  pathExists,
  mkdirp,
  move,
  readlink,
  remove,
  rmdir,
  readdir,
  unlink,
  copy,
} = fs;
const TMP = tmpdir();

import {
  localCacheDir,
  createGo,
  getAnalyzedEntrypoint,
  GoWrapper,
  OUT_EXTENSION,
} from './go-helpers';

export { shouldServe };

// in order to allow the user to have `main.go`,
// we need our `main.go` to be called something else
const MAIN_GO_FILENAME = 'main__vc__go__.go';

const HANDLER_FILENAME = `handler${OUT_EXTENSION}`;

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

type UndoActions = {
  fileActions: UndoFileAction[];
  directoryCreation: string[];
  functionRenames: UndoFunctionRename[];
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
  const undo: UndoActions = {
    fileActions: [],
    directoryCreation: [],
    functionRenames: [],
  };

  const env = cloneEnv(process.env, meta.env, {
    GOARCH: 'amd64',
    GOOS: 'linux',
  });

  try {
    if (env.GIT_CREDENTIALS) {
      debug('Initialize Git credentials...');
      await initPrivateGit(env.GIT_CREDENTIALS);
    }

    if (env.GO111MODULE) {
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
      undo.fileActions.push({
        to: join(workPath, entrypoint),
        from: join(workPath, renamedEntrypoint),
      });
      entrypoint = renamedEntrypoint;
    }

    const entrypointAbsolute = join(workPath, entrypoint);
    const entrypointDirname = dirname(entrypointAbsolute);

    const { goModPath, isGoModInRootDir } = await findGoModPath(
      entrypointDirname,
      workPath
    );

    if (!goModPath && (await pathExists(join(workPath, 'vendor')))) {
      throw new Error('`go.mod` is required to use a `vendor` directory.');
    }

    const analyzed = await getAnalyzedEntrypoint({
      entrypoint,
      modulePath: goModPath ? dirname(goModPath) : undefined,
      workPath,
    });

    // check if package name other than main
    // using `go.mod` way building the handler
    const packageName = analyzed.packageName;
    if (goModPath && packageName === 'main') {
      throw new Error('Please change `package main` to `package handler`');
    }

    // rename the Go handler function name in the original entrypoint file
    const originalFunctionName = analyzed.functionName;
    const handlerFunctionName = getNewHandlerFunctionName(
      originalFunctionName,
      entrypoint
    );
    await renameHandlerFunction(
      entrypointAbsolute,
      originalFunctionName,
      handlerFunctionName
    );
    undo.functionRenames.push({
      fsPath: originalEntrypointAbsolute,
      from: handlerFunctionName,
      to: originalFunctionName,
    });

    const includedFiles: Files = {};
    if (config && config.includeFiles) {
      const patterns = Array.isArray(config.includeFiles)
        ? config.includeFiles
        : [config.includeFiles];
      for (const pattern of patterns) {
        const fsFiles = await glob(pattern, entrypointDirname);
        for (const [assetName, asset] of Object.entries(fsFiles)) {
          includedFiles[assetName] = asset;
        }
      }
    }

    const modulePath = goModPath ? dirname(goModPath) : undefined;
    const go = await createGo({
      modulePath,
      opts: {
        cwd: entrypointDirname,
        env,
      },
      workPath,
    });

    const outDir = await getWriteableDirectory();
    const buildOptions: BuildHandlerOptions = {
      downloadPath,
      entrypoint,
      entrypointAbsolute,
      entrypointDirname,
      go,
      goModPath,
      handlerFunctionName,
      isGoModInRootDir,
      outDir,
      packageName,
      undo,
    };

    if (packageName === 'main') {
      await buildHandlerAsPackageMain(buildOptions);
    } else {
      await buildHandlerWithGoMod(buildOptions);
    }

    const lambda = new Lambda({
      files: { ...(await glob('**', outDir)), ...includedFiles },
      handler: HANDLER_FILENAME,
      runtime: 'go1.x',
      supportsWrapper: true,
      environment: {},
    });

    return {
      output: lambda,
    };
  } catch (error) {
    debug(`Go Builder Error: ${error}`);

    throw error;
  } finally {
    try {
      await cleanupFileSystem(undo);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Build cleanup failed: ${error.message}`);
      }
      debug('Cleanup Error: ' + error);
    }
  }
}

type BuildHandlerOptions = {
  downloadPath: string;
  entrypoint: string;
  entrypointAbsolute: string;
  entrypointDirname: string;
  go: GoWrapper;
  goModPath?: string;
  handlerFunctionName: string;
  isGoModInRootDir: boolean;
  outDir: string;
  packageName: string;
  undo: UndoActions;
};

/**
 * Build the Go function where the package name is not `"main"`. If a `go.mod`
 * does not exist, a default one will be used.
 */
async function buildHandlerWithGoMod({
  downloadPath,
  entrypoint,
  entrypointAbsolute,
  entrypointDirname,
  go,
  goModPath,
  handlerFunctionName,
  isGoModInRootDir,
  outDir,
  packageName,
  undo,
}: BuildHandlerOptions): Promise<void> {
  debug(
    `Building Go handler as package "${packageName}" (with${
      goModPath ? '' : 'out'
    } go.mod)`
  );

  let goModDirname: string | undefined;

  if (goModPath !== undefined) {
    goModDirname = dirname(goModPath);

    // first we backup the original
    const backupFile = join(goModDirname, `__vc_go.mod.bak`);
    await copy(goModPath, backupFile);

    undo.fileActions.push({
      to: goModPath,
      from: backupFile,
    });

    const goSumPath = join(goModDirname, 'go.sum');
    const isGoSumExists = await pathExists(goSumPath);
    if (!isGoSumExists) {
      // remove the `go.sum` file that will be generated as well
      undo.fileActions.push({
        to: undefined, // delete
        from: goSumPath,
      });
    }
  }

  const entrypointArr = entrypoint.split(posix.sep);
  let goPackageName = `${packageName}/${packageName}`;
  const goFuncName = `${packageName}.${handlerFunctionName}`;

  // if we have a go.mod, determine the relative path of the entrypoint to the
  // go.mod directory and use that for the import package name in main.go
  const relPackagePath = goModDirname
    ? posix.relative(goModDirname, entrypointDirname)
    : '';
  if (relPackagePath) {
    goPackageName = posix.join(packageName, relPackagePath);
  }

  let mainGoFile: string;
  if (goModPath && isGoModInRootDir) {
    debug(`[mod-root] Write main file to ${downloadPath}`);
    mainGoFile = join(downloadPath, MAIN_GO_FILENAME);
  } else if (goModDirname && !isGoModInRootDir) {
    debug(`[mod-other] Write main file to ${goModDirname}`);
    mainGoFile = join(goModDirname, MAIN_GO_FILENAME);
  } else {
    debug(`[entrypoint] Write main file to ${entrypointDirname}`);
    mainGoFile = join(entrypointDirname, MAIN_GO_FILENAME);
  }

  await Promise.all([
    writeEntrypoint(mainGoFile, goPackageName, goFuncName),
    writeGoMod({
      destDir: goModDirname ? goModDirname : entrypointDirname,
      goModPath,
      packageName,
    }),
  ]);

  undo.fileActions.push({
    to: undefined, // delete
    from: mainGoFile,
  });

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

    if (!goModPath || dirname(entrypointAbsolute) === dirname(goModPath)) {
      debug(
        `moving entrypoint "${entrypointAbsolute}" to "${finalDestination}"`
      );

      await move(entrypointAbsolute, finalDestination);
      undo.fileActions.push({
        to: entrypointAbsolute,
        from: finalDestination,
      });
      undo.directoryCreation.push(dirname(finalDestination));
    }
  } catch (err) {
    console.error('Failed to move entry to package folder');
    throw err;
  }

  let baseGoModPath = '';
  if (goModPath && isGoModInRootDir) {
    baseGoModPath = downloadPath;
  } else if (goModPath && !isGoModInRootDir) {
    baseGoModPath = dirname(goModPath);
  } else {
    baseGoModPath = entrypointDirname;
  }

  debug('Tidy `go.mod` file...');
  try {
    // ensure go.mod up-to-date
    await go.mod();
  } catch (err) {
    console.error('failed to `go mod tidy`');
    throw err;
  }

  debug('Running `go build`...');
  const destPath = join(outDir, HANDLER_FILENAME);

  try {
    const src = [join(baseGoModPath, MAIN_GO_FILENAME)];

    await go.build(src, destPath);
  } catch (err) {
    console.error('failed to `go build`');
    throw err;
  }
}

/**
 * Builds the wrapped Go function using the legacy mode where package name is
 * `"main"` and we need `main.go` in the same dir as the entrypoint, otherwise
 * `go build` will refuse to build.
 */
async function buildHandlerAsPackageMain({
  entrypointAbsolute,
  entrypointDirname,
  go,
  handlerFunctionName,
  outDir,
  undo,
}: BuildHandlerOptions): Promise<void> {
  debug('Building Go handler as package "main" (legacy)');

  await writeEntrypoint(
    join(entrypointDirname, MAIN_GO_FILENAME),
    '',
    handlerFunctionName
  );

  undo.fileActions.push({
    to: undefined, // delete
    from: join(entrypointDirname, MAIN_GO_FILENAME),
  });

  // `go get` will look at `*.go` (note we set `cwd`), parse the `import`s
  // and download any packages that aren't part of the stdlib
  debug('Running `go get`...');
  try {
    await go.get();
  } catch (err) {
    console.error('Failed to `go get`');
    throw err;
  }

  debug('Running `go build`...');
  const destPath = join(outDir, HANDLER_FILENAME);
  try {
    const src = [
      join(entrypointDirname, MAIN_GO_FILENAME),
      entrypointAbsolute,
    ].map(file => normalize(file));
    await go.build(src, destPath);
  } catch (err) {
    console.error('failed to `go build`');
    throw err;
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

/**
 * Remove any temporary files, directories, and file changes.
 */
async function cleanupFileSystem({
  fileActions,
  directoryCreation,
  functionRenames,
}: UndoActions) {
  // we have to undo the actions in reverse order in cases
  // where one file was moved multiple times, which happens
  // using files that start with brackets
  for (const action of fileActions.reverse()) {
    if (action.to) {
      await move(action.from, action.to, { overwrite: true });
    } else {
      await remove(action.from);
    }
  }

  // after files are moved back, we can undo function renames
  // these reference the original file location
  for (const rename of functionRenames) {
    await renameHandlerFunction(rename.fsPath, rename.from, rename.to);
  }

  const undoDirectoryPromises = directoryCreation.map(async directory => {
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

/**
 * Attempts to find a `go.mod` starting in the entrypoint directory and
 * scanning up the directory tree.
 * @param entrypointDir The entrypoint directory (e.g. `/path/to/project/api`)
 * @param workPath  The work path (e.g. `/path/to/project`)
 * @returns The absolute path to the `go.mod` and a flag if the `go.mod` is in
 * the work path root
 */
async function findGoModPath(entrypointDir: string, workPath: string) {
  let goModPath: string | undefined = undefined;
  let isGoModInRootDir = false;
  let dir = entrypointDir;

  while (!isGoModInRootDir) {
    isGoModInRootDir = dir === workPath;
    const goMod = join(dir, 'go.mod');
    if (await pathExists(goMod)) {
      goModPath = goMod;
      debug(`Found ${goModPath}"`);
      break;
    }
    dir = dirname(dir);
  }

  return {
    goModPath,
    isGoModInRootDir,
  };
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
  const data = await readFile(join(__dirname, '../dev-server.go'), 'utf8');

  // Populate the handler function name
  const patched = data.replace('__HANDLER_FUNC_NAME', functionName);

  await writeFile(join(dest, 'vercel-dev-server-main.go'), patched);
}

async function writeEntrypoint(
  dest: string,
  goPackageName: string,
  goFuncName: string
) {
  const modMainGoContents = await readFile(
    join(__dirname, '../main.go'),
    'utf8'
  );
  const mainModGoContents = modMainGoContents
    .replace('__VC_HANDLER_PACKAGE_NAME', goPackageName)
    .replace('__VC_HANDLER_FUNC_NAME', goFuncName);
  await writeFile(dest, mainModGoContents, 'utf-8');
}

/**
 * Writes a `go.mod` file in the specified directory. If a `go.mod` file
 * exists, then update the module name and any relative `replace` statements,
 * otherwise write the minimum module name.
 * @param workPath The work path; required if `goModPath` exists
 * @param goModPath The path to the `go.mod`, or `undefined` if not found
 * @param destDir The directory to write the `go.mod` to
 * @param packageName The module name to inject into the `go.mod`
 */
async function writeGoMod({
  destDir,
  goModPath,
  packageName,
}: {
  destDir: string;
  goModPath?: string;
  packageName: string;
}) {
  let contents = `module ${packageName}`;

  if (goModPath) {
    const goModRelPath = relative(destDir, dirname(goModPath));
    const goModContents = await readFile(goModPath, 'utf-8');

    contents = goModContents
      .replace(/^module\s+.+$/m, contents)
      .replace(
        /^(replace .+=>\s*)(.+)$/gm,
        (orig, replaceStmt, replacePath) => {
          if (replacePath.startsWith('.')) {
            return replaceStmt + join(goModRelPath, replacePath);
          }
          return orig;
        }
      );

    // get the module name, then add the 'replace' mapping if it doesn't
    // already exist
    const matches = goModContents.match(/module\s+(.+)/);
    const moduleName = matches ? matches[1] : null;
    if (moduleName) {
      let relPath = normalize(goModRelPath);
      if (!relPath.endsWith('/')) {
        relPath += '/';
      }

      const requireRE = new RegExp(`require\\s+${moduleName}`);
      const requireGroupRE = new RegExp(
        `require\\s*\\(.*${moduleName}.*\\)`,
        's'
      );
      if (!requireRE.test(contents) && !requireGroupRE.test(contents)) {
        contents += `require ${moduleName} v0.0.0-unpublished\n`;
      }

      const replaceRE = new RegExp(`replace.+=>\\s+${relPath}(\\s|$)`);
      if (!replaceRE.test(contents)) {
        contents += `replace ${moduleName} => ${relPath}\n`;
      }
    }
  }

  const destGoModPath = join(destDir, 'go.mod');
  debug(`Writing ${destGoModPath}`);
  // console.log(contents);
  await writeFile(destGoModPath, contents, 'utf-8');
}

/**
 * Attempts to find the `go.work` file. It will stop once it hits the
 * `workPath`.
 * @param goWorkDir The directory under the `wordPath` to start searching.
 * @param workPath The project root to stop looking for the file.
 * @returns The path to the `go.work` file or `undefined`.
 */
async function findGoWorkFile(goWorkDir: string, workPath: string) {
  while (!(await pathExists(join(goWorkDir, 'go.work')))) {
    if (goWorkDir === workPath) {
      return;
    }
    goWorkDir = dirname(goWorkDir);
  }
  return join(goWorkDir, 'go.work');
}

/**
 * For simple cases, a `go.work` file is not required. However when a Go
 * program requires source files outside the work path, we need a `go.work` so
 * Go can find the root of the project being built.
 * @param destDir The destination directory to write the `go.work` file.
 * @param workPath The path to the work directory.
 * @param modulePath The path to the directory containing the `go.mod`.
 */
async function writeGoWork(
  destDir: string,
  workPath: string,
  modulePath?: string
) {
  const workspaces = new Set(['.']);
  const goWorkPath = await findGoWorkFile(modulePath || workPath, workPath);

  if (goWorkPath) {
    const contents = await readFile(goWorkPath, 'utf-8');
    const addPath = (path: string) => {
      if (path) {
        if (path.startsWith('.')) {
          workspaces.add(relative(destDir, join(workPath, path)));
        } else {
          workspaces.add(path);
        }
      }
    };

    // find grouped paths
    const multiRE = /use\s*\(([^)]+)/g;
    let match = multiRE.exec(contents);
    while (match) {
      if (match[1]) {
        for (const line of match[1].split(/\r?\n/)) {
          addPath(line.trim());
        }
      }
      match = multiRE.exec(contents);
    }

    // find single paths
    const singleRE = /use\s+(?!\()(.+)/g;
    match = singleRE.exec(contents);
    while (match) {
      addPath(match[1].trim());
      match = singleRE.exec(contents);
    }
  } else if (modulePath) {
    workspaces.add(relative(destDir, modulePath));
  }

  const contents = `use (\n${Array.from(workspaces)
    .map(w => `  ${w}\n`)
    .join('')})\n`;
  // console.log(contents);
  await writeFile(join(destDir, 'go.work'), contents, 'utf-8');
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

  const { goModPath } = await findGoModPath(
    join(workPath, entrypointDir),
    workPath
  );
  const modulePath = goModPath ? dirname(goModPath) : undefined;
  const analyzed = await getAnalyzedEntrypoint({
    entrypoint: entrypointWithExt,
    modulePath,
    workPath,
  });

  await Promise.all([
    copyEntrypoint(entrypointWithExt, tmpPackage),
    copyDevServer(analyzed.functionName, tmpPackage),
    writeGoMod({
      destDir: tmp,
      goModPath,
      packageName: analyzed.packageName,
    }),
    writeGoWork(tmp, workPath, modulePath),
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

  // Note: We must run `go build`, then manually spawn the dev server instead
  // of spawning `go run`. See https://github.com/vercel/vercel/pull/8718 for
  // more info.

  // build the dev server
  const go = await createGo({
    modulePath,
    opts: {
      cwd: tmp,
      env,
    },
    workPath,
  });
  await go.build('./...', executable);

  // run the dev server
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
        console.error(`Could not delete port file: ${opts.portFile}: ${err}`);
      });
      return { port };
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

export async function prepareCache({
  workPath,
}: PrepareCacheOptions): Promise<Files> {
  // When building the project for the first time, there won't be a cache and
  // `createGo()` will have downloaded Go to the global cache directory, then
  // symlinked it to the local `cacheDir`.
  //
  // If we detect the `cacheDir` is a symlink, unlink it, then move the global
  // cache directory into the local cache directory so that it can be
  // persisted.
  //
  // On the next build, the local cache will be restored and `createGo()` will
  // use it unless the preferred Go version changed in the `go.mod`.
  const goCacheDir = join(workPath, localCacheDir);
  const stat = await lstat(goCacheDir);
  if (stat.isSymbolicLink()) {
    const goGlobalCacheDir = await readlink(goCacheDir);
    debug(`Preparing cache by moving ${goGlobalCacheDir} -> ${goCacheDir}`);
    await unlink(goCacheDir);
    await move(goGlobalCacheDir, goCacheDir);
  }

  const cache = await glob(`${localCacheDir}/**`, workPath);
  return cache;
}
