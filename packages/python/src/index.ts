import assert from 'assert';
import fs from 'fs';
import {
  join,
  dirname,
  basename,
  parse,
  relative,
  isAbsolute,
  sep,
  resolve,
} from 'path';
import {
  VERCEL_RUNTIME_VERSION,
  VERCEL_WORKERS_VERSION,
} from './package-versions';
import {
  getConditionalInjectedPackages,
  getQueueIntegrations,
} from './conditional-vendoring';
import {
  isLegacyWorkersProject,
  resolveWorkflowServingMode,
  type WorkflowServingMode,
} from './sdk-detection';
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
  getLambdaOptionsFromFunction,
  type BuildOptions,
  type GlobOptions,
  type BuildVX,
  type DevSubscriber,
  type Files,
  type GetDevSidecarsOptions,
  type ServiceQueueTopic,
  type ShouldServe,
  type TriggerEvent,
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
import {
  PythonDependencyExternalizer,
  BYTECODE_FILL_CEILING_BYTES,
  LARGE_FUNCTION_FILL_CEILING_BYTES,
  LAMBDA_SIZE_THRESHOLD_BYTES,
  calculateBundleSize,
  RUNTIME_DEPS_DIR,
  type GenerateBundleResult,
} from './dependency-externalizer';
import { isLargeFunctionsEnabled } from './large-functions';
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
import {
  runFastAPICollectStatic,
  type FastAPICollectStaticResult,
} from './fastapi';
import {
  collectImportClosure,
  containsTopLevelCallable,
  type PyProjectToml,
} from '@vercel/python-analysis';
import {
  annotateBytecodeItems,
  fillBytecodeWithinCapacity,
  isBytecodeAnalysisDisabled,
  rankBytecodeItems,
} from './bytecode-packing';
import {
  collectAppBytecodeFiles,
  collectAppPrefixBytecodeFiles,
  runCompileAll,
  RUNTIME_PYCACHE_PREFIX,
  shouldCompileAll,
  type BytecodeCollectionResult,
} from './compileall';
import { InstalledPythonDistributions } from './installed-distributions';
import {
  createQueueHandlerModule,
  generatedPythonPathToModule,
  getGeneratedQueueHandlerPath,
  getPyprojectSubscribers,
  getSubscriberConsumerName,
  getSubscriberOutputPath,
  resolveQueueSubscribers,
  type Subscriber,
  type SubscriberDeclaration,
} from './subscribers';
import {
  getPyprojectWorkflows,
  getWorkflowConsumerName,
  getWorkflowOutputPath,
  WORKFLOW_TOPIC_PATTERN,
  type PyprojectWorkflow,
} from './workflows';
import {
  getImportClosureOptions,
  IMPORT_CLOSURE_TIMEOUT_MS,
  withTimeout,
} from './import-closure';

const writeFile = fs.promises.writeFile;
const PYTHON_ENTRYPOINT_DOCS_URL =
  'https://vercel.com/docs/functions/runtimes/python#python-entrypoints';

import {
  detectPythonEntrypoint,
  entrypointToModule,
  getVercelToolsEntrypoint,
  type DetectedPythonEntrypoint,
  type PythonEntrypoint,
} from './entrypoint';

export { detectEntrypoint } from './entrypoint';

export const version = -1;

function getDevSubscriberTopics(
  subscriber: SubscriberDeclaration
): ServiceQueueTopic[] {
  if (subscriber.legacy) {
    const { retryAfterSeconds, initialDelaySeconds } =
      subscriber.legacy.triggerDefaults;
    return subscriber.legacy.topics.map(topic => ({
      topic,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      ...(initialDelaySeconds === undefined ? {} : { initialDelaySeconds }),
    }));
  }
  return (subscriber.topicPatterns ?? ['*']).map(topic => ({ topic }));
}

export async function getDevSidecars({
  workPath,
  build,
  service,
}: GetDevSidecarsOptions): Promise<DevSubscriber[]> {
  const framework = build.config?.framework;
  const isPyprojectEntrypoint = basename(build.src ?? '') === 'pyproject.toml';
  const isPyprojectService =
    service !== undefined &&
    basename(service.entrypoint ?? '') === 'pyproject.toml';
  if (
    build.config?.middleware === true ||
    (service !== undefined && !isPyprojectService) ||
    (service === undefined &&
      !isPyprojectEntrypoint &&
      (typeof framework !== 'string' || !isPythonFramework(framework)))
  ) {
    return [];
  }

  const legacyWorkers = await isLegacyWorkersProject(workPath);
  const subscribers = await getPyprojectSubscribers(workPath, {
    legacySchema: legacyWorkers,
  });
  const workflows = await getPyprojectWorkflows(workPath);
  return [
    ...subscribers.map(
      (subscriber): DevSubscriber => ({
        type: 'subscriber',
        name: subscriber.name,
        consumer: getSubscriberConsumerName(subscriber.name),
        workspace: '.',
        framework: typeof framework === 'string' ? framework : undefined,
        runtime: 'python',
        builder: {
          use: build.use,
          src: subscriber.entrypoint,
          config: {
            handlerFunction: subscriber.variableName,
            pythonQueueSidecar: 'subscriber',
          },
        },
        topics: getDevSubscriberTopics(subscriber),
      })
    ),
    ...workflows.map(
      (workflow): DevSubscriber => ({
        type: 'subscriber',
        name: workflow.name,
        consumer: getWorkflowConsumerName(workflow.name),
        workspace: '.',
        framework: typeof framework === 'string' ? framework : undefined,
        runtime: 'python',
        builder: {
          use: build.use,
          src: workflow.entrypoint,
          config: {
            handlerFunction: workflow.variableName,
            pythonQueueSidecar: 'workflow',
          },
        },
        topics: [{ topic: WORKFLOW_TOPIC_PATTERN }],
      })
    ),
  ];
}

function addFiles(target: Files, source: Files) {
  for (const [p, f] of Object.entries(source)) {
    target[p] = f;
  }
}

/**
 * Map absolute `.py` paths from the import closure to the module keys used
 * by bytecode items: workPath-relative for app files, site-packages-relative
 * for vendor files (forward slashes). Files outside every root (stdlib,
 * venv internals) are dropped — they are never part of the bundle.
 */
