import { join, dirname, basename } from 'path';
import execa from 'execa';
import fs from 'fs';
import { promisify } from 'util';
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
}: BuildOptions) {
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

interface PythonVersion {
  version: '3' | '3.6' | '3.9';
  pipPath: 'pip3' | 'pip3.6' | 'pip3.9';
  pythonPath: 'python3' | 'python3.6' | 'python3.9';
  pythonRuntime: 'python3' | 'python3.6' | 'python3.9';
  discontinueDate?: Date;
}

const allOptions: PythonVersion[] = [
  {
    version: '3.9',
    pipPath: 'pip3.9',
    pythonPath: 'python3.9',
    pythonRuntime: 'python3.9',
  },
  {
    version: '3.6',
    pipPath: 'pip3.6',
    pythonPath: 'python3.6',
    pythonRuntime: 'python3.6',
    discontinueDate: new Date('2022-07-18'),
  },
];

const upstreamProvider =
  'This change is the result of a decision made by an upstream infrastructure provider (AWS).';

function getLatestPythonVersion(): PythonVersion {
  return allOptions[0];
}

function getDevPythonVersion(): PythonVersion {
  // Use the system-installed version of `python3` when running `vercel dev`
  return {
    version: '3',
    pipPath: 'pip3',
    pythonPath: 'python3',
    pythonRuntime: 'python3',
  };
}

function isDiscontinued({ discontinueDate }: PythonVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

export function getSupportedPythonVersion(
  pipLockPythonVersion: string | undefined
): PythonVersion {
  let selection = getLatestPythonVersion();

  if (pipLockPythonVersion) {
    const found = allOptions.some(o => {
      // the array is already in order so return the first
      // match which will be the newest version of node
      selection = o;
      return o.version === pipLockPythonVersion;
    });
    if (!found) {
      console.warn(
        `Warning: Invalid Python version "${version}" detected in Pipfile.lock will be ignored. http://vercel.link/python-version`
      );
    }
  }

  if (isDiscontinued(selection)) {
    const intro = `Python Version "${selection.version}" detected in Pipfile.lock is discontinued and must be upgraded.`;
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'http://vercel.link/python-version',
      message: `${intro} ${upstreamProvider}`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    console.warn(
      `Error: Python version ${selection.version} detected in Pipfile.lock is deprecated. Deployments created on or after ${d} will fail to build. ${upstreamProvider}`
    );
  }

  return selection;
}

export const build = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}: BuildOptions) => {
  let pythonVersion = meta.isDev
    ? getDevPythonVersion()
    : getLatestPythonVersion();

  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
    config,
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

    try {
      const json = await readFile(join(pipfileLockDir, 'Pipfile.lock'), 'utf8');
      const obj = JSON.parse(json);
      const version = obj?._meta?.requires?.python_version;
      if (!meta.isDev) {
        pythonVersion = getSupportedPythonVersion(version);
      }
    } catch (err) {
      throw new NowBuildError({
        code: 'INVALID_PIPFILE_LOCK',
        message: 'Unable to parse Pipfile.lock',
      });
    }

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
    runtime: pythonVersion.pythonRuntime,
    environment: {},
  });

  return { output: lambda };
};

export { shouldServe };

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
