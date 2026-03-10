import fs from 'fs';
import { join, dirname, basename, parse } from 'path';
import {
  VERCEL_RUNTIME_VERSION,
  VERCEL_WORKERS_VERSION,
} from './package-versions';
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
  Span,
  BUILDER_INSTALLER_STEP,
  BUILDER_COMPILE_STEP,
  type BuildOptions,
  type GlobOptions,
  type BuildV3,
  type Files,
  type ShouldServe,
  FileFsRef,
  PythonFramework,
  type PrepareCache,
} from '@vercel/build-utils';
import {
  discoverPackage,
  ensureUvProject,
  resolveVendorDir,
  installRequirementsFile,
  installRequirement,
} from './install';
import { PythonDependencyExternalizer } from './dependency-externalizer';
import { UvRunner, getUvBinaryOrInstall, getUvCacheDir } from './uv';
import { resolvePythonVersion, pythonVersionString } from './version';
import { startDevServer } from './start-dev-server';
import { runPyprojectScript, ensureVenv, createVenvEnv } from './utils';
import { runQuirks } from './quirks';
import { getDjangoSettings } from './django';
import { containsTopLevelCallable } from '@vercel/python-analysis';

const writeFile = fs.promises.writeFile;

import {
  PYTHON_CANDIDATE_ENTRYPOINTS,
  detectPythonEntrypoint,
  type DetectedPythonEntrypoint,
} from './entrypoint';

export const version = 3;

interface FrameworkHookContext {
  pythonEnv: NodeJS.ProcessEnv;
  projectDir: string;
  entrypoint: string;
  detected: DetectedPythonEntrypoint | undefined;
}

interface FrameworkHookResult {
  entrypoint?: string;
}

type FrameworkHook = (
  ctx: FrameworkHookContext
) => Promise<FrameworkHookResult | void>;

export async function runFrameworkHook(
  framework: string | undefined,
  ctx: FrameworkHookContext
): Promise<FrameworkHookResult | void> {
  const hook = framework
    ? frameworkHooks[framework as PythonFramework]
    : undefined;
  return hook?.(ctx);
}

