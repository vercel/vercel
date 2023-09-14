import { join, dirname, basename } from 'path';
import { spawn } from 'child_process';
import execa from 'execa';
import fs from 'fs';
import { promisify } from 'util';
import retry from 'async-retry';
import { Readable } from 'stream';

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

import {
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
} from 'fs-extra';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import {
  GlobOptions,
  BuildOptions,
  getWriteableDirectory,
  download,
  glob,
  createLambda,
  shouldServe,
  debug,
  NowBuildError,
} from '@vercel/build-utils';
import { installRequirement, installRequirementsFile } from './install';
import { getLatestPythonVersion, getSupportedPythonVersion } from './version';

function isReadable(v: any): v is Readable {
  return v && v.readable === true;
}

async function pipenvConvert(cmd: string, srcDir: string) {
  debug('Running pipfile2req...');
  try {
    const out = await execa.stdout(cmd, [], {
      cwd: srcDir,
    });
    debug('Contents of requirements.txt is: ' + out);
    fs.writeFileSync(join(srcDir, 'requirements.txt'), out);
  } catch (err) {
    console.log('Failed to run "pipfile2req"');
    throw err;
  }
}

export const version = 3;

export async function downloadFilesInWorkPath({
  entrypoint,
  workPath,
  files,
  meta = {},
}: Pick<BuildOptions, 'entrypoint' | 'workPath' | 'files' | 'meta'>) {
  debug('Downloading user files...');
  let downloadedFiles = await download(files, workPath, meta);
  if (meta.isDev) {
    // Old versions of the CLI don't assign this property
    const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
    const destCache = join(devCacheDir, basename(entrypoint, '.py'));
    await download(downloadedFiles, destCache);
    downloadedFiles = await glob('**', destCache);
    workPath = destCache;
  }
  return workPath;
}

export const build = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}: BuildOptions) => {
  let pythonVersion = getLatestPythonVersion(meta);

  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
  });

  try {
    // See: https://stackoverflow.com/a/44728772/376773
    //
    // The `setup.cfg` is required for `vercel dev` on MacOS, where without
    // this file being present in the src dir then this error happens:
    //
    // distutils.errors.DistutilsOptionError: must supply either home
    // or prefix/exec-prefix -- not both
    if (meta.isDev) {
      const setupCfg = join(workPath, 'setup.cfg');
      await writeFile(setupCfg, '[install]\nprefix=\n');
    }
  } catch (err) {
    console.log('Failed to create "setup.cfg" file');
    throw err;
  }

  console.log('Installing required dependencies...');

  await installRequirement({
    pythonPath: pythonVersion.pythonPath,
    pipPath: pythonVersion.pipPath,
    dependency: 'werkzeug',
    version: '1.0.1',
    workPath,
    meta,
  });

  let fsFiles = await glob('**', workPath);
  const entryDirectory = dirname(entrypoint);

  const pipfileLockDir = fsFiles[join(entryDirectory, 'Pipfile.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile.lock']
    ? workPath
    : null;

  if (pipfileLockDir) {
    debug('Found "Pipfile.lock"');

    let lock: {
      _meta?: {
        requires?: {
          python_version?: string;
        };
      };
    } = {};
    try {
      const json = await readFile(join(pipfileLockDir, 'Pipfile.lock'), 'utf8');
      lock = JSON.parse(json);
    } catch (err) {
      throw new NowBuildError({
        code: 'INVALID_PIPFILE_LOCK',
        message: 'Unable to parse Pipfile.lock',
      });
    }

    pythonVersion = getSupportedPythonVersion({
      isDev: meta.isDev,
      pipLockPythonVersion: lock?._meta?.requires?.python_version,
    });

    // Convert Pipenv.Lock to requirements.txt.
    // We use a different`workPath` here because we want `pipfile-requirements` and it's dependencies
    // to not be part of the lambda environment. By using pip's `--target` directive we can isolate
    // it into a separate folder.
    const tempDir = await getWriteableDirectory();
    await installRequirement({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      dependency: 'pipfile-requirements',
      version: '0.3.0',
      workPath: tempDir,
      meta,
      args: ['--no-warn-script-location'],
    });

    // Python needs to know where to look up all the packages we just installed.
    // We tell it to use the same location as used with `--target`
    process.env.PYTHONPATH = tempDir;
    const convertCmd = join(tempDir, 'bin', 'pipfile2req');
    await pipenvConvert(convertCmd, pipfileLockDir);
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  if (fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath,
      meta,
    });
  } else if (fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath,
      meta,
    });
  }

  const originalPyPath = join(__dirname, '..', 'vc_init.py');
  const originalHandlerPyContents = await readFile(originalPyPath, 'utf8');
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/, '');
  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);
  const handlerPyContents = originalHandlerPyContents
    .replace(/__VC_HANDLER_MODULE_NAME/g, moduleName)
    .replace(/__VC_HANDLER_ENTRYPOINT/g, entrypointWithSuffix);

  // in order to allow the user to have `server.py`, we need our `server.py` to be called
  // somethig else
  const handlerPyFilename = 'vc__handler__python';

  await writeFile(join(workPath, `${handlerPyFilename}.py`), handlerPyContents);

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? config.excludeFiles
        : 'node_modules/**',
  };

  const lambda = await createLambda({
    files: await glob('**', globOptions),
    handler: `${handlerPyFilename}.vc_handler`,
    runtime: pythonVersion.runtime,
    environment: {},
  });

  return { output: lambda };
};

