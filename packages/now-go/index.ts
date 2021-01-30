import execa from 'execa';
import retry from 'async-retry';
import { homedir, tmpdir } from 'os';
import { spawn } from 'child_process';
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
} from 'fs-extra';
import {
  BuildOptions,
  Meta,
  Files,
  StartDevServerOptions,
  StartDevServerResult,
} from '@vercel/build-utils';
import buildUtils from './build-utils';

const {
  glob,
  download,
  createLambda,
  getWriteableDirectory,
  shouldServe,
  debug,
} = buildUtils;

const TMP = tmpdir();

import { createGo, getAnalyzedEntrypoint, OUT_EXTENSION } from './go-helpers';
const handlerFileName = `handler${OUT_EXTENSION}`;

export { shouldServe };

interface Analyzed {
  found?: boolean;
  packageName: string;
  functionName: string;
  watch: string[];
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
async function getRenamedEntrypoint(
  entrypoint: string,
  files: Files,
  meta: Meta
) {
  const filename = basename(entrypoint);
  if (filename.startsWith('[')) {
    const suffix = meta.isDev && !entrypoint.endsWith('.go') ? '.go' : '';
    const newEntrypoint = entrypoint.replace('/[', '/now-bracket[') + suffix;
    const file = files[entrypoint];
    delete files[entrypoint];
    files[newEntrypoint] = file;
    debug(`Renamed entrypoint from ${entrypoint} to ${newEntrypoint}`);
    entrypoint = newEntrypoint;
  }

  return entrypoint;
}

export const version = 3;

export async function build({
  files,
  entrypoint,
  config,
  workPath,
  meta = {},
}: BuildOptions) {
  if (process.env.GIT_CREDENTIALS && !meta.isDev) {
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
  entrypoint = await getRenamedEntrypoint(entrypoint, files, meta);
  const entrypointArr = entrypoint.split(sep);

  // eslint-disable-next-line prefer-const
  let [goPath, outDir] = await Promise.all([
    getWriteableDirectory(),
    getWriteableDirectory(),
  ]);

  const forceMove = Boolean(meta.isDev);
  const srcPath = join(goPath, 'src', 'lambda');
  let downloadPath = (meta.isDev || meta.skipDownload) ? workPath : srcPath;
  let downloadedFiles = await download(files, downloadPath, meta);

  debug(`Parsing AST for "${entrypoint}"`);
  let analyzed: string;
  try {
    let goModAbsPathDir = '';
    const fileName = 'go.mod';
    if (fileName in downloadedFiles) {
      goModAbsPathDir = dirname(downloadedFiles[fileName].fsPath);
      debug(`Found ${fileName} file in "${goModAbsPathDir}"`);
    }
    analyzed = await getAnalyzedEntrypoint(
      downloadedFiles[entrypoint].fsPath,
      goModAbsPathDir
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

  if (meta.isDev) {
    // Create cache so Go rebuilds fast with `vercel dev`
    // Old versions of the CLI don't assign this property
    const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
    goPath = join(devCacheDir, 'now-go', basename(entrypoint, '.go'));
    const destLambda = join(goPath, 'src', 'lambda');
    await download(downloadedFiles, destLambda);
    downloadedFiles = await glob('**', destLambda);
    downloadPath = destLambda;
  }

  // find `go.mod` in downloadedFiles
  const entrypointDirname = dirname(downloadedFiles[entrypoint].fsPath);
  let isGoModExist = false;
  let goModPath = '';
  let isGoModInRootDir = false;
  for (const file of Object.keys(downloadedFiles)) {
    const { fsPath } = downloadedFiles[file];
    const fileDirname = dirname(fsPath);
    if (file === 'go.mod') {
      isGoModExist = true;
      isGoModInRootDir = true;
      goModPath = fileDirname;
    } else if (file.endsWith('go.mod')) {
      if (entrypointDirname === fileDirname) {
        isGoModExist = true;
        goModPath = fileDirname;
        debug(`Found file dirname equals entrypoint dirname: ${fileDirname}`);
        break;
      }

      if (!isGoModInRootDir && config.zeroConfig && file === 'api/go.mod') {
        // We didn't find `/go.mod` but we found `/api/go.mod` so move it to the root
        isGoModExist = true;
        isGoModInRootDir = true;
        goModPath = join(fileDirname, '..');
        const pathParts = fsPath.split(sep);
        pathParts.pop(); // Remove go.mod
        pathParts.pop(); // Remove api
        pathParts.push('go.mod');
        const newFsPath = pathParts.join(sep);
        debug(`Moving api/go.mod to root: ${fsPath} to ${newFsPath}`);
        await move(fsPath, newFsPath, { overwrite: forceMove });
        const oldSumPath = join(dirname(fsPath), 'go.sum');
        const newSumPath = join(dirname(newFsPath), 'go.sum');
        if (await pathExists(oldSumPath)) {
          debug(`Moving api/go.sum to root: ${oldSumPath} to ${newSumPath}`);
          await move(oldSumPath, newSumPath, { overwrite: forceMove });
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

  const handlerFunctionName = parsedAnalyzed.functionName;
  debug(`Found exported function "${handlerFunctionName}" in "${entrypoint}"`);

  if (!isGoModExist && 'vendor' in downloadedFiles) {
    throw new Error('`go.mod` is required to use a `vendor` directory.');
  }

  // check if package name other than main
  // using `go.mod` way building the handler
  const packageName = parsedAnalyzed.packageName;

  if (isGoModExist && packageName === 'main') {
    throw new Error('Please change `package main` to `package handler`');
  }

  if (packageName !== 'main') {
    const go = await createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname,
      },
      true
    );
    if (!isGoModExist) {
      try {
        const defaultGoModContent = `module ${packageName}`;

        await writeFile(join(entrypointDirname, 'go.mod'), defaultGoModContent);
      } catch (err) {
        console.log(`Failed to create default go.mod for ${packageName}`);
        throw err;
      }
    }

    const mainModGoFileName = 'main__mod__.go';
    const modMainGoContents = await readFile(
      join(__dirname, mainModGoFileName),
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
      await writeFile(join(downloadPath, mainModGoFileName), mainModGoContents);
    } else if (isGoModExist && !isGoModInRootDir) {
      debug('[mod-other] Write main file to ' + goModPath);
      await writeFile(join(goModPath, mainModGoFileName), mainModGoContents);
    } else {
      debug('[entrypoint] Write main file to ' + entrypointDirname);
      await writeFile(
        join(entrypointDirname, mainModGoFileName),
        mainModGoContents
      );
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

      if (
        dirname(downloadedFiles[entrypoint].fsPath) === goModPath ||
        !isGoModExist
      ) {
        await move(downloadedFiles[entrypoint].fsPath, finalDestination, {
          overwrite: forceMove,
        });
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

    if (meta.isDev) {
      const isGoModBk = await pathExists(join(baseGoModPath, 'go.mod.bk'));
      if (isGoModBk) {
        await move(
          join(baseGoModPath, 'go.mod.bk'),
          join(baseGoModPath, 'go.mod'),
          { overwrite: forceMove }
        );
        await move(
          join(baseGoModPath, 'go.sum.bk'),
          join(baseGoModPath, 'go.sum'),
          { overwrite: forceMove }
        );
      }
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
      const src = [join(baseGoModPath, mainModGoFileName)];

      await go.build(src, destPath);
    } catch (err) {
      console.log('failed to `go build`');
      throw err;
    }
    if (meta.isDev) {
      // caching for `vercel dev`
      await move(
        join(baseGoModPath, 'go.mod'),
        join(baseGoModPath, 'go.mod.bk'),
        { overwrite: forceMove }
      );
      await move(
        join(baseGoModPath, 'go.sum'),
        join(baseGoModPath, 'go.sum.bk'),
        { overwrite: forceMove }
      );
    }
  } else {
    // legacy mode
    // we need `main.go` in the same dir as the entrypoint,
    // otherwise `go build` will refuse to build
    const go = await createGo(
      goPath,
      process.platform,
      process.arch,
      {
        cwd: entrypointDirname,
      },
      false
    );
    const origianlMainGoContents = await readFile(
      join(__dirname, 'main.go'),
      'utf8'
    );
    const mainGoContents = origianlMainGoContents.replace(
      '__VC_HANDLER_FUNC_NAME',
      handlerFunctionName
    );

    // in order to allow the user to have `main.go`,
    // we need our `main.go` to be called something else
    const mainGoFileName = 'main__vc__go__.go';

    // Go doesn't like to build files in different directories,
    // so now we place `main.go` together with the user code
    await writeFile(join(entrypointDirname, mainGoFileName), mainGoContents);

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
        downloadedFiles[entrypoint].fsPath,
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
    environment: {},
  });

  const watch = parsedAnalyzed.watch;
  let watchSub: string[] = [];
  // if `entrypoint` located in subdirectory
  // we will need to concat it with return watch array
  if (entrypointArr.length > 1) {
    entrypointArr.pop();
    watchSub = parsedAnalyzed.watch.map(file => join(...entrypointArr, file));
  }

  return {
    output: lambda,
    watch: watch.concat(watchSub),
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

  const env: typeof process.env = {
    ...process.env,
    ...meta.env,
    VERCEL_DEV_PORT_FILE: portFile,
  };

  const tmpRelative = `.${sep}${entrypointDir}`;
  const child = spawn('go', ['run', tmpRelative], {
    cwd: tmp,
    env,
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });

  child.once('exit', () => {
    retry(() => remove(tmp)).catch((err: Error) => {
      console.error('Could not delete tmp directory: %j: %s', tmp, err);
    });
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
