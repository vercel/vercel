import fs from 'fs';
import { promisify } from 'util';
import { join, dirname, basename, parse } from 'path';
import {
  download,
  glob,
  Lambda,
  FileBlob,
  debug,
  NowBuildError,
  type BuildOptions,
  type GlobOptions,
  type BuildV3,
  type Files,
  type ShouldServe,
  FileFsRef,
} from '@vercel/build-utils';
import {
  installRequirement,
  installRequirementsFile,
  resolveVendorDir,
  exportRequirementsFromUv,
  exportRequirementsFromPipfile,
} from './install';
import { readConfigFile } from '@vercel/build-utils';
import { getLatestPythonVersion, getSupportedPythonVersion } from './version';
import { startDevServer } from './start-dev-server';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

import {
  FASTAPI_CANDIDATE_ENTRYPOINTS,
  detectFastapiEntrypoint,
} from './entrypoint';

export const version = 3;

function findDir({
  file,
  entryDirectory,
  workPath,
  fsFiles,
}: {
  file: string;
  entryDirectory: string;
  workPath: string;
  fsFiles: Record<string, unknown>;
}): string | null {
  if (fsFiles[join(entryDirectory, file)]) {
    return join(workPath, entryDirectory);
  }

  if (fsFiles[file]) {
    return workPath;
  }

  // Case 3: File not found in either location
  return null;
}

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

