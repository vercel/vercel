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
  execCommand,
  scanParentDirs,
  getEnvForPackageManager,
  type BuildOptions,
  type GlobOptions,
  type BuildV3,
  type Files,
  type ShouldServe,
  FileFsRef,
} from '@vercel/build-utils';
import {
  installRequirementsIntoVenv,
  resolveVendorDir,
  exportRequirementsFromPipfile,
  getUvBinaryOrInstall,
  syncProjectWithUv,
  mirrorSitePackagesIntoVendor,
  ensureRuntimeDependencies,
} from './install';
import { readConfigFile } from '@vercel/build-utils';
import { getSupportedPythonVersion } from './version';
import { startDevServer } from './start-dev-server';
import { runPyprojectScript, ensureVenv } from './utils';
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

import {
  FASTAPI_CANDIDATE_ENTRYPOINTS,
  FLASK_CANDIDATE_ENTRYPOINTS,
  detectPythonEntrypoint,
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
  const framework = config?.framework;
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

  // For FastAPI/Flask, also honor project install/build commands (vercel.json/dashboard)
  if (framework === 'fastapi' || framework === 'flask') {
    const {
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      turboSupportsCorepackHome,
    } = await scanParentDirs(workPath, true);
    const spawnEnv = getEnvForPackageManager({
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      env: process.env,
      turboSupportsCorepackHome,
      projectCreatedAt: config?.projectSettings?.createdAt,
    });

    const installCommand = config?.projectSettings?.installCommand;
    if (typeof installCommand === 'string') {
      if (installCommand.trim()) {
        console.log(`Running "install" command: \`${installCommand}\`...`);
        await execCommand(installCommand, {
          env: spawnEnv,
          cwd: workPath,
        });
      } else {
        console.log('Skipping "install" command...');
      }
    }

    const projectBuildCommand =
      config?.projectSettings?.buildCommand ??
      // fallback if provided directly on config (some callers set this)
      (config as any)?.buildCommand;
    if (projectBuildCommand) {
      console.log(`Running "${projectBuildCommand}"`);
      await execCommand(projectBuildCommand, {
        env: spawnEnv,
        cwd: workPath,
      });
    } else {
      await runPyprojectScript(
        workPath,
        ['vercel-build', 'now-build', 'build'],
        spawnEnv
      );
    }
  }

  let fsFiles = await glob('**', workPath);

  // Zero config entrypoint discovery
  if (
    (framework === 'fastapi' || framework === 'flask') &&
    (!fsFiles[entrypoint] || !entrypoint.endsWith('.py'))
  ) {
    const detected = await detectPythonEntrypoint(
      config.framework as 'fastapi' | 'flask',
      workPath,
      entrypoint
    );
    if (detected) {
      debug(
        `Resolved Python entrypoint to "${detected}" (configured "${entrypoint}" not found).`
      );
      entrypoint = detected;
    } else {
      const searchedList =
        framework === 'fastapi'
          ? FASTAPI_CANDIDATE_ENTRYPOINTS.join(', ')
          : FLASK_CANDIDATE_ENTRYPOINTS.join(', ');
      throw new NowBuildError({
        code: `${framework.toUpperCase()}_ENTRYPOINT_NOT_FOUND`,
        message: `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searchedList}.`,
        link: `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`,
        action: 'Learn More',
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
  let declaredPythonVersion:
    | { version: string; source: 'Pipfile.lock' | 'pyproject.toml' }
    | undefined;

  if (pyprojectDir) {
    let requiresPython: string | undefined;
    try {
      const pyproject = await readConfigFile<{
        project?: { ['requires-python']?: string };
      }>(join(pyprojectDir, 'pyproject.toml'));
      requiresPython = pyproject?.project?.['requires-python'];
    } catch (err) {
      debug('Failed to parse pyproject.toml', err);
    }
    if (typeof requiresPython === 'string' && requiresPython.trim()) {
      declaredPythonVersion = {
        version: requiresPython.trim(),
        source: 'pyproject.toml',
      };
      debug(`Found requires-python "${requiresPython}" in pyproject.toml`);
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
    if (pyFromLock) {
      declaredPythonVersion = { version: pyFromLock, source: 'Pipfile.lock' };
      debug(`Found Python version ${pyFromLock} in Pipfile.lock`);
    }
  }

  const pythonVersion = getSupportedPythonVersion({
    isDev: meta.isDev,
    declaredPythonVersion,
  });

  fsFiles = await glob('**', workPath);
  const requirementsTxt = join(entryDirectory, 'requirements.txt');
  // Create the virtual environment under ".vercel/python/.venv" so it can be
  // cached on disk while we mirror its site-packages into the Lambda bundle.
  const venvPath = join(workPath, '.vercel', 'python', '.venv');
  await ensureVenv({
    pythonPath: pythonVersion.pythonPath,
    venvPath,
  });

  let installationSource: string | undefined;
  if (uvLockDir && pyprojectDir) {
    installationSource = 'uv.lock';
  } else if (pyprojectDir) {
    installationSource = 'pyproject.toml';
  } else if (pipfileLockDir) {
    installationSource = 'Pipfile.lock';
  } else if (pipfileDir) {
    installationSource = 'Pipfile';
  } else if (fsFiles[requirementsTxt] || fsFiles['requirements.txt']) {
    installationSource = 'requirements.txt';
  }
  if (installationSource) {
    console.log(
      `Installing required dependencies from ${installationSource}...`
    );
  } else {
    console.log('Installing required dependencies...');
  }

  let uvPath: string | null = null;
  try {
    uvPath = await getUvBinaryOrInstall(pythonVersion.pythonPath);
    console.log(`Using uv at "${uvPath}"`);
  } catch (err) {
    if (uvLockDir || (pyprojectDir && !hasReqLocal && !hasReqGlobal)) {
      console.log('Failed to install uv');
      throw new Error(
        `uv is required for this project but failed to install: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    debug('Failed to install uv', err);
  }

  let installedFromProjectFiles = false;

  const runtimeDependencies =
    framework === 'flask'
      ? [{ packageSpecifier: 'werkzeug==1.0.1', moduleName: 'werkzeug' }]
      : [
          { packageSpecifier: 'werkzeug==1.0.1', moduleName: 'werkzeug' },
          { packageSpecifier: 'uvicorn==0.38.0', moduleName: 'uvicorn' },
        ];

  // Prefer uv.lock, then pyproject.toml, then Pipfile/Pipfile.lock, then requirements.txt
  const shouldUseUvSync = Boolean(uvLockDir || pyprojectDir);
  if (shouldUseUvSync && uvPath) {
    const projectDir = pyprojectDir || uvLockDir!;
    debug(
      `Running "uv sync" in ${projectDir} (${uvLockDir ? 'locked' : 'unlocked'})`
    );
    await syncProjectWithUv({
      uvPath,
      venvPath,
      projectDir,
      locked: Boolean(uvLockDir),
    });
    installedFromProjectFiles = true;
  } else if (shouldUseUvSync && !uvPath) {
    debug('Skipping uv sync because uv is unavailable');
  } else if (pipfileLockDir || pipfileDir) {
    debug(`Found ${pipfileLockDir ? '"Pipfile.lock"' : '"Pipfile"'}`);
    if (hasReqLocal || hasReqGlobal) {
      debug('Skipping Pipfile export because "requirements.txt" exists');
    } else {
      const exportedReq = await exportRequirementsFromPipfile({
        pythonPath: pythonVersion.pythonPath,
        pipPath: pythonVersion.pipPath,
        uvPath,
        projectDir: pipfileLockDir || pipfileDir!,
        meta,
      });
      await installRequirementsIntoVenv({
        uvPath,
        venvPath,
        cwd: workPath,
        requirementsFile: exportedReq,
      });
      installedFromProjectFiles = true;
    }
  }

  if (!installedFromProjectFiles && fsFiles[requirementsTxt]) {
    debug('Found local "requirements.txt"');
    const requirementsTxtPath = fsFiles[requirementsTxt].fsPath;
    await installRequirementsIntoVenv({
      uvPath,
      venvPath,
      cwd: workPath,
      requirementsFile: requirementsTxtPath,
    });
  } else if (!installedFromProjectFiles && fsFiles['requirements.txt']) {
    debug('Found global "requirements.txt"');
    const requirementsTxtPath = fsFiles['requirements.txt'].fsPath;
    await installRequirementsIntoVenv({
      uvPath,
      venvPath,
      cwd: workPath,
      requirementsFile: requirementsTxtPath,
    });
  }

  await ensureRuntimeDependencies({
    uvPath,
    venvPath,
    cwd: workPath,
    dependencies: runtimeDependencies,
  });

  // Compute cache vendor dir keyed by Python version and entrypoint directory.
  // This directory is used to store a mirrored copy of the venv's site-packages
  // that is actually bundled into the Lambda.
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

  const vendorDirName = resolveVendorDir();
  const vendorFiles = await mirrorSitePackagesIntoVendor({
    venvPath,
    vendorBaseDir,
    vendorDirName,
  });

  const vendorDir = vendorDirName;
  const originalPyPath = join(__dirname, '..', 'vc_init.py');
  const originalHandlerPyContents = await readFile(originalPyPath, 'utf8');
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/i, '');

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
    '**/.mypy_cache/**',
    '**/.ruff_cache/**',
    '**/public/**',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/package-lock.json',
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

  for (const [p, f] of Object.entries(vendorFiles)) {
    files[p] = f;
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
  } else if (framework === 'flask') {
    const requestPath = opts.requestPath.replace(/\/$/, '');
    if (requestPath.startsWith('api') && opts.hasMatched) {
      return false;
    }
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
