import assert from 'assert';
import fs from 'fs';
import { join, dirname, basename, parse } from 'path';
import {
  VERCEL_RUNTIME_VERSION,
  VERCEL_WORKERS_VERSION,
} from './package-versions';
import {
  download,
  getReportedServiceType,
  glob,
  Lambda,
  FileBlob,
  debug,
  NowBuildError,
  execCommand,
  scanParentDirs,
  getEnvForPackageManager,
  isPythonFramework,
  isScheduleTriggeredService,
  Span,
  BUILDER_INSTALLER_STEP,
  BUILDER_COMPILE_STEP,
  BUILDER_PRE_DEPLOY_STEP,
  sanitizeConsumerName,
  type BuildOptions,
  type GlobOptions,
  type BuildVX,
  type Files,
  type ShouldServe,
  type TriggerEvent,
  FileFsRef,
  PythonFramework,
  type PrepareCache,
} from '@vercel/build-utils';
import {
  discoverPackage,
  ensureUvProject,
  getVenvSitePackagesDirs,
  resolveVendorDir,
  installRequirementsFile,
  installRequirement,
} from './install';
import {
  PythonDependencyExternalizer,
  MAX_LARGE_FUNCTION_UNCOMPRESSED_SIZE,
  lambdaKnapsack,
  calculateBundleSize,
} from './dependency-externalizer';
import {
  UvRunner,
  UV_LINUX_TARGET,
  getUvBinaryOrInstall,
  getUvCacheDir,
  findUvInPath,
  checkUvBinaryVersion,
} from './uv';
import { resolvePythonVersion, pythonVersionString } from './version';
import { generateProjectManifest } from './diagnostics';
import { buildCronRouteTable, getServiceCrons } from './crons';
import { startDevServer } from './start-dev-server';
import {
  runPyprojectScript,
  ensureVenv,
  createVenvEnv,
  getVenvPythonBin,
} from './utils';
import { validateBuildArch } from './platform-info';
import { runQuirks } from './quirks';
import {
  getDjangoSettings,
  runDjangoCollectStatic,
  type DjangoCollectStaticResult,
} from './django';
import { containsTopLevelCallable } from '@vercel/python-analysis';
import {
  collectAppBytecodeFiles,
  getCompileAllAppExcludeRegex,
  runCompileAll,
  shouldUseCompileAll,
  type BytecodeCollectionResult,
} from './compileall';
import {
  getPyprojectSubscribers,
  safePathSegment,
  type Subscriber,
} from './subscribers';

const writeFile = fs.promises.writeFile;
const PYTHON_ENTRYPOINT_DOCS_URL =
  'https://vercel.com/docs/functions/runtimes/python#python-entrypoints';

import {
  detectPythonEntrypoint,
  entrypointToModule,
  type DetectedPythonEntrypoint,
  type PythonEntrypoint,
} from './entrypoint';

export { detectEntrypoint } from './entrypoint';

export const version = -1;

function addFiles(target: Files, source: Files) {
  for (const [p, f] of Object.entries(source)) {
    target[p] = f;
  }
}

function addBytecodeWithinCapacity(
  files: Files,
  bytecodeInfo: BytecodeCollectionResult | undefined,
  capacity: number
): number {
  if (!bytecodeInfo || bytecodeInfo.totalSize <= 0 || capacity <= 0) {
    return capacity;
  }

  if (bytecodeInfo.totalSize <= capacity) {
    addFiles(files, bytecodeInfo.files);
    return capacity - bytecodeInfo.totalSize;
  }

  const selected = lambdaKnapsack(bytecodeInfo.perItemSizes, capacity);
  let remainingCapacity = capacity;
  for (const p of selected) {
    const file = bytecodeInfo.files[p];
    if (!file) continue;
    files[p] = file;
    remainingCapacity -= bytecodeInfo.perItemSizes.get(p) ?? 0;
  }

  return remainingCapacity;
}