export const build: BuildV3 = async ({
  workPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}) => {
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

  let fsFiles = await glob('**', workPath);

  // Zero-config entrypoint discovery
  if (!fsFiles[entrypoint] && config?.framework === 'fastapi') {
    const detected = await detectFastapiEntrypoint(workPath, entrypoint);
    if (detected) {
      debug(
        `Resolved Python entrypoint to "${detected}" (configured "${entrypoint}" not found).`
      );
      entrypoint = detected;
    } else {
      const searchedList = FASTAPI_CANDIDATE_ENTRYPOINTS.join(', ');
      throw new NowBuildError({
        code: 'FASTAPI_ENTRYPOINT_NOT_FOUND',
        message: `No FastAPI entrypoint found. Searched for: ${searchedList}`,
      });
    }
  }

  const entryDirectory = dirname(entrypoint);

  const hasReqLocal = !!fsFiles[join(entryDirectory, 'requirements.txt')];
  const hasReqGlobal = !!fsFiles['requirements.txt'];

  const uvLockDir = findDir({
    file: 'uv.lock',
    entryDirectory,
    workPath,
    fsFiles,
  });

  const pyprojectDir = findDir({
    file: 'pyproject.toml',
    entryDirectory,
    workPath,
    fsFiles,
  });

  const pipfileLockDir = fsFiles[join(entryDirectory, 'Pipfile.lock')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile.lock']
      ? workPath
      : null;
  const pipfileDir = fsFiles[join(entryDirectory, 'Pipfile')]
    ? join(workPath, entryDirectory)
    : fsFiles['Pipfile']
      ? workPath
      : null;

  // Determine Python version from pyproject.toml or Pipfile.lock if present.
  if (pyprojectDir) {
    let requiresPython: string | undefined;
    try {
      const pyproject = await readConfigFile<{
        project?: { ['requires-python']?: string };
      }>(join(pyprojectDir, 'pyproject.toml'));
      requiresPython = pyproject?.project?.['requires-python'];
    } catch {
      debug('Failed to parse pyproject.toml');
    }
    const VERSION_REGEX = /\b\d+\.\d+\b/;
    const exact = requiresPython?.trim().match(VERSION_REGEX)?.[0];
    if (exact) {
      const selected = getSupportedPythonVersion({
        isDev: meta.isDev,
        declaredPythonVersion: { version: exact, source: 'pyproject.toml' },
      });
      pythonVersion = selected;
    }
  } else if (pipfileLockDir) {
    let lock: {
      _meta?: { requires?: { python_version?: string } };
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
    const pyFromLock = lock?._meta?.requires?.python_version;
    pythonVersion = getSupportedPythonVersion({
      isDev: meta.isDev,
      declaredPythonVersion: pyFromLock
        ? { version: pyFromLock, source: 'Pipfile.lock' }
        : undefined,
    });
  }

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');

  // Compute cache vendor dir keyed by Python version and entrypoint directory
  const vendorBaseDir = join(
    workPath,
    '.vercel',
    'python',
    `py${pythonVersion.version}`,
    entryDirectory
  );
  try {
    await fs.promises.mkdir(vendorBaseDir, { recursive: true });
  } catch (err) {
    console.log('Failed to create vendor cache directory');
    throw err;
  }

  console.log('Installing required dependencies...');

  await installRequirement({
    pythonPath: pythonVersion.pythonPath,
    pipPath: pythonVersion.pipPath,
    dependency: 'werkzeug',
    version: '1.0.1',
    workPath: vendorBaseDir,
    meta,
  });

  let installedFromProjectFiles = false;

  // Prefer uv.lock, then pyproject.toml, then Pipfile/Pipfile.lock, then requirements.txt
  if (uvLockDir) {
    debug('Found "uv.lock"');
    if (pyprojectDir) {
      const exportedReq = await exportRequirementsFromUv(
        pythonVersion.pythonPath,
        pyprojectDir,
        { locked: true }
      );
      await installRequirementsFile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        filePath: exportedReq,
        workPath: vendorBaseDir,
        meta,
      });
      installedFromProjectFiles = true;
    } else {
      debug('Skipping uv export because "pyproject.toml" was not found');
    }
  } else if (pyprojectDir) {
    debug('Found "pyproject.toml"');
    if (hasReqLocal || hasReqGlobal) {
      console.log(
        'Detected both pyproject.toml and requirements.txt but no lockfile; using pyproject.toml'
      );
    }
    const exportedReq = await exportRequirementsFromUv(
      pythonVersion.pythonPath,
      pyprojectDir,
      { locked: false }
    );
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: exportedReq,
      workPath: vendorBaseDir,
      meta,
    });
    installedFromProjectFiles = true;
  } else if (pipfileLockDir || pipfileDir) {
    debug(`Found ${pipfileLockDir ? '"Pipfile.lock"' : '"Pipfile"'}`);
    if (hasReqLocal || hasReqGlobal) {
      debug('Skipping Pipfile export because "requirements.txt" exists');
    } else {
      const exportedReq = await exportRequirementsFromPipfile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        projectDir: pipfileLockDir || pipfileDir!,
        meta,
      });
      await installRequirementsFile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        filePath: exportedReq,
        workPath: vendorBaseDir,
        meta,
      });
      installedFromProjectFiles = true;
    }
  }

  if (!installedFromProjectFiles && fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath: vendorBaseDir,
      meta,
    });
  } else if (!installedFromProjectFiles && fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsFile({
      pythonPath: pythonVersion.pythonPath,
      pipPath: pythonVersion.pipPath,
      filePath: requirementsTxtPath,
      workPath: vendorBaseDir,
      meta,
    });
  }

  const originalPyPath = join(__dirname, '..', 'vc_init.py');
  const originalHandlerPyContents = await readFile(originalPyPath, 'utf8');
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/i, '');
  const vendorDir = resolveVendorDir();

  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);
  const handlerPyContents = originalHandlerPyContents
    .replace(/__VC_HANDLER_MODULE_NAME/g, moduleName)
    .replace(/__VC_HANDLER_ENTRYPOINT/g, entrypointWithSuffix)
    .replace(/__VC_HANDLER_VENDOR_DIR/g, vendorDir);

  const predefinedExcludes = [
    '.git/**',
    '.gitignore',
    '.vercel/**',
    '.pnpm-store/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.venv/**',
    '**/venv/**',
    '**/__pycache__/**',
    '**/public/**',
  ];

  const lambdaEnv = {} as Record<string, string>;
  lambdaEnv.PYTHONPATH = vendorDir;

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);

  // Mount cached vendor directory into the Lambda output under `_vendor`
  try {
    const cachedVendorAbs = join(vendorBaseDir, resolveVendorDir());
    if (fs.existsSync(cachedVendorAbs)) {
      const vendorFiles = await glob('**', cachedVendorAbs, resolveVendorDir());
      for (const [p, f] of Object.entries(vendorFiles)) {
        files[p] = f;
      }
    }
  } catch (err) {
    console.log('Failed to include cached vendor directory');
    throw err;
  }

  // in order to allow the user to have `server.py`, we
  // need our `server.py` to be called something else
  const handlerPyFilename = 'vc__handler__python';

  files[`${handlerPyFilename}.py`] = new FileBlob({ data: handlerPyContents });

  // "fasthtml" framework requires a `.sesskey` file to exist,
  // otherwise it tries to create one at runtime, which fails
  // due Lambda's read-only filesystem
  if (config.framework === 'fasthtml') {
    const { SESSKEY = '' } = process.env;
    files['.sesskey'] = new FileBlob({ data: `"${SESSKEY}"` });
  }

  const output = new Lambda({
    files,
    handler: `${handlerPyFilename}.vc_handler`,
    runtime: pythonVersion.runtime,
    environment: lambdaEnv,
    supportsResponseStreaming: true,
  });

  return { output };
};

export { startDevServer };

export const shouldServe: ShouldServe = opts => {
  const framework = opts.config.framework;
  if (framework === 'fastapi') {
    const requestPath = opts.requestPath.replace(/\/$/, '');
    // Don't override API routes if another builder already matched them
    if (requestPath.startsWith('api') && opts.hasMatched) {
      return false;
    }
    // Public assets are served by the static builder / default handler
    return true;
  }
  return defaultShouldServe(opts);
};

export const defaultShouldServe: ShouldServe = ({
  entrypoint,
  files,
  requestPath,
}) => {
  requestPath = requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  entrypoint = entrypoint.replace(/\\/g, '/'); // windows compatibility

  if (entrypoint === requestPath && hasProp(files, entrypoint)) {
    return true;
  }

  const { dir, name } = parse(entrypoint);
  if (name === 'index' && dir === requestPath && hasProp(files, entrypoint)) {
    return true;
  }

  return false;
};

function hasProp(obj: { [path: string]: FileFsRef }, key: string): boolean {
  return Object.hasOwnProperty.call(obj, key);
}

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