export function moduleKeysForClosurePaths(
  paths: Iterable<string>,
  workPath: string,
  sitePackageDirs: string[]
): Set<string> {
  const keys = new Set<string>();
  // Most specific roots first: the venv lives inside workPath
  // (.vercel/python/.venv), so vendor files must match site-packages
  // before the app root claims them.
  const roots = [...sitePackageDirs, workPath].map(r => resolve(r));
  for (const p of paths) {
    for (const root of roots) {
      const rel = relative(root, p);
      if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
        keys.add(rel.split(sep).join('/'));
        break;
      }
    }
  }
  return keys;
}

interface FrameworkHookContext {
  pythonEnv: NodeJS.ProcessEnv;
  workPath: string;
  venvPath?: string;
  entrypoint: string | undefined;
  detected: DetectedPythonEntrypoint | undefined;
  pyprojectData?: PyProjectToml;
}

interface FrameworkHookResult {
  entrypoint?: PythonEntrypoint;
  extraPythonPath?: string;
}

interface DjangoFrameworkHookResult extends FrameworkHookResult {
  djangoStatic: DjangoCollectStaticResult | null;
  /**
   * Dotted module names Django loads via settings strings (settings module,
   * ROOT_URLCONF, INSTALLED_APPS, MIDDLEWARE); seeds the import closure.
   */
  importSeeds?: string[];
}