async function addVendorBytecodeWithinCapacity({
  files,
  depExternalizer,
  vendorDir,
  bytecodeInfo,
  capacity,
}: {
  files: Files;
  depExternalizer: PythonDependencyExternalizer;
  vendorDir: string;
  bytecodeInfo: BytecodeCollectionResult | undefined;
  capacity: number;
}): Promise<number> {
  if (!bytecodeInfo || bytecodeInfo.totalSize <= 0 || capacity <= 0) {
    return capacity;
  }

  if (bytecodeInfo.totalSize <= capacity) {
    addFiles(files, bytecodeInfo.files);
    return capacity - bytecodeInfo.totalSize;
  }

  const selectedPkgs = lambdaKnapsack(bytecodeInfo.perItemSizes, capacity);
  if (selectedPkgs.length === 0) return capacity;

  const selectedBytecode = await depExternalizer.collectBytecodeFiles({
    vendorDirName: vendorDir,
    includePackages: selectedPkgs,
  });
  addFiles(files, selectedBytecode.files);
  return capacity - selectedBytecode.totalSize;
}

interface FrameworkHookContext {
  pythonEnv: NodeJS.ProcessEnv;
  projectDir: string;
  workPath?: string;
  venvPath?: string;
  entrypoint: string | undefined;
  detected: DetectedPythonEntrypoint | undefined;
}

interface FrameworkHookResult {
  entrypoint?: PythonEntrypoint;
}

interface DjangoFrameworkHookResult extends FrameworkHookResult {
  djangoStatic: DjangoCollectStaticResult | null;
}

type FrameworkHook = (
  ctx: FrameworkHookContext
) => Promise<FrameworkHookResult | void>;

export async function runFrameworkHook(
  framework: string | null | undefined,
  ctx: FrameworkHookContext
): Promise<FrameworkHookResult | void> {
  const hook = framework
    ? frameworkHooks[framework as PythonFramework]
    : undefined;
  return hook?.(ctx);
}

const frameworkHooks: Partial<Record<PythonFramework, FrameworkHook>> = {
  django: async ({
    pythonEnv,
    projectDir,
    workPath,
    venvPath,
    detected,
  }): Promise<DjangoFrameworkHookResult | void> => {
    if (detected?.baseDir === undefined) {
      debug('Django hook: no manage.py detected, skipping');
      return;
    }
    let settingsResult;
    try {
      settingsResult = await getDjangoSettings(projectDir, pythonEnv);
    } catch (err: any) {
      let detail: string;
      if (err?.code === 'ENOENT') {
        detail = `command not found: python\nHint: activate a venv or run with \`uv run vercel dev\``;
      } else {
        detail = err?.stderr || err?.message || String(err);
      }
      throw new NowBuildError({
        code: 'DJANGO_SETTINGS_FAILED',
        message: `Failed to read Django application settings from ${projectDir}/manage.py:\n${detail}`,
      });
    }
    debug(`Django settings: ${JSON.stringify(settingsResult)}`);
    const { djangoSettings, settingsModule, djangoVersion } = settingsResult;
    if (djangoVersion) {
      console.log(`Django ${djangoVersion.join('.')} detected`);
    }

    let resolvedEntrypoint: PythonEntrypoint | undefined;
    const baseDir = detected?.baseDir ?? '';
    const asgiApp = djangoSettings['ASGI_APPLICATION'];
    if (typeof asgiApp === 'string') {
      const parts = asgiApp.split('.');
      const variableName = parts.at(-1)!;
      const rel = `${parts.slice(0, -1).join('/')}.py`;
      const ep = baseDir ? `${baseDir}/${rel}` : rel;
      debug(`Django hook: ASGI entrypoint: ${ep} (variable: ${variableName})`);
      resolvedEntrypoint = { entrypoint: ep, variableName };
    } else {
      const wsgiApp = djangoSettings['WSGI_APPLICATION'];
      if (typeof wsgiApp === 'string') {
        const parts = wsgiApp.split('.');
        const variableName = parts.at(-1)!;
        const rel = `${parts.slice(0, -1).join('/')}.py`;
        const ep = baseDir ? `${baseDir}/${rel}` : rel;
        debug(
          `Django hook: WSGI entrypoint: ${ep} (variable: ${variableName})`
        );
        resolvedEntrypoint = { entrypoint: ep, variableName };
      }
    }

    let djangoStatic: DjangoCollectStaticResult | null = null;
    if (workPath && venvPath) {
      const outputStaticDir = join(workPath, '.vercel', 'output', 'static');
      djangoStatic = await runDjangoCollectStatic(
        venvPath,
        workPath,
        pythonEnv,
        outputStaticDir,
        settingsModule,
        djangoSettings,
        djangoVersion
      );
    }
    return { entrypoint: resolvedEntrypoint, djangoStatic };
  },
};