const frameworkHooks: Partial<Record<PythonFramework, FrameworkHook>> = {
  django: async ({ pythonEnv, projectDir, detected }) => {
    if (detected?.baseDir === undefined) {
      debug('Django hook: no manage.py detected, skipping');
      return;
    }
    const settings = await getDjangoSettings(projectDir, pythonEnv);
    debug(`Django settings: ${JSON.stringify(settings)}`);
    if (!settings) return;

    const baseDir = detected?.baseDir ?? '';
    const asgiApp = settings['ASGI_APPLICATION'];
    if (typeof asgiApp === 'string') {
      const rel = `${asgiApp.split('.').slice(0, -1).join('/')}.py`;
      const entrypoint = baseDir ? `${baseDir}/${rel}` : rel;
      debug(`Django hook: ASGI entrypoint: ${entrypoint}`);
      return { entrypoint };
    }
    const wsgiApp = settings['WSGI_APPLICATION'];
    if (typeof wsgiApp === 'string') {
      const rel = `${wsgiApp.split('.').slice(0, -1).join('/')}.py`;
      const entrypoint = baseDir ? `${baseDir}/${rel}` : rel;
      debug(`Django hook: WSGI entrypoint: ${entrypoint}`);
      return { entrypoint };
    }
  },
};

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
  span: parentSpan,
}) => {
  const builderSpan = parentSpan ?? new Span({ name: 'vc.builder' });
  const framework = config?.framework;
  const shouldInstallVercelWorkers = config?.hasWorkerServices === true;
  let spawnEnv: NodeJS.ProcessEnv | undefined;
  // Custom install command from dashboard/project settings, if any.
  let projectInstallCommand: string | undefined;
  // Track whether a custom build or install command was used.
  // When true, runtime dependency installation is disabled because
  // custom commands may install dependencies not tracked in uv.lock.
  let hasCustomCommand = false;

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

  let fsFiles = await glob('**', workPath);

  // Zero config entrypoint discovery
  let detected: DetectedPythonEntrypoint | undefined;
  let entrypointNotFound: NowBuildError | undefined;
  if (
    isPythonFramework(framework) &&
    // XXX: we might want to detect anyway for django!
    (!fsFiles[entrypoint] || !entrypoint.endsWith('.py'))
  ) {
    detected =
      (await detectPythonEntrypoint(
        config.framework as PythonFramework,
        workPath,
        entrypoint
      )) ?? undefined;
    if (detected?.entrypoint) {
      debug(
        `Resolved Python entrypoint to "${detected.entrypoint}" (configured "${entrypoint}" not found).`
      );
      entrypoint = detected.entrypoint;
    } else {
      const searchedList = PYTHON_CANDIDATE_ENTRYPOINTS.join(', ');
      entrypointNotFound = new NowBuildError({
        code: `${framework.toUpperCase()}_ENTRYPOINT_NOT_FOUND`,
        message: `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searchedList}.`,
        link: `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`,
        action: 'Learn More',
      });
    }
  }

  if (entrypointNotFound && detected?.baseDir === undefined) {
    throw entrypointNotFound;
  }

  const entryDirectory = detected?.baseDir ?? dirname(entrypoint);

  const entrypointAbsDir = join(workPath, entryDirectory);
  const rootDir = repoRootPath ?? workPath;

  const pythonPackage = await builderSpan
    .child('vc.builder.python.discover')
    .trace(() =>
      discoverPackage({
        entrypointDir: entrypointAbsDir,
        rootDir,
      })
    );

  const { pythonVersion, pinVersionFilePath } = await builderSpan
    .child('vc.builder.python.version')
    .trace(versionSpan => {
      const resolution = resolvePythonVersion({
        isDev: meta.isDev,
        pythonPackage,
        rootDir,
      });
      versionSpan.setAttributes({
        'python.version': pythonVersionString(resolution.pythonVersion),
        'python.versionSource': resolution.versionSource,
      });
      return resolution;
    });

  if (pinVersionFilePath) {
    console.log(
      `Writing .python-version file with version ${pythonVersionString(pythonVersion)}`
    );
    await writeFile(
      pinVersionFilePath,
      `${pythonVersionString(pythonVersion)}\n`
    );
  }

  fsFiles = await glob('**', workPath);

  // Create a virtual environment under ".vercel/python/.venv" so dependencies
  // can be installed via `uv sync` and then vendored into the Lambda bundle.
  const venvPath = join(workPath, '.vercel', 'python', '.venv');
  const uvCacheDir = getUvCacheDir(workPath);
  await builderSpan.child('vc.builder.python.venv').trace(async () => {
    await ensureVenv({
      pythonPath: pythonVersion.pythonPath,
      venvPath,
      uvCacheDir,
    });
  });

  // For Python frameworks, set up the env and extract the install command (vercel.json/dashboard)
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
  }

  const baseEnv = spawnEnv || process.env;
  const pythonEnv = createVenvEnv(venvPath, baseEnv, uvCacheDir);

  pythonEnv.VERCEL_PYTHON_VENV_PATH = venvPath;

  // If a custom install command is configured, treat it as an override for
  // the default dependency installation: run the command inside the build
  // virtualenv
  let assumeDepsInstalled = false;

  let uv: UvRunner;
  try {
    const uvPath = await getUvBinaryOrInstall(pythonVersion.pythonPath);
    console.log(`Using uv at "${uvPath}"`);
    uv = new UvRunner(uvPath, uvCacheDir);
  } catch (err) {
    console.log('Failed to install or locate uv');
    throw new Error(
      `uv is required for this project but failed to install: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Track the lock file path and project info for package classification (used when runtime install is enabled)
  let uvLockPath: string | null = null;
  let uvProjectDir: string | null = null;
  let projectName: string | undefined;
  let noBuildCheckFailed = false;

  await builderSpan
    .child(BUILDER_INSTALLER_STEP, {
      installCommand: projectInstallCommand || undefined,
    })
    .trace(async () => {
      if (projectInstallCommand) {
        console.log(
          `Running "install" command: \`${projectInstallCommand}\`...`
        );
        await execCommand(projectInstallCommand, {
          env: pythonEnv,
          cwd: workPath,
        });
        assumeDepsInstalled = true;
        hasCustomCommand = true;
      } else {
        // Check and run a custom vercel install command from project manifest.
        // This will return `false` if no script was ran.
        assumeDepsInstalled = await runPyprojectScript(
          workPath,
          ['vercel-install', 'now-install', 'install'],
          pythonEnv,
          /* useUserVirtualEnv */ false
        );
        if (assumeDepsInstalled) {
          hasCustomCommand = true;
        }
      }

      if (!assumeDepsInstalled) {
        // Default installation path: use uv to normalize manifests into a uv.lock and
        // sync dependencies into the virtualenv, including required runtime deps.
        // Ensure all installation paths are normalized into a pyproject.toml and uv.lock
        // for consistent installation logic and idempotency.
        const { projectDir, lockPath, lockFileProvidedByUser } =
          await ensureUvProject({
            workPath,
            rootDir,
            pythonPackage,
            pythonVersion: pythonVersionString(pythonVersion),
            uv,
            generateLockFile: true,
            requireBinaryWheels: false,
          });

        uvLockPath = lockPath;
        uvProjectDir = projectDir;

        // Get the project name from the already-discovered package info
        projectName = pythonPackage?.manifest?.data?.project?.name;

        // For user-provided lock files, check if all packages have binary wheels
        // available BEFORE running the actual sync. We track this result so we can
        // error later if runtime dependency installation is needed (which requires
        // all public packages to have pre-built wheels).
        if (lockFileProvidedByUser) {
          try {
            await uv.sync({
              venvPath,
              projectDir,
              frozen: true,
              noBuild: true,
              noInstallProject: true,
            });
          } catch (err) {
            // Note the failure but don't error yet - we only need wheels
            // if runtime dependency install is required (bundle > 250MB)
            noBuildCheckFailed = true;
            debug(
              `--no-build check failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // `ensureUvProject` would have produced a `pyproject.toml` or `uv.lock`
        // so we can use `uv sync` to install dependencies into the active
        // virtual environment.
        // Use --frozen for user-provided lock files (respects exact versions),
        // --locked for generated lock files (validates consistency).
        await uv.sync({
          venvPath,
          projectDir,
          frozen: lockFileProvidedByUser,
          locked: !lockFileProvidedByUser,
        });
      }
    });

  // Run the project build command (if any) AFTER dependencies are installed.
  if (isPythonFramework(framework)) {
    const projectBuildCommand =
      config?.projectSettings?.buildCommand ??
      // fallback if provided directly on config (some callers set this)
      (config as any)?.buildCommand;
    await builderSpan
      .child(BUILDER_COMPILE_STEP, {
        buildCommand: projectBuildCommand || undefined,
      })
      .trace(async () => {
        if (projectBuildCommand) {
          console.log(`Running "${projectBuildCommand}"`);
          await execCommand(projectBuildCommand, {
            env: pythonEnv,
            cwd: workPath,
          });
        } else {
          await runPyprojectScript(
            workPath,
            ['vercel-build', 'now-build', 'build'],
            pythonEnv
          );
        }
      });
  }

  // Run per-framework post-build hooks (e.g. collectstatic for Django).
  const hookResult = await runFrameworkHook(framework, {
    pythonEnv,
    projectDir: join(workPath, entryDirectory),
    entrypoint,
    detected,
  });
  if (entrypointNotFound && hookResult?.entrypoint) {
    entrypoint = hookResult.entrypoint;
    entrypointNotFound = undefined;
  }

  if (entrypointNotFound) {
    throw entrypointNotFound;
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

  if (shouldInstallVercelWorkers) {
    // Optional override used by CI/preview builds to test in-repo vercel-workers wheels.
    const workersDep =
      baseEnv.VERCEL_WORKERS_PYTHON ||
      `vercel-workers==${VERCEL_WORKERS_VERSION}`;
    debug(`Installing ${workersDep}`);
    await uv.pip({
      venvPath,
      projectDir: join(workPath, entryDirectory),
      args: ['install', workersDep],
    });
  }

  // Run quirks: detect dependencies that need special handling (e.g. prisma)
  // and perform fix-up routines before bundling.
  const quirksResult = await runQuirks({ venvPath, pythonEnv, workPath });

  // Apply build-time env vars from quirks so subsequent build steps can use them
  if (quirksResult.buildEnv) {
    Object.assign(pythonEnv, quirksResult.buildEnv);
  }
  debug('Entrypoint is', entrypoint);
  const moduleName = entrypoint.replace(/\//g, '.').replace(/\.py$/i, '');
  const handlerFunction =
    typeof config?.handlerFunction === 'string'
      ? config.handlerFunction
      : undefined;

  if (handlerFunction) {
    const entrypointPath = join(workPath, entrypoint);
    const source = await fs.promises.readFile(entrypointPath, 'utf-8');
    const found = await containsTopLevelCallable(source, handlerFunction);
    if (!found) {
      throw new NowBuildError({
        code: 'PYTHON_HANDLER_NOT_FOUND',
        message:
          `Handler function "${handlerFunction}" not found in ${entrypoint}. ` +
          `Ensure it is defined at the module's top level.`,
      });
    }
  }

  const vendorDir = resolveVendorDir();

  // Since `vercel dev` renames source files, we must reference the original
  const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
  const entrypointWithSuffix = `${entrypoint}${suffix}`;
  debug('Entrypoint with suffix is', entrypointWithSuffix);

  const handlerFuncEnvLine = handlerFunction
    ? `\n  "__VC_HANDLER_FUNC_NAME": "${handlerFunction}",`
    : '';

  const runtimeTrampoline = `
import importlib
import os
import os.path
import site
import sys

_here = os.path.dirname(__file__)

os.environ.update({
  "__VC_HANDLER_MODULE_NAME": "${moduleName}",
  "__VC_HANDLER_ENTRYPOINT": "${entrypointWithSuffix}",
  "__VC_HANDLER_ENTRYPOINT_ABS": os.path.join(_here, "${entrypointWithSuffix}"),
  "__VC_HANDLER_VENDOR_DIR": "${vendorDir}",${handlerFuncEnvLine}
})

_vendor_rel = '${vendorDir}'
_vendor = os.path.normpath(os.path.join(_here, _vendor_rel))

if os.path.isdir(_vendor):
    # Process .pth files like a real site-packages dir
    site.addsitedir(_vendor)

    # Move _vendor to the front (after script dir if present)
    try:
        while _vendor in sys.path:
            sys.path.remove(_vendor)
    except ValueError:
        pass

    # Put vendored deps ahead of site-packages but after the script dir
    idx = 1 if (sys.path and sys.path[0] in ('', _here)) else 0
    sys.path.insert(idx, _vendor)

    importlib.invalidate_caches()

from vercel_runtime.vc_init import vc_handler
`;

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
  lambdaEnv.VERCEL_WAIT_UNTIL_TIMEOUT = String(config.maxDuration ?? 30);
  Object.assign(lambdaEnv, quirksResult.env);

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);

  // Bundle dependencies, using runtime installation for oversized bundles
  const depExternalizer = new PythonDependencyExternalizer({
    venvPath,
    vendorDir,
    workPath,
    uvLockPath,
    uvProjectDir,
    projectName,
    noBuildCheckFailed,
    pythonPath: pythonVersion.pythonPath,
    hasCustomCommand,
    alwaysBundlePackages: [
      ...(quirksResult.alwaysBundlePackages ?? []),
      ...(shouldInstallVercelWorkers
        ? ['vercel-workers', 'vercel_workers']
        : []),
    ],
  });

  await builderSpan
    .child('vc.builder.python.bundle')
    .trace(async bundleSpan => {
      const depAnalysis = await depExternalizer.analyze(files);

      bundleSpan.setAttributes({
        'python.bundle.totalSizeBytes': String(depAnalysis.totalBundleSize),
        'python.bundle.runtimeInstallEnabled': String(
          depAnalysis.runtimeInstallEnabled
        ),
      });

      if (depAnalysis.runtimeInstallEnabled) {
        await depExternalizer.generateBundle(files);
      } else {
        // Bundle all dependencies since we're not doing runtime installation
        for (const [p, f] of Object.entries(depAnalysis.allVendorFiles)) {
          files[p] = f;
        }
      }
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

async function readBuildOutputV3Config(
  workPath: string
): Promise<{ cache?: string[] } | undefined> {
  try {
    const configPath = join(workPath, '.vercel', 'output', 'config.json');
    return JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  return undefined;
}

export const prepareCache: PrepareCache = async ({
  repoRootPath,
  workPath,
}) => {
  const cacheFiles: Files = {};
  const root = repoRootPath || workPath;
  const ignore = ['**/*.pyc', '**/__pycache__/**'];

  const configV3 = await readBuildOutputV3Config(workPath);
  if (configV3?.cache && Array.isArray(configV3.cache)) {
    for (const cacheGlob of configV3.cache) {
      Object.assign(cacheFiles, await glob(cacheGlob, workPath));
    }
    return cacheFiles;
  }

  Object.assign(
    cacheFiles,
    await glob('**/.vercel/python/.venv/**', { cwd: root, ignore })
  );
  Object.assign(
    cacheFiles,
    await glob('**/.vercel/python/cache/uv/**', { cwd: root, ignore })
  );

  return cacheFiles;
};

export const shouldServe: ShouldServe = opts => {
  const framework = opts.config.framework;
  if (isPythonFramework(framework)) {
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
