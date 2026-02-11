import fs from 'fs';
import { promisify } from 'util';
import { join, dirname, basename, parse } from 'path';
import { VERCEL_RUNTIME_VERSION } from './runtime-version';
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
  isPythonFramework,
  type BuildOptions,
  type GlobOptions,
  type BuildV3,
  type Files,
  type ShouldServe,
  FileFsRef,
  PythonFramework,
} from '@vercel/build-utils';
import {
  ensureUvProject,
  resolveVendorDir,
  mirrorSitePackagesIntoVendor,
  mirrorPrivatePackagesIntoVendor,
  installRequirementsFile,
  installRequirement,
  calculateBundleSize,
  LAMBDA_SIZE_THRESHOLD_BYTES,
} from './install';
import {
  classifyPackages,
  generateRuntimeRequirements,
  parseUvLock,
} from './packages';
import { detectInstallSource } from './install';
import {
  UvRunner,
  getUvBinaryOrInstall,
  getUvBinaryForBundling,
  UV_BUNDLE_DIR,
} from './uv';
import { readConfigFile } from '@vercel/build-utils';
import {
  getSupportedPythonVersion,
  DEFAULT_PYTHON_VERSION,
  parseVersionTuple,
  compareTuples,
} from './version';
import { startDevServer } from './start-dev-server';
import {
  runPyprojectScript,
  findDir,
  ensureVenv,
  createVenvEnv,
} from './utils';
import { renderTrampoline } from './trampoline';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

import {
  PYTHON_CANDIDATE_ENTRYPOINTS,
  detectPythonEntrypoint,
} from './entrypoint';

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