function createRuntimeTrampoline({
  moduleName,
  entrypoint,
  vendorDir,
  variableName,
  extraEnv = [],
}: {
  moduleName: string;
  entrypoint: string;
  vendorDir: string;
  variableName: string;
  extraEnv?: string[];
}): string {
  const extraEnvLines = extraEnv.map(line => `,\n  ${line}`).join('');

  return `
import importlib
import os
import os.path
import site
import sys

_here = os.path.dirname(__file__)

os.environ.update({
  "__VC_HANDLER_MODULE_NAME": "${moduleName}",
  "__VC_HANDLER_ENTRYPOINT": "${entrypoint}",
  "__VC_HANDLER_ENTRYPOINT_ABS": os.path.join(_here, "${entrypoint}"),
  "__VC_HANDLER_VENDOR_DIR": "${vendorDir}",
  "__VC_HANDLER_VARIABLE_NAME": "${variableName}"${extraEnvLines}
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
}

export async function downloadFilesInWorkPath({
  entrypoint,
  workPath,
  files,
  meta = {},
}: Pick<BuildOptions, 'workPath' | 'files' | 'meta'> & {
  entrypoint: string | undefined;
}) {
  debug('Downloading user files...');
  let downloadedFiles = await download(files, workPath, meta);
  if (meta.isDev && entrypoint) {
    const normalizedEntrypoint = entrypoint.endsWith('.py')
      ? entrypoint
      : `${entrypoint}.py`;
    if (
      !hasProp(downloadedFiles, entrypoint) &&
      !hasProp(downloadedFiles, normalizedEntrypoint)
    ) {
      throw new NowBuildError({
        code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
        message: `Configured Python entrypoint "${normalizedEntrypoint}" was not found.`,
        link: PYTHON_ENTRYPOINT_DOCS_URL,
        action: 'Learn More',
      });
    }

    // Old versions of the CLI don't assign this property
    const { devCacheDir = join(workPath, '.now', 'cache') } = meta;
    // Replace dots in the entrypoint basename with underscores so the cache
    // directory name doesn't collide with the entrypoint file itself.
    const cacheKey = basename(entrypoint).replace(/\./g, '_');
    const destCache = join(devCacheDir, cacheKey);
    await download(downloadedFiles, destCache);
    downloadedFiles = await glob('**', destCache);
    workPath = destCache;
  }
  return workPath;
}

interface TargetPlatform {
  /** uv-compatible platform triple, or undefined to use the host. */
  uvPlatform: string | undefined;
  /** Lambda architecture, or undefined to use the Lambda constructor default. */
  architecture: 'x86_64' | 'arm64' | undefined;
}

/** Map an architecture name to a uv-compatible platform triple. */
function archToUvPlatform(arch: string): string {
  return `${validateBuildArch(arch)}-unknown-linux-gnu`;
}

/** Map an architecture name to a Lambda architecture value. */
function archToLambdaArch(arch: string): 'x86_64' | 'arm64' {
  return validateBuildArch(arch) === 'aarch64' ? 'arm64' : 'x86_64';
}

/** Resolve the target platform for wheel resolution and Lambda architecture. */
function getTargetPlatform(isDev: boolean): TargetPlatform {
  const arch = process.env.VERCEL_BUILD_ARCH;
  if (arch) {
    return {
      uvPlatform: archToUvPlatform(arch),
      architecture: archToLambdaArch(arch),
    };
  }

  if (isDev || process.env.VERCEL_BUILD_IMAGE) {
    return { uvPlatform: undefined, architecture: undefined };
  }

  return { uvPlatform: UV_LINUX_TARGET, architecture: 'x86_64' };
}

/**
 * Install a Vercel-owned Python package into the build venv, resolving the
 * source in this order: env override → in-repo source (if present) → pinned
 * PyPI version. The in-repo branch lets monorepo `vercel build` runs (e.g. CI
 * on a Version Packages PR) avoid PyPI for a version that does not exist yet.
 */
async function installInjectedPackage({
  name,
  pinned,
  envOverride,
  uv,
  venvPath,
  projectDir,
  pipPlatformArgs,
}: {
  name: 'vercel-runtime' | 'vercel-workers';
  pinned: string;
  envOverride: string | undefined;
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  pipPlatformArgs: string[];
}): Promise<void> {
  const localDir = join(__dirname, '..', '..', '..', 'python', name);
  const isLocalDev = fs.existsSync(join(localDir, 'pyproject.toml'));
  const dep = envOverride || (isLocalDev ? localDir : pinned);
  // override exclude-newer, since we want vercel-runtime updates to
  // take effect immediately after release
  const noExclude = ['--exclude-newer-package', `${name}=false`];
  debug(`Installing ${dep}`);
  await uv.pip({
    venvPath,
    projectDir,
    args: [
      'install',
      '--link-mode',
      'copy',
      ...pipPlatformArgs,
      ...noExclude,
      dep,
    ],
  });
}

export const build: BuildVX = async ({
  workPath,
  repoRootPath,
  files: originalFiles,
  entrypoint: rawEntrypoint,
  meta = {},
  config,
  span: parentSpan,
  service,
  registerPreDeploy,
}) => {
  let entrypoint: string | undefined =
    rawEntrypoint === '<detect>' ? undefined : rawEntrypoint;

  const builderSpan = parentSpan ?? new Span({ name: 'vc.builder' });
  const framework = config?.framework;
  let shouldInstallVercelWorkers = config?.hasWorkerServices === true;
  let subscribers: Subscriber[] = [];
  let spawnEnv: NodeJS.ProcessEnv | undefined;
  // Custom install command from dashboard/project settings, if any.
  let projectInstallCommand: string | undefined;
  // Track whether a custom build or install command was used.
  // When true, runtime dependency installation is disabled because
  // custom commands may install dependencies not tracked in uv.lock.
  let hasCustomCommand = false;

  const target = getTargetPlatform(meta.isDev ?? false);

  debug(`workPath: ${workPath}`);

  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
  });

  // `tool.vercel.subscribers` declares background workers for a standalone
  // Python app and compiles them into additional queue-triggered Lambdas.
  // It is intentionally scoped to non-service framework builds:
  //   - `experimentalServices` projects already declare queue consumers as
  //     first-class `worker`/`job` services, so a second implicit mechanism
  //     would be redundant and ambiguous (services can share one pyproject.toml,
  //     which would duplicate every subscriber across each service build).
  //   - Bare `api/**` functions build once per file sharing this workPath, so
  //     emitting subscribers there would duplicate their outputs per build.
  if (!service && isPythonFramework(framework)) {
    subscribers = await getPyprojectSubscribers(workPath);
    shouldInstallVercelWorkers ||= subscribers.length > 0;
  }

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

  // Entrypoint discovery
  let detected: DetectedPythonEntrypoint | undefined;

  const handlerFunction =
    typeof config?.handlerFunction === 'string'
      ? config.handlerFunction
      : undefined;

  detected =
    (await detectPythonEntrypoint(
      config.framework as PythonFramework,
      workPath,
      entrypoint
        ? {
            filePath: entrypoint,
            // For schedule-triggered jobs, the WSGI variable is always 'app' (created dynamically).
            // For other services, handlerFunction is used as the entrypoint variable name.
            varName:
              service && isScheduleTriggeredService(service)
                ? undefined
                : handlerFunction,
          }
        : undefined,
      service
    )) ?? undefined;

  if (detected?.error && detected?.baseDir === undefined) {
    throw detected?.error;
  }

  const entryDirectory =
    detected?.baseDir ?? (entrypoint ? dirname(entrypoint) : '.');

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
        'python.version':
          pythonVersionString(resolution.pythonVersion) ?? 'unknown',
        'python.versionSource': resolution.versionSource,
      });
      return resolution;
    });

  if (pinVersionFilePath) {
    const versionToPin = pythonVersionString(pythonVersion);
    if (versionToPin) {
      console.log(`Writing .python-version file with version ${versionToPin}`);
      await writeFile(pinVersionFilePath, `${versionToPin}\n`);
    }
  }

  // Create a virtual environment so dependencies can be installed via
  // `uv sync` and then vendored into the Lambda bundle.  When building as
  // part of a named service, namespace the venv so multiple services sharing
  // the same source don't overwrite each other's artifacts in case of custom
  // installCommand or buildCommand.
  const uvCacheDir = getUvCacheDir(workPath);
  let uv: UvRunner;
  try {
    const uvPath = await getUvBinaryOrInstall(pythonVersion.pythonPath);
    uv = new UvRunner(uvPath, uvCacheDir);
  } catch (err) {
    console.log('Failed to install or locate uv');
    throw new Error(
      `uv is required for this project but failed to install: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const uvVersion = checkUvBinaryVersion(uv.getPath());
  console.log(`Using ${uvVersion}`);

  const venvPath = service?.name
    ? join(workPath, '.vercel', 'python', 'services', service.name, '.venv')
    : join(workPath, '.vercel', 'python', '.venv');
  const hasCachedVenv = fs.existsSync(join(venvPath, 'pyvenv.cfg'));
  const hasCachedUv = fs.existsSync(uvCacheDir);
  const restoredCache =
    hasCachedVenv && hasCachedUv
      ? 'both'
      : hasCachedVenv
        ? 'venv'
        : hasCachedUv
          ? 'uv'
          : 'none';
  if (hasCachedVenv || hasCachedUv) {
    debug(
      `Build cache detected: venv=${hasCachedVenv}, uv-cache=${hasCachedUv}`
    );
  }
  await builderSpan.child('vc.builder.python.venv').trace(async () => {
    await ensureVenv({
      pythonVersion,
      venvPath,
      uvPath: uv.getPath(),
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

  // Track the lock file path and project info for package classification (used when runtime install is enabled)
  let uvLockPath: string | null = null;
  let uvProjectDir: string | null = null;
  let projectName: string | undefined;

  await builderSpan
    .child(BUILDER_INSTALLER_STEP, {
      installCommand: projectInstallCommand || undefined,
      runtime: 'python',
      'python.cache.restored': restoredCache,
    })
    .trace(async () => {
      if (projectInstallCommand) {
        // Custom commands may not prune removed packages, so always
        // start from a fresh venv to avoid stale dependency accumulation.
        await fs.promises.rm(venvPath, { recursive: true, force: true });
        await ensureVenv({
          pythonVersion,
          venvPath,
          uvPath: uv.getPath(),
          uvCacheDir,
          quiet: true,
        });
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
        const hasCustomScript = await runPyprojectScript(
          workPath,
          ['vercel-install', 'now-install', 'install'],
          pythonEnv,
          /* useUserVirtualEnv */ false
        );
        if (hasCustomScript) {
          assumeDepsInstalled = true;
          hasCustomCommand = true;
        }
      }

      if (!assumeDepsInstalled) {
        // Compute the path where we stash a copy of the generated uv.lock
        // so `uv lock` can validate it on the next build instead of
        // re-resolving all packages from PyPI.
        const lockCacheKey = service?.name
          ? `uv.lock.${service.name}`
          : 'uv.lock';
        const cachedLockPath = join(uvCacheDir, lockCacheKey);

        // Default installation path: use uv to normalize manifests into a uv.lock and
        // sync dependencies into the virtualenv, including required runtime deps.
        // Ensure all installation paths are normalized into a pyproject.toml and uv.lock
        // for consistent installation logic and idempotency.
        const { projectDir, lockPath, lockFileProvidedByUser } =
          await ensureUvProject({
            workPath,
            rootDir,
            venvPath,
            pythonPackage,
            pythonVersion: pythonVersionString(pythonVersion),
            uv,
            requireBinaryWheels: false,
            cachedLockPath,
          });

        uvLockPath = lockPath;
        uvProjectDir = projectDir;

        // Get the project name from the already-discovered package info
        projectName = pythonPackage?.manifest?.data?.project?.name;

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
          pythonPlatform: target.uvPlatform,
        });

        // Stash the lock file into the cache dir so prepareCache
        // preserves it and the next build can skip full resolution.
        if (lockPath && fs.existsSync(lockPath)) {
          await fs.promises.mkdir(uvCacheDir, { recursive: true });
          await fs.promises.copyFile(lockPath, cachedLockPath);
        }
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

  // Run per-framework hooks (e.g. entrypoint detection and collectstatic for Django).
  const hookResult = await runFrameworkHook(framework, {
    pythonEnv,
    projectDir: join(workPath, entryDirectory),
    workPath,
    venvPath,
    entrypoint,
    detected,
  });

  // Collect the resolved entrypoint from detection or hook, preferring the hook.
  const resolved = hookResult?.entrypoint ?? detected?.entrypoint;
  if (!resolved && detected?.error) {
    throw detected?.error;
  }

  entrypoint = resolved?.entrypoint;
  if (!entrypoint) {
    throw new NowBuildError({
      code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
      message:
        'No Python entrypoint could be detected. Please specify an entrypoint file.',
    });
  }

  const djangoStatic: DjangoCollectStaticResult | null =
    (hookResult as DjangoFrameworkHookResult | undefined)?.djangoStatic ?? null;

  const pipPlatformArgs = target.uvPlatform
    ? ['--python-platform', target.uvPlatform]
    : [];

  // We intentionally do not inject vercel-runtime / vercel-workers into the
  // manifest — that would surprise users running `vercel build` locally —
  // and we cannot re-run `uv sync` after this, since sync would remove them.
  await installInjectedPackage({
    name: 'vercel-runtime',
    pinned: `vercel-runtime==${VERCEL_RUNTIME_VERSION}`,
    envOverride: baseEnv.VERCEL_RUNTIME_PYTHON,
    uv,
    venvPath,
    projectDir: join(workPath, entryDirectory),
    pipPlatformArgs,
  });

  if (shouldInstallVercelWorkers) {
    await installInjectedPackage({
      name: 'vercel-workers',
      pinned: `vercel-workers==${VERCEL_WORKERS_VERSION}`,
      envOverride: baseEnv.VERCEL_WORKERS_PYTHON,
      uv,
      venvPath,
      projectDir: join(workPath, entryDirectory),
      pipPlatformArgs,
    });
  }

  // Run quirks: detect dependencies that need special handling (e.g. prisma)
  // and perform fix-up routines before bundling.
  const quirksResult = await runQuirks({ venvPath, pythonEnv, workPath });

  // Apply build-time env vars from quirks so subsequent build steps can use them
  if (quirksResult.buildEnv) {
    Object.assign(pythonEnv, quirksResult.buildEnv);
  }

  // Register a pre-deploy command that will be fired in the end of the
  // build process (if all builders including this one succeed)
  const preDeployCommand = config?.preDeployCommand;
  if (registerPreDeploy && typeof preDeployCommand === 'string') {
    const capturedEnv = { ...pythonEnv };
    const capturedCwd = workPath;
    registerPreDeploy(async () => {
      await builderSpan
        .child(BUILDER_PRE_DEPLOY_STEP, {
          preDeployCommand,
        })
        .trace(async () => {
          console.log(`Running pre-deploy command: \`${preDeployCommand}\``);
          await execCommand(preDeployCommand, {
            env: capturedEnv,
            cwd: capturedCwd,
          });
        });
    });
  }

  debug('Entrypoint is', entrypoint);
  const moduleName = entrypointToModule(entrypoint);

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

  const crons = await getServiceCrons({
    service,
    entrypoint,
    rawEntrypoint,
    handlerFunction,
    pythonBin: getVenvPythonBin(venvPath),
    env: pythonEnv,
    workPath,
  });

  // Build trampoline env line for cron routing.
  // Injected into os.environ.update() in the Python trampoline source,
  // not lambdaEnv, because the platform rejects env var names with
  // leading underscores.
  const extraTrampolineEnv: string[] = [];
  if (crons?.length) {
    // Single-quote the JSON so embedded double quotes don't need escaping
    // in the surrounding Python dict literal. Backslashes would be
    // misinterpreted by Python's string parser, but cron paths/handlers
    // only contain [a-zA-Z0-9_./:-] so JSON.stringify won't produce any.
    const json = JSON.stringify(buildCronRouteTable(crons));
    assert(!json.includes('\\'), `backslash in cron route table: ${json}`);
    extraTrampolineEnv.push(`"__VC_CRON_ROUTES": '${json}'`);
  }

  const variableName = resolved?.variableName ?? '';

  const runtimeTrampoline = createRuntimeTrampoline({
    moduleName,
    entrypoint: entrypointWithSuffix,
    vendorDir,
    variableName,
    extraEnv: extraTrampolineEnv,
  });

  const automaticCompileAllEnabled = shouldUseCompileAll({
    isDev: meta.isDev,
    hasCustomCommand,
  });

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
  // Lambda uses a read-only filesystem; skip .pyc generation to avoid
  // wasted syscalls on every import.
  lambdaEnv.PYTHONDONTWRITEBYTECODE = '1';
  Object.assign(lambdaEnv, quirksResult.env);
  if (shouldInstallVercelWorkers) {
    lambdaEnv.VERCEL_HAS_WORKER_SERVICES = '1';
  }

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);

  // Re-inject staticfiles.json into the Lambda bundle if a manifest storage
  // backend is in use. The CDN serves static assets; only the manifest is
  // needed at runtime so Django can resolve hashed filenames for {% static %}.
  if (djangoStatic?.manifestRelPath) {
    files[djangoStatic.manifestRelPath] = new FileFsRef({
      fsPath: join(workPath, djangoStatic.manifestRelPath),
    });
  }

  // in order to allow the user to have `server.py`, we
  // need our `server.py` to be called something else
  const handlerPyFilename = 'vc__handler__python';

  // "fasthtml" framework requires a `.sesskey` file to exist,
  // otherwise it tries to create one at runtime, which fails
  // due Lambda's read-only filesystem
  if (config.framework === 'fasthtml') {
    const { SESSKEY = '' } = process.env;
    files['.sesskey'] = new FileBlob({ data: `"${SESSKEY}"` });
  }

  // Bundle dependencies, using runtime installation for oversized bundles
  const depExternalizer = new PythonDependencyExternalizer({
    venvPath,
    vendorDir,
    workPath,
    uvLockPath,
    uvProjectDir,
    projectName,
    pythonMajor: pythonVersion.major,
    pythonMinor: pythonVersion.minor,
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
      // analyze() always computes source-only sizes so threshold
      // decisions are not inflated by bytecode overhead.
      //
      // Record the size via the onSized callback (invoked before any
      // size-limit enforcement that may throw) so the span is tagged even
      // for oversized bundles that subsequently fail the build.
      const depAnalysis = await depExternalizer.analyze(files, {
        onSized: ({ totalSizeBytes, runtimeInstallEnabled }) => {
          bundleSpan.setAttributes({
            'python.bundle.totalSizeBytes': String(totalSizeBytes),
            'python.bundle.runtimeInstallEnabled': String(
              runtimeInstallEnabled
            ),
          });
        },
      });

      // Precompile bytecode and fill remaining capacity for a fully bundled
      // function. collectAppBytecodeFiles only collects .pyc for .py files
      // present in the bundle, so excluded source can't re-enter as .pyc.
      // Shared by the direct-bundle path and the generateBundle Hive fallback.
      const runCompileAllAndFillBytecode = async () => {
        await builderSpan
          .child('vc.builder.python.compileall')
          .trace(async compileSpan => {
            const sitePackageDirs = (
              await getVenvSitePackagesDirs(venvPath)
            ).filter(d => fs.existsSync(d));
            const pythonBin = getVenvPythonBin(venvPath);

            console.log('Compiling Python application bytecode...');
            await runCompileAll({
              pythonBin,
              filesOrDirectories: [workPath],
              env: pythonEnv,
              excludeRegex: getCompileAllAppExcludeRegex(workPath),
            });

            console.log('Compiling Python dependency bytecode...');
            await runCompileAll({
              pythonBin,
              filesOrDirectories: sitePackageDirs,
              env: pythonEnv,
            });

            compileSpan.setAttributes({
              'python.compileall.enabled': 'true',
              'python.compileall.sitePackageDirectoryCount': String(
                sitePackageDirs.length
              ),
            });
          });

        // Fill remaining capacity up to the large-function size limit.
        const currentSize = await calculateBundleSize(files);
        let remainingCapacity =
          MAX_LARGE_FUNCTION_UNCOMPRESSED_SIZE - currentSize;

        if (pythonVersion.major != null && pythonVersion.minor != null) {
          const appBytecodeInfo = await collectAppBytecodeFiles({
            workPath,
            files,
            pythonMajor: pythonVersion.major,
            pythonMinor: pythonVersion.minor,
          });
          remainingCapacity = addBytecodeWithinCapacity(
            files,
            appBytecodeInfo,
            remainingCapacity
          );
        }

        const vendorBytecodeInfo = await depExternalizer.collectBytecodeFiles({
          vendorDirName: vendorDir,
        });
        await addVendorBytecodeWithinCapacity({
          files,
          depExternalizer,
          vendorDir,
          bytecodeInfo: vendorBytecodeInfo,
          capacity: remainingCapacity,
        });
      };

      if (depAnalysis.runtimeInstallEnabled) {
        // Pack the zip and defer the rest to runtime install. If it can't fit
        // Lambda, generateBundle bundles everything for Hive (which then takes
        // compileall, below).
        const { fellBackToFullBundle } =
          await depExternalizer.generateBundle(files);
        if (fellBackToFullBundle && automaticCompileAllEnabled) {
          await runCompileAllAndFillBytecode();
        }
      } else {
        // Bundle all deps directly (fits the threshold, or large functions on).
        addFiles(files, depAnalysis.allVendorFiles);
        if (automaticCompileAllEnabled) {
          await runCompileAllAndFillBytecode();
        }
      }
    });

  const webFiles: Files = {
    ...files,
    [`${handlerPyFilename}.py`]: new FileBlob({ data: runtimeTrampoline }),
  };

  const output = new Lambda({
    files: webFiles,
    handler: `${handlerPyFilename}.vc_handler`,
    runtime: pythonVersion.runtime,
    architecture: target.architecture,
    environment: lambdaEnv,
    supportsResponseStreaming: true,
  });

  const subscriberLambdas: Record<string, Lambda> = {};

  for (const subscriber of subscribers) {
    const safeName = safePathSegment(subscriber.name);
    const outputPath = `_py_subscribers/${safeName}`;
    const consumer = sanitizeConsumerName(outputPath);
    const experimentalTriggers: TriggerEvent[] = subscriber.topics.map(
      topic => ({
        type: 'queue/v2beta',
        topic,
        consumer,
        ...subscriber.triggerDefaults,
      })
    );

    subscriberLambdas[outputPath] = new Lambda({
      files: {
        ...files,
        [`${handlerPyFilename}.py`]: new FileBlob({
          data: createRuntimeTrampoline({
            moduleName: subscriber.moduleName,
            entrypoint: subscriber.entrypoint,
            vendorDir,
            variableName: subscriber.variableName,
          }),
        }),
      },
      handler: `${handlerPyFilename}.vc_handler`,
      runtime: pythonVersion.runtime,
      architecture: target.architecture,
      environment: {
        ...lambdaEnv,
        VERCEL_HAS_WORKER_SERVICES: '1',
        VERCEL_SERVICE_TYPE: 'worker',
      },
      experimentalTriggers,
      supportsResponseStreaming: true,
    });
  }

  // Write project manifest for diagnostics (best-effort, never fails the build).
  // Requires uv.lock to resolve versions and dependency graph.  Skipped in
  // `vercel dev` since the CLI only reads the manifest in `vercel build`.
  if (uvLockPath && !meta.isDev) {
    try {
      await generateProjectManifest({
        workPath,
        pythonPackage,
        pythonVersion,
        uvLockPath,
        framework,
        serviceType: service ? getReportedServiceType(service) : undefined,
      });
    } catch (err) {
      debug(
        `Failed to write project manifest: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Subscribers only attach to framework apps or named services, both of which
  // already take the V2 path below, so no early V3 return needs to consider them.
  if (!isPythonFramework(framework) && !service?.name) {
    return { resultVersion: 3, result: { output } };
  }

  // If there is a service name, we need to mount this under the
  // service properly, for a V2 build.
  // TODO: Ideally this should be handled by writeBuildResultV2.
  const lambdaPath = service?.name ? `_svc/${service.name}/index` : 'index';
  const staticFiles = djangoStatic?.cdnOutputDir
    ? await glob('**', { cwd: djangoStatic.cdnOutputDir })
    : {};

  // for services routing is handled by fs-detectors, for legacy builds
  // we still need to provide catch-all route
  const routes = service?.name
    ? undefined
    : [{ handle: 'filesystem' }, { src: '/(.*)', dest: `/${lambdaPath}` }];

  return {
    resultVersion: 2,
    result: {
      output: {
        [lambdaPath]: output,
        ...subscriberLambdas,
        ...staticFiles,
      },
      ...(routes ? { routes } : {}),
      crons,
    },
  };
};

export { startDevServer };

export const prepareCache: PrepareCache = async ({
  repoRootPath,
  workPath,
}) => {
  const root = repoRootPath || workPath;
  const ignore = ['**/*.pyc', '**/__pycache__/**'];

  // Prune pre-built wheels from the uv cache (source-built wheels are retained).
  const uvCacheDir = getUvCacheDir(workPath);
  try {
    const uvPath = findUvInPath();
    if (uvPath) {
      const uv = new UvRunner(uvPath, uvCacheDir);
      await uv.cachePrune();
    }
  } catch {
    // best-effort; don't fail the build
  }

  // Cache the uv package cache, the default venv, and any service-namespaced
  // venvs so that subsequent builds can skip dependency installation.
  return glob('**/.vercel/python/{.venv,services/*/.venv,cache/uv}/**', {
    cwd: root,
    ignore,
  });
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

export { diagnostics } from './diagnostics';

// internal only - expect breaking changes if other packages depend on these exports
export { installRequirement, installRequirementsFile };