interface FastAPIFrameworkHookResult extends FrameworkHookResult {
  fastapiStatic: FastAPICollectStaticResult;
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
    workPath,
    venvPath,
    detected,
  }): Promise<DjangoFrameworkHookResult | void> => {
    let baseDir: string | undefined = detected?.baseDir;
    if (baseDir === undefined) {
      if (!fs.existsSync(join(workPath, 'manage.py'))) {
        debug('Django hook: no manage.py detected, skipping');
        return;
      }
      baseDir = '';
    }
    const djangoPath = join(workPath, baseDir);
    let settingsResult;
    try {
      settingsResult = await getDjangoSettings(djangoPath, pythonEnv);
    } catch (err: any) {
      let detail: string;
      if (err?.code === 'ENOENT') {
        detail = `command not found: python\nHint: activate a venv or run with \`uv run vercel dev\``;
      } else {
        detail = err?.stderr || err?.message || String(err);
      }
      throw new NowBuildError({
        code: 'DJANGO_SETTINGS_FAILED',
        message: `Failed to read Django application settings from ${djangoPath}/manage.py:\n${detail}`,
      });
    }
    debug(`Django settings: ${JSON.stringify(settingsResult)}`);
    const { djangoSettings, settingsModule, djangoVersion } = settingsResult;
    if (djangoVersion) {
      console.log(`Django ${djangoVersion.join('.')} detected`);
    }

    let resolvedEntrypoint: PythonEntrypoint | undefined;
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
        djangoPath,
        pythonEnv,
        outputStaticDir,
        settingsModule,
        djangoSettings,
        djangoVersion
      );
    }

    // Django wires apps together via settings strings rather than imports.
    // Entries may name a class (e.g. MIDDLEWARE); seed resolution trims
    // trailing components until a module resolves.
    const importSeeds = [
      settingsModule,
      djangoSettings['ROOT_URLCONF'],
      ...((djangoSettings['INSTALLED_APPS'] as string[] | undefined) ?? []),
      ...((djangoSettings['MIDDLEWARE'] as string[] | undefined) ?? []),
    ].filter((s): s is string => typeof s === 'string');

    return {
      entrypoint: resolvedEntrypoint,
      djangoStatic,
      importSeeds,
      extraPythonPath: baseDir ? join(workPath, baseDir) : undefined,
    };
  },
  fastapi: async ({
    pythonEnv,
    detected,
    workPath,
    venvPath,
    pyprojectData,
  }): Promise<FastAPIFrameworkHookResult | void> => {
    if (!detected?.entrypoint || !workPath || !venvPath) {
      debug(
        `FastAPI hook: skipping — detected.entrypoint=${JSON.stringify(detected?.entrypoint)}, workPath=${workPath}, venvPath=${venvPath}`
      );
      return;
    }

    const { entrypoint: entrypointRel, variableName } = detected.entrypoint;
    debug(
      `FastAPI hook: entrypoint=${entrypointRel}, variableName=${variableName}`
    );
    const entrypointAbs = join(workPath, entrypointRel);
    const outputStaticDir = join(workPath, '.vercel', 'output', 'static');

    const cdnEnv = process.env.VERCEL_FASTAPI_STATIC_CDN?.toLowerCase();
    if (cdnEnv !== '1' && cdnEnv !== 'true') {
      debug(
        'FastAPI: VERCEL_FASTAPI_STATIC_CDN not set, skipping static CDN collection'
      );
      return;
    }

    const staticCdn = pyprojectData?.tool?.vercel?.fastapi?.static?.cdn;
    if (staticCdn === false) {
      debug(
        'FastAPI: static.cdn = false in pyproject.toml, skipping CDN collection'
      );
      return;
    }

    const fastapiStatic = await runFastAPICollectStatic(
      venvPath,
      workPath,
      pythonEnv,
      outputStaticDir,
      entrypointAbs,
      variableName
    );
    if (!fastapiStatic) return;

    return { fastapiStatic };
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

async function getPythonLambdaOptions({
  config,
  entrypoint,
}: {
  config: BuildOptions['config'];
  entrypoint: string;
}) {
  if (!config?.functions) {
    return {};
  }

  const sources = new Set<string>([entrypoint]);
  if (entrypoint.endsWith('.py')) {
    sources.add(entrypoint.slice(0, -'.py'.length));
  }

  for (const sourceFile of sources) {
    const lambdaOptions = await getLambdaOptionsFromFunction({
      sourceFile,
      config,
    });

    if (Object.keys(lambdaOptions).length > 0) {
      // Python resolves the target wheel platform before the Lambda is created,
      // so the Lambda architecture must stay aligned with that build target.
      delete lambdaOptions.architecture;
      return lambdaOptions;
    }
  }

  return {};
}

/**
 * Install a Vercel-owned Python package into the build venv, resolving the
 * source in this order: env override → in-repo source (if present) → PyPI
 * requirement. The in-repo branch lets monorepo `vercel build` runs (e.g. CI
 * on a Version Packages PR) avoid PyPI for runtime/worker versions that do
 * not exist yet.
 */
async function installInjectedPackage({
  name,
  requirement,
  envOverride,
  allowLocalSource,
  uv,
  venvPath,
  projectDir,
  pipPlatformArgs,
}: {
  name: string;
  requirement: string;
  envOverride: string | undefined;
  allowLocalSource: boolean;
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  pipPlatformArgs: string[];
}): Promise<void> {
  const localDir = join(__dirname, '..', '..', '..', 'python', name);
  const isLocalDev =
    allowLocalSource && fs.existsSync(join(localDir, 'pyproject.toml'));
  const dep = envOverride || (isLocalDev ? localDir : requirement);
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

  // A "pyproject.toml" entrypoint opts the build into declared-only mode: the
  // web app comes from `tool.vercel.entrypoint` (if present), and workers come
  // from `tool.vercel.subscribers` / `tool.vercel.workflows`. Filename-based
  // auto-detection never runs, so a service builds exactly what its
  // pyproject.toml declares.
  const isPyprojectEntrypoint =
    entrypoint !== undefined && basename(entrypoint) === 'pyproject.toml';
  if (isPyprojectEntrypoint && entrypoint !== 'pyproject.toml') {
    throw new NowBuildError({
      code: 'PYTHON_INVALID_PYPROJECT_ENTRYPOINT',
      message:
        `A "pyproject.toml" entrypoint must sit at the service root. ` +
        `Set the service "root" to "${dirname(entrypoint!)}" and use entrypoint "pyproject.toml".`,
    });
  }

  const builderSpan = parentSpan ?? new Span({ name: 'vc.builder' });
  const framework = config?.framework;
  let subscriberDeclarations: SubscriberDeclaration[] = [];
  let subscribers: Subscriber[] = [];
  let workflows: PyprojectWorkflow[] = [];
  // Projects that directly depend on the legacy `vercel-workers` SDK keep
  // the pre-vercel-queue integration (legacy subscriber schema, worker env
  // markers, injected vercel-workers).
  let legacyWorkersProject = false;
  // How `tool.vercel.workflows` entrypoints are served (see sdk-detection).
  let workflowMode: WorkflowServingMode = 'workers';
  let spawnEnv: NodeJS.ProcessEnv | undefined;
  // Custom install command from dashboard/project settings, if any.
  let projectInstallCommand: string | undefined;
  // Track whether a custom install command was used. When true, runtime
  // dependency installation is disabled because custom install commands may
  // install dependencies not tracked in uv.lock.
  let hasCustomCommand = false;

  const target = getTargetPlatform(meta.isDev ?? false);

  debug(`workPath: ${workPath}`);

  workPath = await downloadFilesInWorkPath({
    workPath,
    files: originalFiles,
    entrypoint,
    meta,
  });

  // `tool.vercel.subscribers` and `tool.vercel.workflows` compile into
  // additional worker Lambdas. They apply to standalone Python framework apps,
  // and to explicit "pyproject.toml" entrypoints that opt a service into
  // declared-only worker composition. They are intentionally not implicit for
  // other service builds: services can share one pyproject.toml, and composing
  // its workers into every service build would duplicate queue consumers. Bare
  // `api/**` functions are excluded for the same reason: they build once per
  // file sharing this workPath, so emitting workers there would duplicate them.
  legacyWorkersProject = await isLegacyWorkersProject(workPath);
  if (isPyprojectEntrypoint || (!service && isPythonFramework(framework))) {
    subscriberDeclarations = await getPyprojectSubscribers(workPath, {
      legacySchema: legacyWorkersProject,
    });
    workflows = await getPyprojectWorkflows(workPath);
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

  if (isPyprojectEntrypoint) {
    // Declared-only mode: use `tool.vercel.entrypoint` when present, and
    // never fall back to filename-based detection. The helper hard-errors on
    // a declared-but-unresolvable entrypoint, so a typo cannot silently drop
    // the web app. A pyproject.toml with neither a web entrypoint nor declared
    // workers has nothing to build.
    const declared = await getVercelToolsEntrypoint(workPath, repoRootPath);
    if (declared) {
      detected = { entrypoint: declared };
    } else if (subscriberDeclarations.length === 0 && workflows.length === 0) {
      throw new NowBuildError({
        code: 'PYTHON_PYPROJECT_NOTHING_TO_BUILD',
        message:
          'Entrypoint "pyproject.toml" declares nothing to build. Set "tool.vercel.entrypoint" ' +
          'for a web app and/or declare "[[tool.vercel.subscribers]]" or ' +
          '"[[tool.vercel.workflows]]" entries in pyproject.toml.',
      });
    }
    entrypoint = undefined;
  } else {
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
        service,
        repoRootPath
      )) ?? undefined;
  }

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
  let usedUvManagedInstall = false;

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
        usedUvManagedInstall = true;

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
    workPath,
    venvPath,
    entrypoint,
    detected,
    pyprojectData: pythonPackage.manifest?.data,
  });

  // Collect the resolved entrypoint from detection or hook, preferring the
  // hook. In declared-only mode the hook must not introduce a web app that
  // pyproject.toml did not declare, so only the declared entrypoint counts.
  const resolved = isPyprojectEntrypoint
    ? detected?.entrypoint
    : (hookResult?.entrypoint ?? detected?.entrypoint);
  if (!resolved && detected?.error) {
    throw detected?.error;
  }

  entrypoint = resolved?.entrypoint;
  // Declared-only builds may consist of workers alone (no web app).
  const isWorkersOnly =
    !entrypoint &&
    isPyprojectEntrypoint &&
    (subscriberDeclarations.length > 0 || workflows.length > 0);
  if (!entrypoint && !isWorkersOnly) {
    throw new NowBuildError({
      code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
      message:
        'No Python entrypoint could be detected. Please specify an entrypoint file.',
    });
  }

  const djangoStatic: DjangoCollectStaticResult | null =
    (hookResult as DjangoFrameworkHookResult | undefined)?.djangoStatic ?? null;
  const fastapiStatic: FastAPICollectStaticResult | null =
    (hookResult as FastAPIFrameworkHookResult | undefined)?.fastapiStatic ??
    null;
  const importSeeds: string[] =
    (hookResult as DjangoFrameworkHookResult | undefined)?.importSeeds ?? [];
  const cdnOutputDir =
    djangoStatic?.cdnOutputDir ?? fastapiStatic?.cdnOutputDir ?? null;

  const pipPlatformArgs = target.uvPlatform
    ? ['--python-platform', target.uvPlatform]
    : [];

  // We intentionally do not inject vercel-runtime into the
  // manifest — that would surprise users running `vercel build` locally —
  // and we cannot re-run `uv sync` after this, since sync would remove them.
  await installInjectedPackage({
    name: 'vercel-runtime',
    requirement: `vercel-runtime==${VERCEL_RUNTIME_VERSION}`,
    envOverride: baseEnv.VERCEL_RUNTIME_PYTHON,
    allowLocalSource: true,
    uv,
    venvPath,
    projectDir: join(workPath, entryDirectory),
    pipPlatformArgs,
  });

  // Legacy vercel-workers projects bring their own adapter integration
  // through the vercel-workers runtime; injecting or activating the
  // vercel-queue adapters there would install two competing transports.
  const conditionalInjectedPackages =
    usedUvManagedInstall && !legacyWorkersProject
      ? await getConditionalInjectedPackages({
          pythonPackage,
          env: baseEnv,
        })
      : [];

  for (const injectedPackage of conditionalInjectedPackages) {
    await installInjectedPackage({
      ...injectedPackage,
      uv,
      venvPath,
      projectDir: join(workPath, entryDirectory),
      pipPlatformArgs,
    });
  }

  if (workflows.length > 0) {
    workflowMode = await resolveWorkflowServingMode({
      pythonPackage,
      uv,
      venvPath,
      projectDir: join(workPath, entryDirectory),
      uvLockPath,
    });
  }

  // The legacy vercel-workers integration needs the vercel-workers package
  // in the bundle: for legacy projects it backs the worker bootstrap, and
  // for pre-vercel-queue `vercel` SDKs it backs `vercel.workflow` serving.
  const shouldInstallVercelWorkers =
    legacyWorkersProject ||
    (workflows.length > 0 && workflowMode === 'workers');

  if (shouldInstallVercelWorkers) {
    await installInjectedPackage({
      name: 'vercel-workers',
      requirement: `vercel-workers==${VERCEL_WORKERS_VERSION}`,
      envOverride: baseEnv.VERCEL_WORKERS_PYTHON,
      allowLocalSource: true,
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

  // Queue adapter integrations the project's dependencies require; both
  // introspection and the generated handler modules activate them right
  // after importing the subscriber module (each installer retroactively
  // registers apps the import created) and fail hard when activation
  // fails. Legacy vercel-workers projects use the legacy integration
  // instead (see the conditional injection gate above).
  const queueIntegrations = legacyWorkersProject
    ? []
    : await getQueueIntegrations({ pythonPackage });

  const writeGeneratedQueueHandler = async (
    outputPath: string,
    declaration: SubscriberDeclaration
  ) => {
    const generatedPath = getGeneratedQueueHandlerPath(outputPath);
    await fs.promises.mkdir(dirname(join(workPath, generatedPath)), {
      recursive: true,
    });
    await fs.promises.writeFile(
      join(workPath, generatedPath),
      createQueueHandlerModule(declaration, queueIntegrations)
    );
  };

  if (subscriberDeclarations.length > 0 && !legacyWorkersProject) {
    subscribers = await resolveQueueSubscribers({
      declarations: subscriberDeclarations,
      uv,
      venvPath,
      projectDir: join(workPath, entryDirectory),
      integrations: queueIntegrations,
    });

    if (workflowMode === 'queue') {
      // Workflow subscriptions register on `__wkf_*` topics in the same
      // import graph; keep them out of topic-less subscriber lambdas so
      // workflow traffic is consumed only by the workflow Lambda.
      for (const subscriber of subscribers) {
        if (!subscriber.topicPatterns) {
          subscriber.subscriptions = subscriber.subscriptions.filter(
            subscription => !subscription.topic.startsWith('__wkf_')
          );
        }
      }
    }

    for (const subscriber of subscribers) {
      await writeGeneratedQueueHandler(
        getSubscriberOutputPath(subscriber.name),
        subscriber
      );
    }
  }

  // For SDKs ported to vercel-queue, workflow entrypoints are served exactly
  // like subscribers: introspect the registered `__wkf_*` subscriptions and
  // serve them through a generated `vercel.queue.asgi_app()` module.
  const workflowQueueSubscriptions = new Map<
    string,
    Subscriber['subscriptions']
  >();
  if (workflows.length > 0 && workflowMode === 'queue') {
    const resolved = await resolveQueueSubscribers({
      declarations: workflows.map(workflow => ({
        name: workflow.name,
        entrypoint: workflow.entrypoint,
        moduleName: workflow.moduleName,
        variableName: workflow.variableName,
        topicPatterns: [WORKFLOW_TOPIC_PATTERN],
      })),
      uv,
      venvPath,
      projectDir: join(workPath, entryDirectory),
      kind: 'workflow',
      integrations: queueIntegrations,
    });
    for (const workflow of resolved) {
      workflowQueueSubscriptions.set(workflow.name, workflow.subscriptions);
      await writeGeneratedQueueHandler(
        getWorkflowOutputPath(workflow.name),
        workflow
      );
    }
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

  const vendorDir = resolveVendorDir();

  let crons: Awaited<ReturnType<typeof getServiceCrons>>;
  let runtimeTrampoline: string | undefined;
  if (entrypoint) {
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

    // Since `vercel dev` renames source files, we must reference the original
    const suffix = meta.isDev && !entrypoint.endsWith('.py') ? '.py' : '';
    const entrypointWithSuffix = `${entrypoint}${suffix}`;
    debug('Entrypoint with suffix is', entrypointWithSuffix);

    crons = await getServiceCrons({
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

    runtimeTrampoline = createRuntimeTrampoline({
      moduleName,
      entrypoint: entrypointWithSuffix,
      vendorDir,
      variableName,
      extraEnv: extraTrampolineEnv,
    });
  }

  const compileAllEnabled = shouldCompileAll({
    isDev: meta.isDev,
    hasCustomCommand,
    // A pre-deploy command can rewrite source after the build, which would make
    // unchecked-hash precompiled bytecode stale; skip precompilation to avoid serving it.
    hasPreDeployCommand: typeof preDeployCommand === 'string',
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
  if (queueIntegrations.length > 0) {
    // Every function of the project may publish through the adapter's
    // transport (not just subscriber lambdas), so the runtime activates
    // the required integrations at startup in all of them.
    lambdaEnv.VERCEL_QUEUE_INTEGRATIONS = queueIntegrations
      .map(
        ({ module, installer, servingActivator }) =>
          `${module}:${installer}` +
          (servingActivator ? `:${servingActivator}` : '')
      )
      .join(',');
  }

  const globOptions: GlobOptions = {
    cwd: workPath,
    ignore:
      config && typeof config.excludeFiles === 'string'
        ? [...predefinedExcludes, config.excludeFiles]
        : predefinedExcludes,
  };

  const files: Files = await glob('**', globOptions);
  const appPythonSourceFiles = Object.keys(files)
    .filter(file => file.endsWith('.py'))
    .map(file => join(workPath, file))
    .sort();

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

  await builderSpan
    .child('vc.builder.python.bundle')
    .trace(async bundleSpan => {
      const installedDistributions = await InstalledPythonDistributions.load({
        venvPath,
        pythonMajor: pythonVersion.major,
        pythonMinor: pythonVersion.minor,
      });

      // Bundle dependencies, using runtime installation for oversized bundles
      const depExternalizer = new PythonDependencyExternalizer({
        installedDistributions,
        vendorDir,
        workPath,
        uvLockPath,
        uvProjectDir,
        projectName,
        pythonVersion,
        hasCustomCommand,
        alwaysBundlePackages: [
          ...(quirksResult.alwaysBundlePackages ?? []),
          ...(shouldInstallVercelWorkers
            ? ['vercel-workers', 'vercel_workers']
            : []),
        ],
      });

      // analyze() always computes source-only sizes so threshold
      // decisions are not inflated by bytecode overhead.
      //
      // Record the size via the onSized callback (invoked before any
      // size-limit enforcement that may throw) so the span is tagged even
      // for oversized bundles that subsequently fail the build. On
      // successful builds the attribute is overwritten at the end of this
      // span with the final bundle size (including compiled bytecode and
      // runtime-install tooling).
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

      const compileAllOptions = compileAllEnabled
        ? {
            pythonBin: getVenvPythonBin(venvPath),
            env: pythonEnv,
          }
        : null;

      const compileSources = async ({
        includePackages,
        pycachePrefix,
      }: {
        includePackages?: string[];
        pycachePrefix?: string;
      }): Promise<Map<string, number> | undefined> => {
        if (!compileAllOptions) return undefined;

        const vendorSourceFiles =
          installedDistributions.getPythonSourceFiles(includePackages);

        let timings: Map<string, number> | undefined;
        await builderSpan
          .child('vc.builder.python.compileall')
          .trace(async compileSpan => {
            console.log('Compiling Python bytecode...');
            const result = await runCompileAll({
              ...compileAllOptions,
              sourceFiles: [...appPythonSourceFiles, ...vendorSourceFiles],
              pycachePrefix,
            });
            timings = result.timings;

            compileSpan.setAttributes({
              'python.compileall.enabled': 'true',
              'python.compileall.appSourceFileCount': String(
                appPythonSourceFiles.length
              ),
              'python.compileall.vendorSourceFileCount': String(
                vendorSourceFiles.length
              ),
            });
          });
        return timings;
      };

      // Static import closure (no user code runs), computed at most once per
      // build and only when a bytecode fill overflows. Undefined on failure
      // or timeout, degrading ranking to compile density only.
      let importClosurePromise: Promise<Set<string> | undefined> | undefined;
      const getImportClosureKeys = (): Promise<Set<string> | undefined> => {
        importClosurePromise ??= (async () => {
          try {
            const sitePackageDirs = installedDistributions.getSitePackageDirs();
            const closure = await withTimeout(
              collectImportClosure(
                getImportClosureOptions({
                  workPath,
                  entrypoint,
                  frameworkSeeds: importSeeds,
                  extraPythonPath: hookResult?.extraPythonPath,
                  subscriberDeclarations,
                  subscribers,
                  workflows,
                  workflowMode,
                  sitePackageDirs,
                })
              ),
              IMPORT_CLOSURE_TIMEOUT_MS,
              'import closure'
            );
            if (!closure) return undefined;
            const keys = moduleKeysForClosurePaths(
              closure.files,
              workPath,
              sitePackageDirs
            );
            debug(
              `import closure: ${closure.files.size} files, ` +
                `${keys.size} bundled modules` +
                (closure.truncated ? ' (truncated)' : '')
            );
            return keys;
          } catch (err) {
            debug(
              `import closure unavailable, ranking by compile density only: ${err}`
            );
            return undefined;
          }
        })();
        return importClosurePromise;
      };

      // Value-ranked bytecode fill shared by every packing path. When all
      // `.pyc` fit, ship them all with no analysis. On overflow, prefer
      // modules in the import closure, ranked by compile seconds per byte.
      // Returns bytes added.
      const fillBytecodeWithValueRanking = async ({
        items,
        totalSize,
        capacity,
        timings,
      }: {
        items: BytecodeCollectionResult['items'];
        totalSize: number;
        capacity: number;
        timings: Map<string, number> | undefined;
      }): Promise<number> => {
        if (totalSize <= 0 || capacity <= 0) return 0;

        if (totalSize <= capacity) {
          for (const item of items) {
            files[item.bundlePath] = item.file;
          }
          return totalSize;
        }

        return bundleSpan
          .child('vc.builder.python.bundle.optimize')
          .trace(async optimizeSpan => {
            console.log('Optimizing Python bundle...');

            // Kill switch: revert to per-file size ordering.
            const analysisDisabled = isBytecodeAnalysisDisabled();
            if (analysisDisabled) {
              debug(
                'bytecode analysis disabled via ' +
                  'VERCEL_PYTHON_DISABLE_BYTECODE_ANALYSIS; ranking by size'
              );
            }
            const importedModules = analysisDisabled
              ? undefined
              : await getImportClosureKeys();
            const ranked = rankBytecodeItems(
              annotateBytecodeItems(
                items,
                importedModules,
                analysisDisabled ? undefined : timings
              )
            );
            const selectedSize =
              capacity - fillBytecodeWithinCapacity(files, ranked, capacity);

            optimizeSpan.setAttributes({
              'python.bundle.optimize.bytecodeCoveragePercent': (
                (selectedSize / totalSize) *
                100
              ).toFixed(2),
            });

            return selectedSize;
          });
      };

      // Precompile bytecode and fill remaining capacity up to capacityBytes
      // using value-ranked selection. Only `.pyc` for `.py` files already in
      // the bundle (plus vendor packages in `includePackages`) is collected,
      // so excluded source can't re-enter as `.pyc`. Bytecode is a pure
      // optimization: failures are logged and the build continues.
      const runAdjacentCompileAndFill = async (
        capacityBytes: number,
        includePackages?: string[]
      ) => {
        try {
          const pyMajor = pythonVersion.major;
          const pyMinor = pythonVersion.minor;
          if (pyMajor == null || pyMinor == null) return;

          const timings = await compileSources({ includePackages });

          const currentSize = await calculateBundleSize(files);
          const remaining = capacityBytes - currentSize;
          if (remaining <= 0) return;

          const appInfo = await collectAppBytecodeFiles({
            workPath,
            files,
            pythonMajor: pyMajor,
            pythonMinor: pyMinor,
          });
          const vendorInfo = await installedDistributions.collectBytecodeFiles({
            vendorDirName: vendorDir,
            includePackages,
          });

          await fillBytecodeWithValueRanking({
            items: [...appInfo.items, ...vendorInfo.items],
            totalSize: appInfo.totalSize + vendorInfo.totalSize,
            capacity: remaining,
            timings,
          });
        } catch (err) {
          console.log(
            'Bytecode precompilation failed; continuing without precompiled bytecode.'
          );
          debug(`bytecode precompilation error details: ${err}`);
        }
      };

      // Bytecode-first fill: ship a pycache-prefix tree covering the app,
      // bundled vendor packages, and the packages installed into /tmp at
      // cold start (safe: `uv sync --frozen` installs the exact versions
      // the bytecode was compiled from). Selection is value-ranked like
      // every other path. Failures degrade to no bytecode.
      const runPrefixCompileAndFill = async (
        bundleResult: GenerateBundleResult
      ) => {
        const pyMajor = pythonVersion.major;
        const pyMinor = pythonVersion.minor;
        if (pyMajor == null || pyMinor == null) return;
        try {
          // Skip the compile entirely when the zip has no slack for bytecode
          // (e.g. very large always-bundled private packages).
          const currentSize = await calculateBundleSize(files);
          const remainingCapacity = BYTECODE_FILL_CEILING_BYTES - currentSize;
          if (remainingCapacity <= 0) {
            debug(
              `skipping bytecode precompilation: no zip capacity remaining ` +
                `(bundle is ${(currentSize / (1024 * 1024)).toFixed(2)} MB)`
            );
            return;
          }

          // Clear staging output from any previous local build
          const stagingDir = join(workPath, '.vercel', 'python', 'pycache');
          await fs.promises.rm(stagingDir, { recursive: true, force: true });
          await fs.promises.mkdir(stagingDir, { recursive: true });

          const alwaysBundled = bundleResult.alwaysBundledPackages ?? [];
          const bundledPublic = bundleResult.bundledPublicPackages ?? [];
          const externalized = bundleResult.externalizedPublicPackages ?? [];

          const timings = await compileSources({
            includePackages: [
              ...alwaysBundled,
              ...bundledPublic,
              ...externalized,
            ],
            pycachePrefix: stagingDir,
          });

          // Candidates: app source, bundled vendor (/var/task/_vendor), and
          // externalized packages (installed into /tmp at cold start). All
          // carry module keys the closure can match, so one ranking covers
          // the union.
          const appInfo = await collectAppPrefixBytecodeFiles({
            stagingDir,
            workPath,
            files,
            runtimeTaskRoot: '/var/task',
            pythonMajor: pyMajor,
            pythonMinor: pyMinor,
          });
          const bundledVendorInfo =
            await installedDistributions.collectPrefixBytecodeFiles({
              stagingDir,
              runtimeRoot: `/var/task/${vendorDir}`,
              includePackages: [...alwaysBundled, ...bundledPublic],
            });
          const externalizedInfo =
            await installedDistributions.collectPrefixBytecodeFiles({
              stagingDir,
              runtimeRoot: `${RUNTIME_DEPS_DIR}/lib/python${pyMajor}.${pyMinor}/site-packages`,
              includePackages: externalized,
            });

          const bytesAdded = await fillBytecodeWithValueRanking({
            items: [
              ...appInfo.items,
              ...bundledVendorInfo.items,
              ...externalizedInfo.items,
            ],
            totalSize:
              appInfo.totalSize +
              bundledVendorInfo.totalSize +
              externalizedInfo.totalSize,
            capacity: remainingCapacity,
            timings,
          });

          // Point the runtime at the tree only when bytecode shipped.
          if (bytesAdded > 0) {
            lambdaEnv.PYTHONPYCACHEPREFIX = RUNTIME_PYCACHE_PREFIX;
          }
        } catch (err) {
          console.log(
            'Bytecode precompilation failed; continuing without precompiled bytecode.'
          );
          debug(`bytecode precompilation error details: ${err}`);
        }
      };

      const announceLargeFunction = () =>
        console.log(
          `Function "${entrypoint ?? rawEntrypoint}" exceeds the standard size limit; enabling large functions (beta).`
        );

      // How the bundle was packed, for the span attributes below:
      // - standard:        fits the standard size limit; everything in the zip
      // - runtime-install: public deps deferred to a cold-start `uv sync`
      // - hive:            large functions; everything in the zip
      let packingMode: 'standard' | 'runtime-install' | 'hive';

      if (depAnalysis.runtimeInstallEnabled) {
        // Pack the zip and defer the rest to runtime install. If it can't be
        // made to fit, generateBundle bundles everything for the large
        // functions path (which then takes compileall, below).
        packingMode = 'runtime-install';
        const bytecodeFirst =
          compileAllEnabled &&
          pythonVersion.major != null &&
          pythonVersion.minor != null;
        const bundleResult = await depExternalizer.generateBundle(files, {
          bytecodeFirst,
        });
        if (bundleResult.fellBackToFullBundle) {
          packingMode = 'hive';
          announceLargeFunction();
          if (compileAllEnabled) {
            await runAdjacentCompileAndFill(LARGE_FUNCTION_FILL_CEILING_BYTES);
          }
        } else if (bundleResult.packingMode === 'bytecode-first') {
          await runPrefixCompileAndFill(bundleResult);
        } else if (compileAllEnabled) {
          // Knapsack packing (bytecode-first skipped or fell back): fill
          // the slack under the ceiling with bytecode for in-zip packages,
          // selected by import closure and compile density. Skip only when
          // the bundle already exceeds the fill ceiling, since nothing
          // could ship.
          const currentSize = await calculateBundleSize(files);
          const capacity = BYTECODE_FILL_CEILING_BYTES - currentSize;
          if (capacity > 0) {
            await runAdjacentCompileAndFill(BYTECODE_FILL_CEILING_BYTES, [
              ...(bundleResult.alwaysBundledPackages ?? []),
              ...(bundleResult.bundledPublicPackages ?? []),
            ]);
          } else {
            debug(
              `skipping bytecode precompilation: no zip capacity remaining ` +
                `(bundle is ${(currentSize / (1024 * 1024)).toFixed(2)} MB)`
            );
          }
        }
      } else {
        // Bundle all deps directly. Either it fits the standard size limit, or
        // large functions are enabled and the whole bundle ships.
        addFiles(files, depAnalysis.allVendorFiles);
        if (depAnalysis.totalBundleSize > LAMBDA_SIZE_THRESHOLD_BYTES) {
          packingMode = 'hive';
          if (isLargeFunctionsEnabled()) {
            announceLargeFunction();
          }
          if (compileAllEnabled) {
            await runAdjacentCompileAndFill(LARGE_FUNCTION_FILL_CEILING_BYTES);
          }
        } else {
          packingMode = 'standard';
          if (compileAllEnabled) {
            // Fill any remaining zip capacity with bytecode. Skip only when
            // the bundle already exceeds the fill ceiling, since nothing
            // could ship.
            const capacity =
              BYTECODE_FILL_CEILING_BYTES - depAnalysis.totalBundleSize;
            if (capacity > 0) {
              await runAdjacentCompileAndFill(BYTECODE_FILL_CEILING_BYTES);
            } else {
              debug(
                `skipping bytecode precompilation: no zip capacity remaining ` +
                  `(bundle is ${(depAnalysis.totalBundleSize / (1024 * 1024)).toFixed(2)} MB)`
              );
            }
          }
        }
      }

      // Final span attributes: overwrite the source-only size recorded by
      // onSized with the shipped bundle size (now including compiled
      // bytecode and runtime-install tooling). Cheap: calculateBundleSize
      // memoizes stat results on the FileFsRefs, and every file has been
      // through at least one sizing pass by this point.
      bundleSpan.setAttributes({
        'python.bundle.totalSizeBytes': String(
          await calculateBundleSize(files)
        ),
        'python.bundle.packingMode': packingMode,
      });
    });

  let output: Lambda | undefined;
  if (entrypoint && runtimeTrampoline) {
    const webFiles: Files = {
      ...files,
      [`${handlerPyFilename}.py`]: new FileBlob({ data: runtimeTrampoline }),
    };

    const lambdaOptions = await getPythonLambdaOptions({
      config,
      entrypoint,
    });

    output = new Lambda({
      files: webFiles,
      handler: `${handlerPyFilename}.vc_handler`,
      runtime: pythonVersion.runtime,
      ...lambdaOptions,
      architecture: target.architecture,
      environment: lambdaEnv,
      supportsResponseStreaming: true,
    });
  }

  const subscriberLambdas: Record<string, Lambda> = {};
  // Output paths of queue-served lambdas that must be HTTP-routable so the
  // queue service can push deliveries to them. Legacy vercel-workers lambdas
  // are reached through their triggers only and get no route.
  const queueRoutePaths: string[] = [];
  // Env for lambdas served through the legacy vercel-workers bootstrap.
  const legacyWorkerEnv = {
    ...lambdaEnv,
    VERCEL_HAS_WORKER_SERVICES: '1',
    // Compatibility marker consumed by the current Python runtime.
    VERCEL_SERVICE_TYPE: 'worker',
  };

  for (const subscriber of subscribers) {
    const outputPath = getSubscriberOutputPath(subscriber.name);
    const generatedHandlerPath = getGeneratedQueueHandlerPath(outputPath);
    const experimentalTriggers: TriggerEvent[] = subscriber.subscriptions.map(
      subscription => ({
        type: 'queue/v2beta',
        topic: subscription.topic,
        consumer: subscription.consumer,
        ...subscription.triggerDefaults,
      })
    );

    subscriberLambdas[outputPath] = new Lambda({
      files: {
        ...files,
        [`${handlerPyFilename}.py`]: new FileBlob({
          data: createRuntimeTrampoline({
            moduleName: generatedPythonPathToModule(generatedHandlerPath),
            entrypoint: generatedHandlerPath,
            vendorDir,
            variableName: 'app',
          }),
        }),
      },
      handler: `${handlerPyFilename}.vc_handler`,
      runtime: pythonVersion.runtime,
      architecture: target.architecture,
      environment: lambdaEnv,
      experimentalTriggers,
      supportsResponseStreaming: true,
    });
    queueRoutePaths.push(outputPath);
  }

  if (legacyWorkersProject) {
    // Legacy vercel-workers path: serve the user's entrypoint object
    // directly; topics and trigger tuning come from pyproject.toml rather
    // than runtime introspection.
    for (const declaration of subscriberDeclarations) {
      const outputPath = getSubscriberOutputPath(declaration.name);
      const consumer = getSubscriberConsumerName(declaration.name);
      const legacy = declaration.legacy;
      assert(legacy, 'legacy subscriber declarations must carry legacy config');
      const experimentalTriggers: TriggerEvent[] = legacy.topics.map(topic => ({
        type: 'queue/v2beta',
        topic,
        consumer,
        ...legacy.triggerDefaults,
      }));

      subscriberLambdas[outputPath] = new Lambda({
        files: {
          ...files,
          [`${handlerPyFilename}.py`]: new FileBlob({
            data: createRuntimeTrampoline({
              moduleName: declaration.moduleName,
              entrypoint: declaration.entrypoint,
              vendorDir,
              variableName: declaration.variableName,
            }),
          }),
        },
        handler: `${handlerPyFilename}.vc_handler`,
        runtime: pythonVersion.runtime,
        architecture: target.architecture,
        environment: legacyWorkerEnv,
        experimentalTriggers,
        supportsResponseStreaming: true,
      });
    }
  }

  const workflowLambdas: Record<string, Lambda> = {};

  for (const workflow of workflows) {
    const outputPath = getWorkflowOutputPath(workflow.name);

    if (workflowMode === 'queue') {
      const subscriptions = workflowQueueSubscriptions.get(workflow.name);
      assert(subscriptions, 'workflow queue subscriptions must be resolved');
      const generatedHandlerPath = getGeneratedQueueHandlerPath(outputPath);
      const experimentalTriggers: TriggerEvent[] = subscriptions.map(
        subscription => ({
          type: 'queue/v2beta',
          topic: subscription.topic,
          consumer: subscription.consumer,
          ...subscription.triggerDefaults,
        })
      );

      workflowLambdas[outputPath] = new Lambda({
        files: {
          ...files,
          [`${handlerPyFilename}.py`]: new FileBlob({
            data: createRuntimeTrampoline({
              moduleName: generatedPythonPathToModule(generatedHandlerPath),
              entrypoint: generatedHandlerPath,
              vendorDir,
              variableName: 'app',
            }),
          }),
        },
        handler: `${handlerPyFilename}.vc_handler`,
        runtime: pythonVersion.runtime,
        architecture: target.architecture,
        environment: lambdaEnv,
        experimentalTriggers,
        supportsResponseStreaming: true,
      });
      queueRoutePaths.push(outputPath);
      continue;
    }

    // Legacy vercel-workers path: serve the Workflows registry object
    // directly; the runtime bootstraps it via the worker env markers.
    const experimentalTriggers: TriggerEvent[] = [
      {
        type: 'queue/v2beta',
        topic: WORKFLOW_TOPIC_PATTERN,
        consumer: getWorkflowConsumerName(workflow.name),
      },
    ];

    workflowLambdas[outputPath] = new Lambda({
      files: {
        ...files,
        [`${handlerPyFilename}.py`]: new FileBlob({
          data: createRuntimeTrampoline({
            moduleName: workflow.moduleName,
            entrypoint: workflow.entrypoint,
            vendorDir,
            variableName: workflow.variableName,
          }),
        }),
      },
      handler: `${handlerPyFilename}.vc_handler`,
      runtime: pythonVersion.runtime,
      architecture: target.architecture,
      environment: legacyWorkerEnv,
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

  // Subscribers and workflows only attach to framework apps, named services,
  // or declared pyproject.toml builds, all of which take the V2 path below,
  // so this early V3 return never needs to consider them.
  if (
    !isPythonFramework(framework) &&
    !service?.name &&
    !isPyprojectEntrypoint
  ) {
    assert(output, 'web Lambda must exist for non-service builds');
    return { resultVersion: 3, result: { output } };
  }

  // Keep framework Lambdas away from `index`: the filesystem treats that
  // output as a match for `/`, which can finish a rewrite before the catch-all
  // below copies the resolved destination into the runtime request path.
  // V1 services still share one output and need their legacy namespace.
  const frameworkLambdaName = framework ?? 'python';

  const lambdaPath =
    service?.name && service.type
      ? `_svc/${service.name}/index`
      : frameworkLambdaName;
  const staticFiles = cdnOutputDir
    ? await glob('**', { cwd: cdnOutputDir })
    : {};

  // Non-web V1 services (cron, worker, job) must not emit a catch-all route
  // because their routes are merged into a shared top-level table and would
  // shadow other services (see #15960). Web services and V2 services (which
  // have isolated per-service route tables) need the catch-all to reach the
  // Lambda. Subscribers-only builds emit no web Lambda, so a catch-all would
  // point at a nonexistent function.
  const isNonWebService =
    service?.name && service.type && service.type !== 'web';
  const queueRoutes = queueRoutePaths.map(outputPath => ({
    src: `/${outputPath}`,
    dest: `/${outputPath}`,
  }));
  const routes =
    isNonWebService || !output
      ? queueRoutes.length > 0
        ? queueRoutes
        : undefined
      : [
          { handle: 'filesystem' as const },
          ...queueRoutes,
          // This route matches the resolved destination after rewrites. Copy
          // that path into the runtime request before dispatching the shared
          // framework Lambda so application routing observes the rewrite.
          {
            src: '/(.*)',
            dest: `/${lambdaPath}`,
            transforms: [
              {
                type: 'request.path' as const,
                op: 'set' as const,
                args: '/$1',
              },
            ],
          },
        ];

  return {
    resultVersion: 2,
    result: {
      output: {
        ...(output ? { [lambdaPath]: output } : {}),
        ...subscriberLambdas,
        ...workflowLambdas,
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