export async function startDevServer(
  opts: StartDevServerOptions
): Promise<StartDevServerResult> {
  opts.config;

  const { entrypoint, workPath, meta = {} } = opts;
  const { devCacheDir = join(workPath, '.vercel', 'cache') } = meta;
  const entrypointDir = dirname(entrypoint);
  entrypointDir;

  // For some reason, if `entrypoint` is a path segment (filename contains `[]`
  // brackets) then the `.go` suffix on the entrypoint is missing. Fix that here…
  let entrypointWithExt = entrypoint;
  if (!entrypoint.endsWith('.go')) {
    entrypointWithExt += '.go';
  }

  const tmp = join(
    devCacheDir,
    'python',
    Math.random().toString(32).substring(2)
  );
  const tmpPackage = join(tmp, entrypointDir);
  await mkdirp(tmpPackage);

  // const { goModPath } = await findGoModPath(
  //   join(workPath, entrypointDir),
  //   workPath
  // );
  // const modulePath = goModPath ? dirname(goModPath) : undefined;
  // const analyzed = await getAnalyzedEntrypoint({
  //   entrypoint: entrypointWithExt,
  //   modulePath,
  //   workPath,
  // });

  // await Promise.all([
  //   copyEntrypoint(entrypointWithExt, tmpPackage),
  //   copyDevServer(analyzed.functionName, tmpPackage),
  //   writeGoMod({
  //     destDir: tmp,
  //     goModPath,
  //     packageName: analyzed.packageName,
  //   }),
  //   writeGoWork(tmp, workPath, modulePath),
  // ]);

  // const portFile = join(
  //   TMP,
  //   `vercel-dev-port-${Math.random().toString(32).substring(2)}`
  // );

  // const env = cloneEnv(process.env, meta.env, {
  //   VERCEL_DEV_PORT_FILE: portFile,
  // });

  const env = cloneEnv(process.env, meta.env, {
    VERCEL_DEV_PORT_FILE: '9999',
  });

  const executable = `./vercel-dev-server-go${
    process.platform === 'win32' ? '.exe' : ''
  }`;

  // Note: We must run `go build`, then manually spawn the dev server instead
  // of spawning `go run`. See https://github.com/vercel/vercel/pull/8718 for
  // more info.

  // // build the dev server
  // const go = await createGo({
  //   modulePath,
  //   opts: {
  //     cwd: tmp,
  //     env,
  //   },
  //   workPath,
  // });
  // await go.build('./...', executable);

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

  // // `dev-server.go` writes the ephemeral port number to FD 3 to be consumed here
  // const onPort = new Promise<PortInfo>(resolve => {
  //   portPipe.setEncoding('utf8');
  //   portPipe.once('data', d => {
  //     resolve({ port: Number(d) });
  //   });
  // });
  // const onPortFile = waitForPortFile(portFile);
  // const onExit = once.spread<[number, string | null]>(child, 'exit');
  // const result = await Promise.race([onPort, onPortFile, onExit]);
  // onExit.cancel();
  // onPortFile.cancel();

  // if (isPortInfo(result)) {
  //   return {
  //     port: result.port,
  //     pid: child.pid,
  //   };
  // } else if (Array.isArray(result)) {
  //   // Got "exit" event from child process
  //   const [exitCode, signal] = result;
  //   const reason = signal ? `"${signal}" signal` : `exit code ${exitCode}`;
  //   throw new Error(`\`go run ${entrypointWithExt}\` failed with ${reason}`);
  // } else {
  //   throw new Error(`Unexpected result type: ${typeof result}`);
  // }

  return {
    port: 9999,
    pid: 5,
  };
}

export { shouldServe };

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