export const build: BuildV3 = async ({
  workPath,
  repoRootPath,
  files: originalFiles,
  entrypoint,
  meta = {},
  config,
}) => {
  const framework = config?.framework;
  let spawnEnv: NodeJS.ProcessEnv | undefined;
  // Custom install command from dashboard/project settings, if any.
  let projectInstallCommand: string | undefined;

  debug(`workPath: ${workPath}`);

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

  // For Python frameworks, also honor project install/build commands (vercel.json/dashboard)
  if (isPythonFramework(framework)) {
    const {
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      turboSupportsCorepackHome,
    } = await scanParentDirs(workPath, true);
    spawnEnv = getEnvForPackageManager({
      cliType,
      lockfileVersion,
      packageJsonPackageManager,
      env: process.env,
      turboSupportsCorepackHome,
      projectCreatedAt: config?.projectSettings?.createdAt,
    });

    const installCommand = config?.projectSettings?.installCommand;
    if (typeof installCommand === 'string') {
      const trimmed = installCommand.trim();
      if (trimmed) {
        projectInstallCommand = trimmed;
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
    isPythonFramework(framework) &&
    (!fsFiles[entrypoint] || !entrypoint.endsWith('.py'))
  ) {
    const detected = await detectPythonEntrypoint(
      config.framework as PythonFramework,
      workPath,
      entrypoint
    );
    if (detected) {
      debug(
        `Resolved Python entrypoint to "${detected}" (configured "${entrypoint}" not found).`
      );
      entrypoint = detected;
    } else {
      const searchedList = PYTHON_CANDIDATE_ENTRYPOINTS.join(', ');
      throw new NowBuildError({
        code: `${framework.toUpperCase()}_ENTRYPOINT_NOT_FOUND`,
        message: `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searchedList}.`,
        link: `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`,
        action: 'Learn More',
      });
    }
  }

  const entryDirectory = dirname(entrypoint);

  const pyprojectDir = findDir({
    file: 'pyproject.toml',
    entryDirectory,
    workPath,
    fsFiles,
  });

  const pipfileLockDir = findDir({
    file: 'Pipfile.lock',
    entryDirectory,
    workPath,
    fsFiles,
  });

  const pythonVersionFileDir = findDir({
    file: '.python-version',
    entryDirectory,
    workPath,
    fsFiles,
  });

  // Determine Python version from .python-version, pyproject.toml, or Pipfile.lock if present.
  let declaredPythonVersion:
    | {
        version: string;
        source: 'Pipfile.lock' | 'pyproject.toml' | '.python-version';
      }
    | undefined;

  // .python-version is the highest priority because its what uv will use to select dependencies
  if (pythonVersionFileDir) {
    try {
      const content = await readFile(
        join(pythonVersionFileDir, '.python-version'),
        'utf8'
      );
      const version = parsePythonVersionFile(content);
      if (version) {
        declaredPythonVersion = { version, source: '.python-version' };
        debug(`Found Python version ${version} in .python-version`);
      }
    } catch (err) {
      debug('Failed to read .python-version file', err);
    }
  }

  if (!declaredPythonVersion && pyprojectDir) {
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
  }

  if (!declaredPythonVersion && pipfileLockDir) {
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

  // Write a .python-version file on behalf of the user when:
  // no .python-version file exists and the required version in pyproject.toml
  // is <= DEFAULT_PYTHON_VERSION
  const selectedVersionTuple = parseVersionTuple(pythonVersion.version);
  const defaultVersionTuple = parseVersionTuple(DEFAULT_PYTHON_VERSION);
  if (
    !pythonVersionFileDir &&
    pyprojectDir &&
    declaredPythonVersion?.source === 'pyproject.toml' &&
    selectedVersionTuple &&
    defaultVersionTuple &&
    compareTuples(selectedVersionTuple, defaultVersionTuple) <= 0
  ) {
    const pythonVersionFilePath = join(pyprojectDir, '.python-version');
    await writeFile(pythonVersionFilePath, `${pythonVersion.version}\n`);
    console.log(
      `Writing .python-version file with version ${pythonVersion.version}`
    );
  }

  fsFiles = await glob('**', workPath);

  // Create a virtual environment under ".vercel/python/.venv" so dependencies
  // can be installed via `uv sync` and then vendored into the Lambda bundle.
  const venvPath = join(workPath, '.vercel', 'python', '.venv');
  await ensureVenv({
    pythonPath: pythonVersion.pythonPath,
    venvPath,
  });

  const baseEnv = spawnEnv || process.env;
  const pythonEnv = createVenvEnv(venvPath, baseEnv);

  pythonEnv.VERCEL_PYTHON_VENV_PATH = venvPath;

  // If a custom install command is configured, treat it as an override for
  // the default dependency installation: run the command inside the build
  // virtualenv
  let assumeDepsInstalled = false;
  if (projectInstallCommand) {
    console.log(`Running "install" command: \`${projectInstallCommand}\`...`);
    await execCommand(projectInstallCommand, {
      env: pythonEnv,
      cwd: workPath,
    });
    assumeDepsInstalled = true;
  } else {
    // Check and run a custom vercel install command from project manifest.
    // This will return `false` if no script was ran.
    assumeDepsInstalled = await runPyprojectScript(
      workPath,
      ['vercel-install', 'now-install', 'install'],
      pythonEnv,
      /* useUserVirtualEnv */ false
    );
  }

  let uv: UvRunner;
  try {
    const uvPath = await getUvBinaryOrInstall(pythonVersion.pythonPath);
    console.log(`Using uv at "${uvPath}"`);
    uv = new UvRunner(uvPath);
  } catch (err) {
    console.log('Failed to install or locate uv');
    throw new Error(
      `uv is required for this project but failed to install: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Check if the experimental runtime install feature is enabled
  const runtimeInstallFeatureEnabled =
    process.env.VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP === '1' ||
    process.env.VERCEL_EXPERIMENTAL_PYTHON_UV_INSTALL_ON_STARTUP === 'true';

  // Track the lock file path and project info for package classification (used when runtime install is enabled)
  let uvLockPath: string | null = null;
  let projectName: string | undefined;

  if (!assumeDepsInstalled) {
    // Default installation path: use uv to normalize manifests into a uv.lock and
    // sync dependencies into the virtualenv, including required runtime deps.
    // Ensure all installation paths are normalized into a pyproject.toml and uv.lock
    // for consistent installation logic and idempotency.
    const { projectDir, lockPath } = await ensureUvProject({
      workPath,
      entryDirectory,
      repoRootPath,
      pythonVersion: pythonVersion.version,
      uv,
      generateLockFile: runtimeInstallFeatureEnabled,
    });

    uvLockPath = lockPath;

    // Get the project name from python-analysis for package classification
    const installInfo = await detectInstallSource({
      workPath,
      entryDirectory,
      repoRootPath,
    });
    projectName = installInfo.pythonPackage?.manifest?.data?.project?.name;

    // `ensureUvProject` would have produced a `pyproject.toml` or `uv.lock`
    // so we can use `uv sync` to install dependencies into the active
    // virtual environment.
    await uv.sync({
      venvPath,
      projectDir,
      locked: true,
    });
  }

  // Ensure correct version of vercel-runtime is installed.
  //
  // We intentionally do not inject vercel-runtime into the manifest
  // as that would result in surprising modifications in working
  // directories when running `vercel build` locally.
  //
  // Note: running sync removes any package that is not in the lockfile or
  // manifest, which means that it is NOT SAFE to re-run `uv sync` at any
  // point after as that would effectively remove vercel-runtime from the
  // bundle rendering the function inoperable.
  const runtimeDep =
    baseEnv.VERCEL_RUNTIME_PYTHON ||
    `vercel-runtime==${VERCEL_RUNTIME_VERSION}`;
  debug(`Installing ${runtimeDep}`);
  await uv.pip({
    venvPath,
    projectDir: join(workPath, entryDirectory),
    args: ['install', runtimeDep],
  });

  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/i, '');
  const vendorDir = resolveVendorDir();

  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);

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

  // Bundle dependencies
  const allVendorFiles = await mirrorSitePackagesIntoVendor({
    venvPath,
    vendorDirName: vendorDir,
  });

  // Calculate the total bundle size with all dependencies
  const tempFilesForSizing: Files = { ...files };
  for (const [p, f] of Object.entries(allVendorFiles)) {
    tempFilesForSizing[p] = f;
  }
  const totalBundleSize = await calculateBundleSize(tempFilesForSizing);
  const totalBundleSizeMB = (totalBundleSize / (1024 * 1024)).toFixed(2);
  debug(`Total bundle size: ${totalBundleSizeMB} MB`);

  // Determine if runtime dependency installation is needed
  const runtimeInstallEnabled =
    runtimeInstallFeatureEnabled &&
    totalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES &&
    uvLockPath !== null;

  if (runtimeInstallEnabled && uvLockPath) {
    console.log(
      `Bundle size (${totalBundleSizeMB} MB) exceeds limit. ` +
        `Enabling runtime dependency installation.`
    );

    // Read and parse the uv.lock file
    const lockContent = await fs.promises.readFile(uvLockPath, 'utf8');
    const lockFile = parseUvLock(lockContent);

    // Exclude the project name from runtime installation requirements.
    const excludePackages: string[] = [];
    if (projectName) {
      excludePackages.push(projectName);
      debug(
        `Excluding project package "${projectName}" from runtime installation`
      );
    }

    const classification = classifyPackages({
      lockFile,
      excludePackages,
    });
    debug(
      `Package classification: ${classification.privatePackages.length} private, ` +
        `${classification.publicPackages.length} public`
    );

    if (classification.publicPackages.length > 0) {
      // Bundle only private packages and vercel-runtime
      const privatePackagesWithRuntime = [
        ...classification.privatePackages,
        'vercel-runtime',
        'vercel_runtime',
      ];

      const privateVendorFiles = await mirrorPrivatePackagesIntoVendor({
        venvPath,
        vendorDirName: vendorDir,
        privatePackages: privatePackagesWithRuntime,
      });

      for (const [p, f] of Object.entries(privateVendorFiles)) {
        files[p] = f;
      }

      // Everything else gets put into _runtime_requirements.txt for installation at runtime
      const runtimeRequirementsContent =
        generateRuntimeRequirements(classification);
      const runtimeRequirementsPath = `${UV_BUNDLE_DIR}/_runtime_requirements.txt`;
      files[runtimeRequirementsPath] = new FileBlob({
        data: runtimeRequirementsContent,
      });

      // skip the uv copy when running vercel build locally
      if (process.env.VERCEL_BUILD_IMAGE) {
        // Add the uv binary to the lambda zip
        try {
          const uvBinaryPath = await getUvBinaryForBundling(
            pythonVersion.pythonPath
          );

          const uvBundleDir = join(workPath, UV_BUNDLE_DIR);
          const uvLocalPath = join(uvBundleDir, 'uv');
          await fs.promises.mkdir(uvBundleDir, { recursive: true });
          await fs.promises.copyFile(uvBinaryPath, uvLocalPath);
          await fs.promises.chmod(uvLocalPath, 0o755);

          const uvBundlePath = `${UV_BUNDLE_DIR}/uv`;
          files[uvBundlePath] = new FileFsRef({
            fsPath: uvLocalPath,
            mode: 0o100755, // Regular file + executable
          });
          debug(`Bundled uv binary from ${uvBinaryPath} to ${uvLocalPath}`);
        } catch (err) {
          throw new NowBuildError({
            code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
            message: `Failed to bundle uv binary for runtime installation: ${
              err instanceof Error ? err.message : String(err)
            }`,
          });
        }
      }
    } else {
      throw new NowBuildError({
        code: 'RUNTIME_DEPENDENCY_INSTALLATION_FAILED',
        message:
          'Bundle size exceeds limit but no public packages found for runtime installation.',
      });
    }
  } else {
    // Bundle all dependencies since we're not doing runtime installation
    for (const [p, f] of Object.entries(allVendorFiles)) {
      files[p] = f;
    }
  }

  const runtimeTrampoline = renderTrampoline({
    moduleName,
    entrypointWithSuffix,
    vendorDir,
    runtimeInstallEnabled,
    uvBundleDir: UV_BUNDLE_DIR,
  });

  // in order to allow the user to have `server.py`, we
  // need our `server.py` to be called something else
  const handlerPyFilename = 'vc__handler__python';

  files[`${handlerPyFilename}.py`] = new FileBlob({ data: runtimeTrampoline });

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

// Parses a .python-version file and returns the first non-empty, non-comment line.
// Supports both exact versions (e.g. "3.12") and version specifiers (e.g. ">=3.12").
function parsePythonVersionFile(content: string): string | undefined {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return undefined;
}

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
