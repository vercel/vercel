import fs, { existsSync } from 'fs-extra';
import minimatch from 'minimatch';
import { join, normalize, relative, resolve, sep } from 'path';
import semver from 'semver';
import {
  download,
  type FileBlob,
  FileFsRef,
  getDiscontinuedNodeVersions,
  getInstalledPackageVersion,
  getServiceUrlEnvVars,
  getExperimentalServiceUrlEnvVars,
  normalizePath,
  NowBuildError,
  runNpmInstall,
  runCustomInstallCommand,
  scanParentDirs,
  type Builder,
  type BuildOptions,
  type BuildResultV2,
  type BuildResultV2Typical,
  type BuildResultV3,
  type BuildResultVX,
  type Config,
  type Cron,
  type Schedule,
  type ExperimentalServices,
  type ExperimentalServicesV2,
  type Files,
  type FlagDefinitions,
  type Meta,
  type PackageJson,
  type BuildType,
  type PackageManifest,
  type ExperimentalService,
  isExperimentalService,
  isExperimentalServiceV2,
  type Service,
  getInternalServiceCronPath,
  getInternalServiceFunctionPath,
  getServiceQueueTopicConfigs,
  isBackendBuilder,
  isQueueBackedService,
  isScheduleTriggeredService,
  type Lambda,
  type TriggerEvent,
  sanitizeConsumerName,
  type Span,
} from '@vercel/build-utils';
import type { VercelConfig } from '@vercel/client';
import { fileNameSymbol } from '@vercel/client';
import { frameworkList } from '@vercel/frameworks';
import type { Framework } from '@vercel/frameworks';
import {
  builderToFrameworks,
  detectFrameworkRecord,
  detectFrameworkVersion,
  detectInstrumentation,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';
import { generateServicesRoutes } from '@vercel-internals/service-topology';
import { detectBuildersWithServices } from './detect-builders-with-services';
import {
  appendRoutesToPhase,
  convertRewrites,
  getTransformedRoutes,
  isHandler,
  mergeRoutes,
  sourceToRegex,
  type MergeRoutesProps,
  type Rewrite,
  type Route,
  type HandleValue,
} from '@vercel/routing-utils';
import type { BuilderWithPkg } from '@vercel-internals/builder-orchestration/import-builders';
import type { Project } from '@vercel-internals/types';
import type { WriteBuildResultArgs } from '@vercel-internals/builder-orchestration/write-build-result';
import {
  OUTPUT_DIR,
  isLambda,
  type PathOverride,
} from '@vercel-internals/builder-orchestration/write-build-result';
import {
  InprocessBuildRunner,
  type BuildRunner,
  type BuildRunnerContext,
} from './build-runner';
import { executeBuilder, sortBuildsForExecution } from './execute-builder';
import {
  getInstallScopeKey,
  resolveBuildConcurrency,
  resolveInstallScopeRoot,
  runBuildsWithConcurrency,
  type InstallScope,
} from './build-concurrency';
import {
  BACKEND_REWRITE_BEHAVIOR_WARNING,
  hasBackendRewriteBehaviorChange,
} from './backend-rewrite-warning';
import { scopeRoutesToServiceOwnership } from './service-route-ownership';
import { getStaticServiceSchedules } from './service-schedules';
import { validateCronSecret } from './validate-cron-secret';
import { validatePackageManifest } from './validate-package-manifest';
import { writeManifests } from './manifest';
import { shouldEmbedFlagsDefinitions } from './build-embedding';
import { staticFiles } from './get-files';
import {
  reportBuildOutputProblems,
  validateBuildOutput,
} from './validate-build-output';
import {
  detectAllFrameworks,
  detectFirstDeploymentFramework,
  isFrameworkDetectionEnabled,
  warnIfFrameworkMismatch,
} from './framework-detection';
import {
  applyServicesMonorepoDefaults,
  setMonorepoDefaultSettings,
} from './monorepo';
import { cleanupCorepack, initCorepack } from './corepack';

export interface BuildOutput {
  log(message: string): void;
  debug(value: unknown): void;
  warn(
    message: string,
    slug?: string | null,
    link?: string | null,
    action?: string | null
  ): void;
  error(message: string, slug?: string, link?: string, action?: string): void;
  time<T>(name: string, promise: Promise<T>): Promise<T>;
}

export interface DetectedFramework {
  status: 'detected' | 'not-detected' | 'skipped';
  slug?: string;
  version?: string;
}

export interface BuildProject {
  settings: {
    createdAt: Project['createdAt'];
    installCommand: Project['installCommand'];
    buildCommand: Project['buildCommand'];
    devCommand: Project['devCommand'];
    outputDirectory: Project['outputDirectory'];
    directoryListing: Project['directoryListing'];
    rootDirectory: Project['rootDirectory'];
    framework: Project['framework'];
    nodeVersion: Project['nodeVersion'];
    analyticsId?: string;
    commandForIgnoringBuildStep?: string | null;
    monorepoManager?: string;
  };
}

interface SerializedBuilder extends Builder {
  error?: unknown;
  require?: string;
  requirePath?: string;
  apiVersion: number;
}

export interface BuildsManifest {
  '//': string;
  target: string;
  argv: string[];
  cliVersion?: string;
  error?: unknown;
  builds?: SerializedBuilder[];
  features?: { speedInsightsVersion?: string; webAnalyticsVersion?: string };
  detectedFramework?: DetectedFramework;
}

export interface DoBuildRequest {
  project: BuildProject;
  buildsJson: BuildsManifest;
  cwd: string;
  outputDir: string;
  span: Span;
  standalone?: boolean;
  localConfigPath?: string;
  cliVersion: string;
  userAgent: string;
}

export interface JsonParseError extends Error {
  meta?: { parseErrorLocation?: string };
}

type ReadJSONFile = <T>(file: string) => Promise<T | null | JsonParseError>;
type DetectAllFrameworks = (
  workPath: string,
  frameworks?: readonly Framework[]
) => Promise<string[]>;

/**
 * Everything the host needs to choose how a single builder is invoked. The
 * build loop keeps ownership of env injection, the pre-deploy entry, and result
 * post-processing; the runner only owns the invocation itself.
 */
export interface CreateBuildRunnerOptions {
  ctx: BuildRunnerContext;
  builder: BuilderWithPkg['builder'];
  hasDetectedServices: boolean;
  builderPath: string;
  hasBuildCallback: boolean;
}

export interface DoBuildDependencies {
  output: BuildOutput;
  /**
   * Optional hook letting the host run builders somewhere other than the
   * current process (e.g. `vc build`'s forked worker). Returning `undefined`
   * falls back to the in-process runner.
   */
  createBuildRunner?(
    options: CreateBuildRunnerOptions
  ): BuildRunner | undefined;
  /**
   * Tells the scheduler which builds `createBuildRunner` would fork. Without it,
   * `VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY` is ignored and builds stay sequential.
   */
  canBuildInSubprocess?(options: {
    hasDetectedServices: boolean;
    builderPath: string;
  }): boolean;
  importBuilders(
    specs: Set<string>,
    cwd: string,
    span: Span
  ): Promise<Map<string, BuilderWithPkg>>;
  formatResolvedBuilders(builders: Map<string, BuilderWithPkg>): string;
  writeBuildResult(
    options: WriteBuildResultArgs
  ): Promise<Record<string, PathOverride> | undefined | void>;
  toEnumerableError(error: unknown): unknown;
  readJSONFile: ReadJSONFile;
  isCantParseJSONFile(value: unknown): value is JsonParseError;
  validateConfig(config: VercelConfig): Error | null;
  compileVercelConfig(workPath: string): Promise<{
    configPath: string | null;
    wasCompiled: boolean;
    sourceFile?: string;
  }>;
  findSourceVercelConfigFile(workPath: string): Promise<string | null>;
  defaultVercelConfigFilename: string;
  startBuildTiming(): () => string;
}

export interface DoBuildResult {
  buildDuration: string;
}

type BuildResult = BuildResultV2 | BuildResultV3;

function pickOverrides(config: VercelConfig) {
  const overrides: Record<string, unknown> = {};
  for (const property of [
    'buildCommand',
    'devCommand',
    'framework',
    'ignoreCommand',
    'installCommand',
    'outputDirectory',
  ] as const) {
    if (config[property] !== undefined) {
      overrides[
        property === 'ignoreCommand' ? 'commandForIgnoringBuildStep' : property
      ] = config[property];
    }
  }
  return overrides;
}

interface BuildOutputConfig {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<string, PathOverride>;
  framework?: { slug: string; version: string };
  crons?: Cron[];
  schedules?: Schedule[];
  experimentalServices?: ExperimentalServices;
  experimentalServicesV2?: ExperimentalServicesV2;
  services?: ExperimentalServicesV2 | Service[];
  deploymentId?: string;
}

const SERVICE_BUILD_IMMUTABLE_ENV_VARS = [
  'VERCEL_IMMUTABLE_STATIC_FILES_ENABLED',
] as const;
function hasNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}
function getGeneratedServiceAlreadyBuiltWarning(service: Service) {
  const framework = service.framework ?? 'unknown';
  const entrypoint = service.entrypoint ?? service.builder.src ?? 'unknown';
  return `Detected already-built service "${service.name}" from lazily generated \`.vercel/output/config.json\` (framework: ${framework}, entrypoint: ${entrypoint}). It will not be treated as a service because its build output already exists at the top level. Configure it in \`vercel.json\` as a \`services\` entry to remove this warning.`;
}

export async function doBuild(
  request: DoBuildRequest,
  dependencies: DoBuildDependencies
): Promise<DoBuildResult> {
  const {
    project,
    buildsJson,
    cwd,
    outputDir,
    span,
    standalone = false,
    localConfigPath,
    cliVersion,
    userAgent,
  } = request;
  const {
    output,
    createBuildRunner,
    canBuildInSubprocess,
    importBuilders,
    formatResolvedBuilders,
    writeBuildResult,
    toEnumerableError,
    readJSONFile,
    isCantParseJSONFile,
    validateConfig,
    compileVercelConfig,
    findSourceVercelConfigFile,
    defaultVercelConfigFilename,
    startBuildTiming,
  } = dependencies;

  // Regex pattern for validating deploymentId characters: alphanumeric, hyphen, underscore
  const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

  const workPath = join(cwd, project.settings.rootDirectory || '.');
  const repoRootPath = cwd;

  const sourceConfigFile = await findSourceVercelConfigFile(workPath);
  let corepackShimDir: string | null | undefined;
  if (sourceConfigFile) {
    corepackShimDir = await initCorepack({
      repoRootPath,
      output,
      readJSONFile,
      isCantParseJSONFile,
      warmPackageManager: resolveBuildConcurrency() > 1,
    });

    const installDepsSpan = span.child('vc.installDeps');
    let installRan = false;
    try {
      const installCommand = project.settings.installCommand;
      if (typeof installCommand === 'string') {
        if (installCommand.trim()) {
          output.log(`Running install command before config compilation...`);
          installRan = await runCustomInstallCommand({
            destPath: workPath,
            installCommand,
            spawnOpts: { env: process.env },
            projectCreatedAt: project.settings.createdAt,
          });
        } else {
          output.debug('Skipping empty install command');
        }
      } else {
        output.log(`Installing dependencies before config compilation...`);
        installRan = await runNpmInstall(
          workPath,
          [],
          { env: process.env },
          undefined,
          project.settings.createdAt
        );
      }
    } finally {
      installDepsSpan.stop();
    }
    // Mark completion only when an install actually ran, and scope it to the
    // `package.json` it installed: in a monorepo, services with their own
    // install roots (a different `package.json`/lockfile) must still install.
    if (installRan) {
      const { packageJsonPath } = await scanParentDirs(workPath, false);
      if (packageJsonPath) {
        process.env.VERCEL_INSTALL_COMPLETED_PATH = packageJsonPath;
      }
      process.env.VERCEL_INSTALL_COMPLETED = '1';
    }
  }

  const compileResult = await span
    .child('vc.compileVercelConfig')
    .trace(() => compileVercelConfig(workPath));

  const vercelConfigPath =
    localConfigPath ||
    compileResult.configPath ||
    join(workPath, 'vercel.json');

  const [pkg, vercelConfig, hasInstrumentation] = await span
    .child('vc.readConfigInputs')
    .trace(() =>
      Promise.all([
        readJSONFile<PackageJson>(join(workPath, 'package.json')),
        readJSONFile<VercelConfig>(vercelConfigPath),
        detectInstrumentation(new LocalFileSystemDetector(workPath)),
      ])
    );

  if (isCantParseJSONFile(pkg)) throw pkg;
  if (isCantParseJSONFile(vercelConfig)) throw vercelConfig;

  if (hasInstrumentation) {
    output.debug(
      'OpenTelemetry instrumentation detected. Automatic fetch instrumentation will be disabled.'
    );
    process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION = '1';
  }

  if (vercelConfig) {
    vercelConfig[fileNameSymbol] = compileResult.wasCompiled
      ? compileResult.sourceFile || defaultVercelConfigFilename
      : 'vercel.json';
  }

  const localConfig = vercelConfig || {};
  const validateError = validateConfig(localConfig);

  if (validateError) {
    throw validateError;
  }

  // Validate CRON_SECRET if crons are defined
  if (localConfig.crons && localConfig.crons.length > 0) {
    const cronSecretError = validateCronSecret(process.env.CRON_SECRET);
    if (cronSecretError) {
      throw cronSecretError;
    }
  }

  const projectSettings = {
    ...project.settings,
    ...pickOverrides(localConfig),
  };

  // Must run before `detectBuilders` below, which reads the mutated
  // `projectSettings`.
  buildsJson.detectedFramework = await span
    .child('vc.detectFirstDeploymentFramework', {
      firstDeployment: String(process.env.VERCEL_FIRST_DEPLOYMENT === '1'),
      configuredFramework: projectSettings.framework ?? undefined,
    })
    .trace(async s => {
      const result = await detectFirstDeploymentFramework({
        workPath,
        projectSettings,
        frameworkExplicitlyConfigured: Object.prototype.hasOwnProperty.call(
          localConfig,
          'framework'
        ),
        output,
      });
      s.setAttributes({
        detectionStatus: result.status,
        detectedFramework: result.slug,
        detectedFrameworkVersion: result.version,
      });
      return result;
    });

  if (
    process.env.VERCEL_BUILD_MONOREPO_SUPPORT === '1' &&
    pkg?.scripts?.['vercel-build'] === undefined &&
    projectSettings.rootDirectory !== null &&
    projectSettings.rootDirectory !== '.'
  ) {
    await span
      .child('vc.setMonorepoDefaultSettings')
      .trace(() =>
        setMonorepoDefaultSettings(cwd, workPath, projectSettings, output)
      );
  }

  await span.child('vc.prepareFlagsDefinitions').trace(async s => {
    const shouldEmbed = await shouldEmbedFlagsDefinitions(cwd);
    s.setAttributes({ shouldEmbed: String(shouldEmbed) });
    if (!shouldEmbed) {
      return;
    }
    const { prepareFlagsDefinitions } = await import(
      '@vercel/prepare-flags-definitions'
    );
    await prepareFlagsDefinitions({
      cwd,
      env: process.env as Record<string, string | undefined>,
      userAgentSuffix: userAgent,
      output,
    });
  });

  // Get a list of source files
  const files = await span.child('vc.getFiles').trace(async s => {
    const result = (await staticFiles(workPath, {}, output)).map(f =>
      normalizePath(relative(workPath, f))
    );
    s.setAttributes({ fileCount: String(result.length) });
    return result;
  });

  // Started here to run concurrently with the builders (used in the
  // end-of-build cross-check).
  const detectedFrameworksPromise = span
    .child('vc.detectAllFrameworks', {
      enabled: String(isFrameworkDetectionEnabled(output)),
    })
    .trace(async s => {
      if (!isFrameworkDetectionEnabled(output)) {
        return [] as string[];
      }
      try {
        const slugs = await detectAllFrameworks(workPath, undefined, output);
        s.setAttributes({
          detectedFrameworks: slugs.join(',') || undefined,
          detectedFrameworkCount: String(slugs.length),
        });
        return slugs;
      } catch (err) {
        output.debug(`Framework cross-check detection failed: ${err}`);
        s.setAttributes({
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as string[];
      }
    });

  const routesResult = getTransformedRoutes(localConfig);
  if (routesResult.error) {
    throw routesResult.error;
  }

  if (localConfig.builds && localConfig.functions) {
    throw new NowBuildError({
      code: 'bad_request',
      message:
        'The `functions` property cannot be used in conjunction with the `builds` property. Please remove one of them.',
      link: 'https://vercel.link/functions-and-builds',
    });
  }

  let builds = localConfig.builds || [];
  let zeroConfigRoutes: Route[] = [];
  let zeroConfigFallbackRoutes: Route[] = [];
  let detectedServices: ExperimentalService[] | undefined;
  let detectedResolvedServices: Service[] | undefined;
  // The subset of `detectedResolvedServices` that were actually treated as
  // services (i.e. produced service output). This is what gets recorded in
  // `config.json`'s `services` array. It differs from `detectedResolvedServices`
  // only in the generated-config path, where a service whose builder already ran
  // at the project root is warned about and skipped (see below).
  let servicesToRecord: Service[] | undefined;
  const hasExperimentalServicesV1ConfiguredInVercelConfig = hasNonEmptyObject(
    localConfig.experimentalServices
  );
  const hasExperimentalServicesV2ConfiguredInVercelConfig = hasNonEmptyObject(
    localConfig.services ?? localConfig.experimentalServicesV2
  );
  const configuredExperimentalServicesV2 =
    hasExperimentalServicesV2ConfiguredInVercelConfig &&
    (localConfig.services ?? localConfig.experimentalServicesV2)
      ? (localConfig.services ?? localConfig.experimentalServicesV2)
      : undefined;
  let nestExperimentalServicesV2Output =
    hasExperimentalServicesV2ConfiguredInVercelConfig;
  let detectedExperimentalServicesV1Config: ExperimentalServices | undefined;
  let detectedExperimentalServicesV2Config: ExperimentalServicesV2 | undefined =
    configuredExperimentalServicesV2;
  let detectedExperimentalServicesV2RootRoutes:
    | BuildOutputConfig['routes']
    | undefined;
  let isZeroConfig = false;

  if (builds.length > 0) {
    output.warn(
      'Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-build-settings'
    );
    builds = builds.flatMap(b => expandBuild(files, b));
  } else {
    // Zero config
    isZeroConfig = true;

    // Services bypass `setMonorepoDefaultSettings()` above (it only applies to
    // the project-level settings, which services never consume). Derive a
    // monorepo-aware `buildCommand` per service root instead.
    //
    // This has to happen before `detectBuilders()`: the services resolver picks
    // `@vercel/static-build` vs. `@vercel/static` based on whether a
    // `buildCommand` is present, so a later injection would be ignored.
    let servicesForDetection = configuredExperimentalServicesV2;
    if (
      process.env.VERCEL_BUILD_MONOREPO_SUPPORT === '1' &&
      configuredExperimentalServicesV2
    ) {
      servicesForDetection = await span
        .child('vc.applyServicesMonorepoDefaults')
        .trace(() =>
          applyServicesMonorepoDefaults(
            cwd,
            workPath,
            configuredExperimentalServicesV2,
            projectSettings,
            output
          )
        );
    }

    // Detect the Vercel Builders that will need to be invoked
    const detectedBuilders = await span.child('vc.detectBuilders').trace(() =>
      detectBuildersWithServices(files, pkg, {
        ...localConfig,
        services: undefined,
        experimentalServicesV2: servicesForDetection,
        projectSettings,
        ignoreBuildScript: true,
        featHandleMiss: true,
        workPath,
      })
    );

    if (detectedBuilders.errors && detectedBuilders.errors.length > 0) {
      throw detectedBuilders.errors[0];
    }

    for (const w of detectedBuilders.warnings) {
      output.warn(w.message, null, w.link, w.action || 'Learn More');
    }

    if (detectedBuilders.builders) {
      builds = detectedBuilders.builders;
    } else {
      builds = [{ src: '**', use: '@vercel/static' }];
    }

    // Capture detected services for the config.json. The full resolved set
    // (both `experimentalServices` and `experimentalServicesV2`) is written to
    // the `services` array; each record carries its `schema` discriminant.
    // `detectedServices` stays scoped to V1 for the legacy env-injection and
    // route-handling paths below, which only apply to `experimentalServices`.
    detectedResolvedServices = detectedBuilders.services;
    // In the configured (vercel.json) path every detected service is treated as
    // a service, so all of them are recorded.
    servicesToRecord = detectedResolvedServices;
    detectedServices = detectedBuilders.services?.filter(isExperimentalService);

    // When auto-detection produces a V2 services config, enable V2 output
    // nesting so the build output config.json includes experimentalServicesV2
    // and the platform activates V2 routing.
    const autoDetectedV2Config = (
      detectedBuilders as typeof detectedBuilders & {
        experimentalServicesV2?: ExperimentalServicesV2;
      }
    ).experimentalServicesV2;
    if (
      !hasExperimentalServicesV2ConfiguredInVercelConfig &&
      autoDetectedV2Config
    ) {
      nestExperimentalServicesV2Output = true;
      detectedExperimentalServicesV2Config = autoDetectedV2Config;
    }

    // Legacy URL injection for `experimentalServices`.
    if (
      detectedBuilders.useImplicitEnvInjection &&
      detectedServices &&
      detectedServices.length > 0
    ) {
      const serviceUrlEnvVars = getExperimentalServiceUrlEnvVars({
        services: detectedServices,
        frameworkList,
        currentEnv: process.env,
        deploymentUrl: process.env.VERCEL_URL,
      });
      for (const [key, value] of Object.entries(serviceUrlEnvVars)) {
        process.env[key] = value;
        output.debug(`Injected service URL env var: ${key}=${value}`);
      }
    }

    // If auto-detection generated top-level service rewrites (V2),
    // convert them to Route[] separately and append them alongside
    // the existing rewrite routes rather than re-running
    // getTransformedRoutes (which would double-transform).
    const serviceRewrites = (
      detectedBuilders as typeof detectedBuilders & {
        serviceRewrites?: Rewrite[];
      }
    ).serviceRewrites;
    const serviceRewriteRoutes =
      serviceRewrites && serviceRewrites.length > 0
        ? convertRewrites(serviceRewrites)
        : null;

    zeroConfigRoutes.push(...(detectedBuilders.redirectRoutes || []));
    const detectedHostRewriteRoutes = (
      detectedBuilders as typeof detectedBuilders & {
        hostRewriteRoutes?: Route[] | null;
      }
    ).hostRewriteRoutes;
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: detectedHostRewriteRoutes ?? null,
      phase: null,
    });
    const detectedServiceRewriteRoutes = nestExperimentalServicesV2Output
      ? []
      : detectedBuilders.rewriteRoutes;
    zeroConfigRoutes.push(
      ...appendRoutesToPhase({
        routes: [],
        newRoutes: [
          ...(detectedServiceRewriteRoutes || []),
          ...(serviceRewriteRoutes || []),
        ],
        phase: 'filesystem',
      })
    );
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: detectedBuilders.errorRoutes,
      phase: 'error',
    });
    if (!nestExperimentalServicesV2Output) {
      zeroConfigRoutes.push(...(detectedBuilders.defaultRoutes || []));
      zeroConfigFallbackRoutes = detectedBuilders.fallbackRoutes || [];
    }
  }

  if (
    hasBackendRewriteBehaviorChange({
      projectRewrites: localConfig.rewrites,
      builders: builds,
    })
  ) {
    output.warn(BACKEND_REWRITE_BEHAVIOR_WARNING);
  }

  const builderSpecs = new Set(builds.map(b => b.use));

  let buildersWithPkgs = await span
    .child('vc.importBuilders')
    .trace(async s => {
      const builders = await importBuilders(builderSpecs, cwd, span);
      s.setAttributes({ resolved: formatResolvedBuilders(builders) });
      return builders;
    });

  // Populate Files -> FileFsRef mapping
  const filesMap: Files = await span
    .child('vc.populateFilesMap')
    .trace(async s => {
      const map: Files = {};
      for (const path of files) {
        const fsPath = join(workPath, path);
        const { mode } = await fs.stat(fsPath);
        map[path] = new FileFsRef({ mode, fsPath });
      }
      s.setAttributes({ fileCount: String(files.length) });
      return map;
    });

  const buildStamp = startBuildTiming();

  // Create fresh new output directory
  await fs.mkdirp(outputDir);

  const ops: Promise<Error | void>[] = [];

  // Write the `detectedBuilders` result to output dir
  const buildsJsonBuilds = new Map<Builder, SerializedBuilder>();
  const ensureBuildersImported = async (buildsToImport: Builder[]) => {
    const missingBuilderSpecs = new Set(
      buildsToImport
        .map(build => build.use)
        .filter(builderSpec => !buildersWithPkgs.has(builderSpec))
    );
    if (missingBuilderSpecs.size === 0) return;

    const importedBuilders = await span
      .child('vc.importBuilders')
      .trace(async s => {
        const builders = await importBuilders(missingBuilderSpecs, cwd, span);
        s.setAttributes({ resolved: formatResolvedBuilders(builders) });
        return builders;
      });
    buildersWithPkgs = new Map([
      ...buildersWithPkgs.entries(),
      ...importedBuilders.entries(),
    ]);
  };
  const addBuildsToBuildJson = async (buildsToAdd: Builder[]) => {
    await ensureBuildersImported(buildsToAdd);
    for (const build of buildsToAdd) {
      if (buildsJsonBuilds.has(build)) continue;
      const builderWithPkg = buildersWithPkgs.get(build.use);
      if (!builderWithPkg) {
        throw new Error(`Failed to load Builder "${build.use}"`);
      }
      const { builder, pkg: builderPkg } = builderWithPkg;
      buildsJsonBuilds.set(build, {
        require: builderPkg.name,
        requirePath: builderWithPkg.path,
        apiVersion: builder.version,
        ...build,
      });
    }

    buildsJson.builds = Array.from(buildsJsonBuilds.values());
    await writeBuildJson(buildsJson, outputDir);
  };

  // The `meta` config property is re-used for each Builder
  // invocation so that Builders can share state between
  // subsequent entrypoint builds.
  const meta: Meta = {
    skipDownload: true,
    cliVersion: cliVersion,
    runNpmInstallSet: new Set<string>(),
  };

  // Execute Builders for detected entrypoints
  const executedBuilds: Builder[] = [];
  const buildResults: Map<Builder, BuildResult | BuildOutputConfig> = new Map();
  // Filled in completion order under concurrency; the ordinal restores
  // scheduling order before merging (collisions are last-write-wins).
  const overrides: Array<{
    ordinal: number;
    override: Record<string, PathOverride>;
  }> = [];
  // Only initialize corepack if not already done during early install
  if (!corepackShimDir) {
    corepackShimDir = await initCorepack({
      repoRootPath,
      output,
      readJSONFile,
      isCantParseJSONFile,
      warmPackageManager: resolveBuildConcurrency() > 1,
    });
  }
  const diagnostics: Files = {};
  const packageManifests: Array<{
    ordinal: number;
    workspace: string;
    key: string;
    buildConfig: Config;
    manifest: PackageManifest;
    service?: Service;
    builderUse: string;
  }> = [];

  const apiDirFrameworkDetector = createApiDirFrameworkDetector(
    (workPath, frameworks) => detectAllFrameworks(workPath, frameworks, output)
  );
  const getHasDetectedServices = () =>
    detectedResolvedServices !== undefined &&
    detectedResolvedServices.length > 0;
  const synthesizedServiceCrons: Array<{ ordinal: number; cron: Cron }> = [];
  const serviceByBuilder = new Map<Builder, Service>();
  const serviceFileOverrides = new Map<Builder, Record<string, PathOverride>>();
  if (getHasDetectedServices()) {
    for (const service of detectedResolvedServices!) {
      serviceByBuilder.set(service.builder, service);
    }
  }

  const preDeployEntries: {
    ordinal: number;
    service: string;
    callback?: () => Promise<void>;
  }[] = [];

  // Every runner started across both runBuilders calls, so all subprocess workers
  // — including pre-deploy workers kept alive past their build — can be torn down
  // unconditionally after the deferred pre-deploy loop, even if a build or a
  // pre-deploy callback throws.
  const liveRunners = new Set<BuildRunner>();
  const buildOrdinals = new Map<Builder, number>();

  const runBuilders = async (buildsToRun: Builder[]) => {
    await addBuildsToBuildJson(buildsToRun);

    const buildOne = async (
      build: Builder,
      concurrent: boolean
    ): Promise<void> => {
      if (typeof build.src !== 'string') return;

      const builderWithPkg = buildersWithPkgs.get(build.use);
      if (!builderWithPkg) {
        throw new Error(`Failed to load Builder "${build.use}"`);
      }

      try {
        const { builder, pkg: builderPkg } = builderWithPkg;

        // When a service lives in a subdirectory, e.g. /frontend
        // (workspace !== '.'), we need to:
        // 1. Set workPath to the service's workspace directory
        // 2. Strip the workspace prefix from the entrypoint
        // 3. Scope the files map to only include files within the workspace
        // This ensures builders like Next.js receive the correct workPath and
        // entrypoint, so their routes are emitted relative to the workspace root
        // (not polluted with the workspace directory prefix).
        const service = getHasDetectedServices()
          ? serviceByBuilder.get(build)
          : undefined;
        const legacyExperimentalService =
          service && isExperimentalService(service) ? service : undefined;
        const serviceWorkspace = service
          ? isExperimentalService(service)
            ? service.workspace
            : service.root
          : undefined;
        const stripServiceRoutePrefix =
          !!legacyExperimentalService?.routePrefix &&
          legacyExperimentalService.routePrefix !== '/';

        let buildWorkPath = workPath;
        let buildEntrypoint = build.src;
        let buildFiles: Files = filesMap;

        if (service && serviceWorkspace && serviceWorkspace !== '.') {
          const wsPrefix = serviceWorkspace + '/';
          buildWorkPath = join(workPath, serviceWorkspace);

          // Strip workspace prefix from entrypoint:
          // e.g., "frontend/package.json" → "package.json"
          buildEntrypoint = build.src.startsWith(wsPrefix)
            ? build.src.slice(wsPrefix.length)
            : build.src;

          // Scope files to the service workspace — re-key paths relative to
          // the workspace root so builders see "package.json" not "frontend/package.json"
          buildFiles = {};
          for (const [filePath, file] of Object.entries(filesMap)) {
            if (filePath.startsWith(wsPrefix)) {
              buildFiles[filePath.slice(wsPrefix.length)] = file;
            }
          }

          output.debug(
            `Service "${service.name}": workspace-rooted build at "${buildWorkPath}", ` +
              `entrypoint "${buildEntrypoint}" (original: "${build.src}")`
          );
        }

        // On the concurrent path each build gets its own env, so parallel
        // forks don't race. On the sequential path we mutate `process.env` and
        // record a restore.
        const restoreEnv = new Map<string, string | undefined>();
        const perBuildEnv: NodeJS.ProcessEnv = concurrent
          ? { ...process.env }
          : process.env;
        const setBuildEnv = (key: string, value: string | undefined) => {
          if (!concurrent) restoreEnv.set(key, process.env[key]);
          if (value === undefined) delete perBuildEnv[key];
          else perBuildEnv[key] = value;
        };

        // Set VERCEL_PROJECT_SETTINGS_* env vars.
        // For services: use service-specific values instead of project-level settings
        // (the project-level framework is "services", which is meaningless to individual builders).
        const settingsForEnv = service
          ? {
              buildCommand: service.buildCommand ?? undefined,
              installCommand: service.installCommand ?? undefined,
              outputDirectory: projectSettings.outputDirectory ?? undefined,
              nodeVersion: projectSettings.nodeVersion ?? undefined,
            }
          : projectSettings;

        for (const key of [
          'buildCommand',
          'installCommand',
          'outputDirectory',
          'nodeVersion',
        ] as const) {
          const value = settingsForEnv[key];
          const envKey =
            `VERCEL_PROJECT_SETTINGS_` +
            key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
          setBuildEnv(envKey, typeof value === 'string' ? value : undefined);
          if (typeof value === 'string') {
            output.debug(`Setting env ${envKey} to "${value}"`);
          }
        }

        const isFrontendBuilder = build.config && 'framework' in build.config;
        // For services builds, the builder framework is set by the service resolver,
        // the project-level framework is 'services'.
        const builderFramework =
          build.config?.framework ?? projectSettings.framework;
        // Backend framework detected for api/ dir builds.
        const isApiDir = isZeroConfig && !service && !isFrontendBuilder;
        const apiDirFramework: string | undefined = isApiDir
          ? await apiDirFrameworkDetector.detect(build.use ?? '', buildWorkPath)
          : undefined;

        let buildConfig: Config;

        if (isZeroConfig) {
          if (service) {
            // Services build: use service-specific config from resolution.
            // build.config already contains framework, routePrefix, memory, etc.
            buildConfig = {
              ...build.config,
              // `service.functions` isn't on `build.config`, so builders that
              // read `config.functions` (e.g. Next.js) would otherwise miss it;
              // `serviceName` scopes the derived v2beta consumer.
              ...(isExperimentalServiceV2(service) && service.functions
                ? { functions: service.functions, serviceName: service.name }
                : undefined),
              // Override project-level settings with service-specific ones.
              // The project-level framework is "services" which must NOT be
              // propagated to individual builders.
              projectSettings: {
                ...projectSettings,
                framework: service.framework ?? null,
                buildCommand: service.buildCommand ?? null,
                installCommand: service.installCommand ?? null,
              },
              installCommand: service.installCommand ?? undefined,
              buildCommand: service.buildCommand ?? undefined,
              preDeployCommand:
                legacyExperimentalService?.preDeployCommand ?? undefined,
              framework: builderFramework,
              nodeVersion: projectSettings.nodeVersion,
              bunVersion: localConfig.bunVersion ?? undefined,
            };
          } else {
            buildConfig = {
              outputDirectory: projectSettings.outputDirectory ?? undefined,
              ...build.config,
              projectSettings,
              installCommand: projectSettings.installCommand ?? undefined,
              devCommand: projectSettings.devCommand ?? undefined,
              buildCommand: projectSettings.buildCommand ?? undefined,
              framework: isFrontendBuilder
                ? projectSettings.framework
                : undefined,
              nodeVersion: projectSettings.nodeVersion,
              bunVersion: localConfig.bunVersion ?? undefined,
            };
          }
        } else {
          buildConfig = {
            ...(build.config || {}),
            bunVersion: localConfig.bunVersion ?? undefined,
          };
        }

        const builderSpan = span.child('vc.builder', {
          'builder.name': builderPkg.name,
          'builder.version': builderPkg.version,
          'builder.dynamicallyInstalled': String(
            builderWithPkg.dynamicallyInstalled
          ),
        });

        const serviceRoutePrefix = build.config?.routePrefix;
        const serviceConfigWorkspace = build.config?.workspace;
        const preDeployCmd =
          legacyExperimentalService?.preDeployCommand?.trim();

        const preDeployEntry: (typeof preDeployEntries)[number] | undefined =
          preDeployCmd && service
            ? {
                ordinal: buildOrdinals.get(build) ?? Number.MAX_SAFE_INTEGER,
                service: service.name,
              }
            : undefined;
        if (preDeployEntry) {
          preDeployEntries.push(preDeployEntry);
        }

        const buildOptions: BuildOptions = {
          files: buildFiles,
          entrypoint: buildEntrypoint,
          workPath: buildWorkPath,
          repoRootPath,
          config: buildConfig,
          meta,
          span: builderSpan,
          ...(preDeployCmd
            ? {
                registerPreDeploy: (callback: () => Promise<void>) => {
                  preDeployEntry!.callback = callback;
                },
              }
            : undefined),
          ...(service
            ? {
                service: {
                  name: service.name,
                  ...(legacyExperimentalService
                    ? {
                        type: legacyExperimentalService.type,
                        trigger: legacyExperimentalService.trigger,
                      }
                    : undefined),
                  routePrefix:
                    typeof serviceRoutePrefix === 'string'
                      ? serviceRoutePrefix
                      : undefined,
                  workspace:
                    typeof serviceConfigWorkspace === 'string'
                      ? serviceConfigWorkspace
                      : serviceWorkspace,
                  ...(legacyExperimentalService
                    ? { schedule: legacyExperimentalService.schedule }
                    : undefined),
                },
              }
            : undefined),
        };
        output.debug(
          `Building entrypoint "${build.src}" with "${builderPkg.name}"`
        );

        // Inject per-service URL environment variables so they're available during builds.
        // for frontend frameworks like Vite (VITE_) or Next.js (NEXT_PUBLIC_) where
        // these env vars are baked into the client bundle so they can be accessed in the client code.
        // User-defined env takes precedence and won't be overwritten. The env will be cleared
        // after the build is complete
        if (detectedServices && legacyExperimentalService?.env) {
          const perServiceEnv = getServiceUrlEnvVars({
            requestedEnv: legacyExperimentalService.env,
            consumerService: legacyExperimentalService,
            services: detectedServices,
            frameworkList,
            currentEnv: process.env,
            deploymentUrl: process.env.VERCEL_URL,
          });
          for (const [key, value] of Object.entries(perServiceEnv)) {
            if (key in process.env) continue;
            setBuildEnv(key, value);
            output.debug(`Injected service URL env var: ${key}=${value}`);
          }
        }
        if (service) {
          for (const key of SERVICE_BUILD_IMMUTABLE_ENV_VARS) {
            setBuildEnv(key, undefined);
          }
        }
        let buildResult: BuildResultV2 | BuildResultV3;
        let rawBuildResult: BuildResultV2 | BuildResultV3 | BuildResultVX;
        // Run the builder in a forked worker when the host provides a runner for it, so its
        // output (including subprocesses it spawns) can be captured and prefixed per line, and
        // so builds are isolated. Hosts that don't opt in — and builds the host declines to
        // fork — fall back to the in-process runner. The runner is tracked in `liveRunners` so
        // its worker is torn down unconditionally later.
        const runnerContext: BuildRunnerContext = {
          requirePath: builderWithPkg.path,
          buildOptions,
          cwd: buildWorkPath,
          expectsPreDeploy: Boolean(preDeployCmd),
          builderSpan,
          serviceName: service?.name,
          env: perBuildEnv,
        };
        const runner =
          createBuildRunner?.({
            ctx: runnerContext,
            builder,
            hasDetectedServices: getHasDetectedServices(),
            builderPath: builderWithPkg.path,
            hasBuildCallback: Boolean(buildOptions.buildCallback),
          }) ?? new InprocessBuildRunner(runnerContext, builder);
        // A concurrent build must be process-isolated, because running it in the
        // parent's event loop is the exact unsafe case forking prevents.
        if (concurrent && runner instanceof InprocessBuildRunner) {
          throw new Error(
            `Internal error: build for "${buildOptions.entrypoint}" was scheduled concurrently but cannot run in a subprocess`
          );
        }
        liveRunners.add(runner);

        try {
          ({ buildResult, rawBuildResult } = await executeBuilder({
            builder,
            buildOptions,
            span: builderSpan,
            isFrontendBuilder,
            hasDetectedServices: getHasDetectedServices(),
            framework: frameworkList.find(
              framework => framework.slug === buildConfig.framework
            ),
            runner,
          }));
        } finally {
          // Restore any process.env keys we set from service envVars so the
          // next builder iteration starts from a clean slate.
          for (const [key, prior] of restoreEnv) {
            if (prior === undefined) {
              delete process.env[key];
            } else {
              process.env[key] = prior;
            }
          }
          // Make sure we don't fail the build
          try {
            const builderDiagnostics = await runner.diagnostics();
            if (builderDiagnostics) {
              const prefix =
                service && serviceWorkspace && serviceWorkspace !== '.'
                  ? serviceWorkspace + '/' + builderPkg.name + '/'
                  : '';
              for (const [key, value] of Object.entries(builderDiagnostics)) {
                const fullKey = prefix + key;
                if (key.endsWith('package-manifest.json')) {
                  try {
                    let data: string;
                    if (value.type === 'FileBlob') {
                      data = (value as unknown as FileBlob).data.toString();
                    } else {
                      data = await streamToString(value.toStream());
                    }
                    const packageManifest = JSON.parse(data);
                    const validationError =
                      validatePackageManifest(packageManifest);
                    if (validationError) {
                      output.warn(
                        `Invalid package-manifest.json from ${fullKey}: ${validationError}`
                      );
                    } else {
                      const workspace =
                        service && serviceWorkspace && serviceWorkspace !== '.'
                          ? serviceWorkspace
                          : '.';
                      const buildType: BuildType =
                        packageManifest.buildType ??
                        (buildConfig.middleware === true
                          ? 'middleware'
                          : isApiDir
                            ? 'api-dir'
                            : 'app');
                      const entry = {
                        ordinal:
                          buildOrdinals.get(build) ?? Number.MAX_SAFE_INTEGER,
                        workspace,
                        key: fullKey,
                        buildConfig: buildConfig,
                        manifest: {
                          ...packageManifest,
                          framework:
                            packageManifest.framework ?? apiDirFramework,
                          buildType,
                        } as PackageManifest,
                        service,
                        builderUse: builderPkg.name,
                      };
                      // Only keep one manifest per builder+workspace — multiple
                      // api/dir files for the same builder share a manifest
                      // slot. The slot goes to the build earliest in scheduling
                      // order, not to whichever completed first.
                      const existingIndex = packageManifests.findIndex(
                        m =>
                          m.builderUse === builderPkg.name &&
                          m.workspace === workspace
                      );
                      const existing =
                        existingIndex === -1
                          ? undefined
                          : packageManifests[existingIndex];
                      if (!existing) {
                        packageManifests.push(entry);
                      } else if (entry.ordinal < existing.ordinal) {
                        packageManifests[existingIndex] = entry;
                      }
                    }
                  } catch (e) {
                    output.debug(
                      `Failed to parse ${fullKey}: ${e instanceof Error ? e.message : String(e)}`
                    );
                  }
                } else {
                  diagnostics[fullKey] = value;
                }
              }
            }
          } catch (error) {
            output.error('Collecting diagnostics failed');
            output.debug(error);
          }
        }

        if (
          buildResult &&
          'output' in buildResult &&
          'runtime' in buildResult.output &&
          'type' in buildResult.output &&
          buildResult.output.type === 'Lambda'
        ) {
          const lambdaRuntime = buildResult.output.runtime;
          if (
            getDiscontinuedNodeVersions().some(o => o.runtime === lambdaRuntime)
          ) {
            throw new NowBuildError({
              code: 'NODEJS_DISCONTINUED_VERSION',
              message: `The Runtime "${build.use}" is using "${lambdaRuntime}", which is discontinued. Please upgrade your Runtime to a more recent version or consult the author for more details.`,
              link: 'https://vercel.link/function-runtimes',
            });
          }
        }

        if (
          'output' in buildResult &&
          buildResult.output &&
          (isBackendBuilder(build) || build.use === '@vercel/python')
        ) {
          // Use service workspace path for routes.json lookup, since the builder
          // writes routes.json relative to its workPath
          const routesJsonPath = join(buildWorkPath, '.vercel', 'routes.json');
          if (existsSync(routesJsonPath)) {
            try {
              const routesJson = await readJSONFile(routesJsonPath);
              if (
                routesJson &&
                typeof routesJson === 'object' &&
                'routes' in routesJson &&
                Array.isArray(routesJson.routes)
              ) {
                // This is a v2 build output, so only remap the outputs
                // if we have an index lambda
                const indexLambda =
                  'index' in buildResult.output
                    ? (buildResult.output['index'] as Lambda)
                    : undefined;
                // Convert routes from introspection format to Vercel routing format
                const convertedRoutes = [];
                const convertedOutputs: Record<string, Lambda> = indexLambda
                  ? { index: indexLambda }
                  : {};
                for (const route of routesJson.routes) {
                  if (typeof route.source !== 'string') {
                    continue;
                  }
                  const { src } = sourceToRegex(route.source);
                  const newRoute: Route = {
                    src,
                    dest: route.source,
                  };
                  if (route.methods) {
                    newRoute.methods = route.methods;
                  }
                  if (route.source === '/') {
                    continue;
                  }
                  if (indexLambda) {
                    convertedOutputs[route.source] = indexLambda;
                  }
                  convertedRoutes.push(newRoute);
                }
                // Wrap routes with filesystem handler and catch-all
                (buildResult as BuildResultV2Typical).routes = [
                  { handle: 'filesystem' },
                  ...convertedRoutes,
                  { src: '/(.*)', dest: '/' },
                ];
                if (indexLambda) {
                  (buildResult as BuildResultV2Typical).output =
                    convertedOutputs;
                }
              }
            } catch (error) {
              output.error(`Failed to read routes.json: ${error}`);
            }
          }
        }

        if (
          getHasDetectedServices() &&
          service &&
          legacyExperimentalService &&
          'routes' in buildResult &&
          Array.isArray(buildResult.routes) &&
          detectedServices
        ) {
          buildResult.routes = scopeRoutesToServiceOwnership({
            routes: buildResult.routes as Route[],
            owner: legacyExperimentalService,
            allServices: detectedServices,
          });
        }

        if (
          legacyExperimentalService &&
          isQueueBackedService(legacyExperimentalService) &&
          'output' in buildResult
        ) {
          attachQueueServiceTrigger(
            buildResult.output,
            legacyExperimentalService
          );
        }

        if (
          legacyExperimentalService &&
          isScheduleTriggeredService(legacyExperimentalService) &&
          !('crons' in buildResult && buildResult.crons?.length)
        ) {
          const staticSchedules = getStaticServiceSchedules(
            legacyExperimentalService.schedule
          );
          if (
            typeof legacyExperimentalService.runtime === 'string' &&
            staticSchedules.length > 0
          ) {
            const cronEntrypoint =
              legacyExperimentalService.entrypoint ||
              legacyExperimentalService.builder.src ||
              'index';
            for (const schedule of staticSchedules) {
              synthesizedServiceCrons.push({
                ordinal: buildOrdinals.get(build) ?? Number.MAX_SAFE_INTEGER,
                cron: {
                  path: getInternalServiceCronPath(
                    legacyExperimentalService.name,
                    cronEntrypoint,
                    legacyExperimentalService.handlerFunction || 'cron'
                  ),
                  schedule,
                },
              });
            }
          } else {
            throw new NowBuildError({
              code: 'CRON_SERVICE_NO_CRONS',
              message: `Scheduled service "${legacyExperimentalService.name}" did not produce any cron entries. The builder "${builderPkg.name}" may not support scheduled services.`,
            });
          }
        }

        let mergedBuildResult: BuildResult | BuildOutputConfig = buildResult;
        if ('buildOutputPath' in buildResult) {
          // Read this builder's own Build Output API config directly. When
          // multiple builders write into `.vercel/output`, a later filesystem
          // merge can overwrite `config.json` from a sibling builder.
          const buildOutputConfigPath = join(
            buildResult.buildOutputPath,
            'config.json'
          );
          const buildOutputConfig = await readJSONFile<BuildOutputConfig>(
            buildOutputConfigPath
          );
          if (isCantParseJSONFile(buildOutputConfig)) {
            throw buildOutputConfig;
          }

          if (buildOutputConfig) {
            if (
              !hasExperimentalServicesV1ConfiguredInVercelConfig &&
              !hasExperimentalServicesV2ConfiguredInVercelConfig
            ) {
              const outputConfigPath = join(outputDir, 'config.json');
              const outputConfig =
                await readJSONFile<BuildOutputConfig>(outputConfigPath);
              if (isCantParseJSONFile(outputConfig)) {
                throw outputConfig;
              }
              let shouldMergeGeneratedOutputRoutes = false;
              if (
                hasNonEmptyObject(outputConfig?.experimentalServices) &&
                !hasNonEmptyObject(buildOutputConfig.experimentalServices)
              ) {
                buildOutputConfig.experimentalServices =
                  outputConfig.experimentalServices;
                shouldMergeGeneratedOutputRoutes = true;
              }
              if (
                hasNonEmptyObject(outputConfig?.experimentalServicesV2) &&
                !hasNonEmptyObject(buildOutputConfig.experimentalServicesV2)
              ) {
                buildOutputConfig.experimentalServicesV2 =
                  outputConfig.experimentalServicesV2;
                shouldMergeGeneratedOutputRoutes = true;
              }
              if (
                hasGeneratedServicesConfig(outputConfig) &&
                !hasGeneratedServicesConfig(buildOutputConfig)
              ) {
                buildOutputConfig.services = outputConfig.services;
                shouldMergeGeneratedOutputRoutes = true;
              }
              if (
                shouldMergeGeneratedOutputRoutes &&
                Array.isArray(outputConfig?.routes)
              ) {
                buildOutputConfig.routes = prependMissingBuildOutputRoutes(
                  outputConfig.routes,
                  buildOutputConfig.routes
                );
              }
              if (
                hasNonEmptyObject(buildOutputConfig.experimentalServices) ||
                hasNonEmptyObject(buildOutputConfig.experimentalServicesV2) ||
                hasGeneratedServicesConfig(buildOutputConfig)
              ) {
                await fs.writeJSON(buildOutputConfigPath, buildOutputConfig, {
                  spaces: 2,
                });
              }
            }
            if (
              getHasDetectedServices() &&
              service &&
              legacyExperimentalService &&
              Array.isArray(buildOutputConfig.routes) &&
              detectedServices
            ) {
              buildOutputConfig.routes = scopeRoutesToServiceOwnership({
                routes: buildOutputConfig.routes as Route[],
                owner: legacyExperimentalService,
                allServices: detectedServices,
              });
            }
            mergedBuildResult = buildOutputConfig;
          }
        }
        // Store the build result to generate the final `config.json` after
        // all builds have completed
        buildResults.set(build, mergedBuildResult);
        executedBuilds.push(build);

        let buildOutputLength = 0;
        if ('output' in buildResult) {
          buildOutputLength = Array.isArray(buildResult.output)
            ? buildResult.output.length
            : 1;
        }

        const writeBuildResultPromise = builderSpan
          .child('vc.builder.writeBuildResult', {
            buildOutputLength: String(buildOutputLength),
          })
          .trace<Record<string, PathOverride> | undefined | void>(() =>
            writeBuildResult({
              repoRootPath,
              outputDir,
              buildResult: rawBuildResult,
              build,
              builder,
              builderPkg,
              vercelConfig: localConfig,
              standalone,
              workPath: buildWorkPath,
              service,
              nestServiceOutput: nestExperimentalServicesV2Output,
              stripServiceRoutePrefix,
            })
          );

        if (service && nestExperimentalServicesV2Output) {
          const override = await writeBuildResultPromise;
          if (override) serviceFileOverrides.set(build, override);
        } else {
          // Start flushing the file outputs to the filesystem asynchronously
          ops.push(
            writeBuildResultPromise.then(
              (override: Record<string, PathOverride> | undefined | void) => {
                if (override) {
                  overrides.push({
                    ordinal:
                      buildOrdinals.get(build) ?? Number.MAX_SAFE_INTEGER,
                    override,
                  });
                }
              },
              (err: Error) => err
            )
          );
        }
      } catch (err: unknown) {
        const buildJsonBuild = buildsJsonBuilds.get(build);
        if (buildJsonBuild) {
          buildJsonBuild.error = toEnumerableError(err);
        }
        throw err;
      } finally {
        ops.push(
          download(diagnostics, join(outputDir, 'diagnostics')).then(
            () => undefined,
            err => err
          )
        );
      }
    };

    const sortedBuilds = sortBuildsForExecution(buildsToRun);
    for (const build of sortedBuilds) {
      if (!buildOrdinals.has(build)) {
        buildOrdinals.set(build, buildOrdinals.size);
      }
    }
    const concurrency =
      createBuildRunner && canBuildInSubprocess ? resolveBuildConcurrency() : 1;
    await runBuildsWithConcurrency<Builder>({
      builds: sortedBuilds,
      concurrency,
      isEligible: build => {
        const bp =
          typeof build.src === 'string'
            ? buildersWithPkgs.get(build.use)
            : undefined;
        return (
          !!bp &&
          !!canBuildInSubprocess &&
          canBuildInSubprocess({
            hasDetectedServices: getHasDetectedServices(),
            builderPath: bp.path,
          })
        );
      },
      // Generated services flow:
      // each build READS the shared `outputDir/config.json` to inherit
      // sibling-emitted services fields while siblings WRITE
      // it, so what a build inherits is execution-order-dependent.
      forceSingleChain:
        !hasExperimentalServicesV1ConfiguredInVercelConfig &&
        !hasExperimentalServicesV2ConfiguredInVercelConfig,
      resolveScope: async (build): Promise<InstallScope> => {
        const service =
          getHasDetectedServices() && typeof build.src === 'string'
            ? serviceByBuilder.get(build)
            : undefined;
        if (!service) {
          // No service context to resolve an install scope from, so the safe
          // directory-collision analysis is impossible.
          const key = 'no-service-context';
          return {
            outerKey: key,
            innerKey: `${key}:${build.use}:${String(build.src)}`,
            siblingsSkipInstall: false,
          };
        }
        const serviceWorkspace = isExperimentalService(service)
          ? service.workspace
          : service.root;
        const serviceDir =
          serviceWorkspace && serviceWorkspace !== '.'
            ? join(workPath, serviceWorkspace)
            : workPath;

        const toolchain =
          service.runtime ??
          ['python', 'go', 'ruby', 'rust', 'container'].find(t =>
            build.use.startsWith(`@vercel/${t}`)
          ) ??
          'node';
        const customInstall = Boolean(service.installCommand?.trim());
        const installRoot = await resolveInstallScopeRoot({
          toolchain,
          serviceDir,
          ceilingDir: repoRootPath,
        });
        return {
          outerKey: `${toolchain}:${installRoot}`,
          innerKey: getInstallScopeKey({
            toolchain,
            installDirectory: serviceDir,
            installCommand: service.installCommand,
          }),
          // Only Node default installs are deduped across workers via the
          // merged-back `meta.runNpmInstallSet`, custom commands and other
          // toolchains would re-run a real install.
          siblingsSkipInstall: toolchain === 'node' && !customInstall,
        };
      },
      runBuild: (build, concurrent) => buildOne(build, concurrent),
      log: message => output.log(message),
      reportSecondaryError: (err, build) => {
        output.error(
          `Build failed for "${build.src}": ${err instanceof Error ? err.message : String(err)}`
        );
      },
    });
  };

  const flushOps = async () => {
    const errors = await Promise.all(ops.splice(0));
    for (const error of errors) {
      if (error) {
        throw error;
      }
    }
  };

  const normalizeBuilderSrc = (src: Builder['src']) =>
    typeof src === 'string'
      ? normalizePath(src).replace(/^\.\//, '')
      : undefined;

  const getBuilderIdentity = (build: Builder) => {
    const normalizedSrc = normalizeBuilderSrc(build.src);
    return normalizedSrc ? `${build.use}:${normalizedSrc}` : undefined;
  };

  const getAlreadyExecutedBuild = (candidate: Builder) => {
    const candidateIdentity = getBuilderIdentity(candidate);
    if (!candidateIdentity) return undefined;

    return executedBuilds.find(
      build => getBuilderIdentity(build) === candidateIdentity
    );
  };

  const appendExperimentalServicesV1Routes = (
    services: ExperimentalService[]
  ) => {
    const serviceRoutes = generateServicesRoutes(services);
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: serviceRoutes.hostRewrites.length
        ? serviceRoutes.hostRewrites
        : null,
      phase: null,
    });
    const serviceRewriteRoutes = nestExperimentalServicesV2Output
      ? []
      : [
          ...serviceRoutes.rewrites,
          ...serviceRoutes.workers,
          ...serviceRoutes.crons,
        ];
    zeroConfigRoutes.push(
      ...appendRoutesToPhase({
        routes: [],
        newRoutes: serviceRewriteRoutes,
        phase: 'filesystem',
      })
    );
    if (!nestExperimentalServicesV2Output) {
      zeroConfigRoutes.push(...serviceRoutes.defaults);
      zeroConfigFallbackRoutes.push(...serviceRoutes.fallbacks);
    }
  };

  // `buildResults` fills in completion order under concurrency, so we need to
  // re-sort by scheduling ordinal so every the output is identical across
  // concurrency levels.
  const sortBuildResultsByOrdinal = () => {
    const orderedResults = Array.from(buildResults.entries()).sort(
      ([a], [b]) =>
        (buildOrdinals.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (buildOrdinals.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
    buildResults.clear();
    for (const [build, result] of orderedResults) {
      buildResults.set(build, result);
    }
  };

  // Guarantee every subprocess worker is torn down once builds and the deferred
  // pre-deploy loop are done — including workers kept alive for a pre-deploy whose
  // callback is never reached because a later build or another pre-deploy threw.
  try {
    await runBuilders(builds);
    await flushOps();
    sortBuildResultsByOrdinal();

    if (
      !hasExperimentalServicesV1ConfiguredInVercelConfig &&
      !hasExperimentalServicesV2ConfiguredInVercelConfig
    ) {
      const generatedConfigPath = join(outputDir, 'config.json');
      const generatedConfig =
        await readJSONFile<BuildOutputConfig>(generatedConfigPath);
      if (isCantParseJSONFile(generatedConfig)) {
        throw generatedConfig;
      }

      const defaultGeneratedOutputDir = join(workPath, OUTPUT_DIR);
      const generatedConfigs = [generatedConfig];
      if (resolve(outputDir) !== resolve(defaultGeneratedOutputDir)) {
        const defaultGeneratedConfig = await readJSONFile<BuildOutputConfig>(
          join(defaultGeneratedOutputDir, 'config.json')
        );
        if (isCantParseJSONFile(defaultGeneratedConfig)) {
          throw defaultGeneratedConfig;
        }
        generatedConfigs.push(defaultGeneratedConfig);
      }

      const generatedServicesConfig = getGeneratedServicesConfig([
        ...generatedConfigs,
        ...buildResults.values(),
      ]);
      const generatedExperimentalServicesV1Config =
        getGeneratedExperimentalServicesV1Config([
          ...generatedConfigs,
          ...buildResults.values(),
        ]);

      if (generatedServicesConfig || generatedExperimentalServicesV1Config) {
        if (generatedServicesConfig) {
          nestExperimentalServicesV2Output = true;
        }
        detectedExperimentalServicesV1Config =
          generatedExperimentalServicesV1Config;
        detectedExperimentalServicesV2Config = generatedServicesConfig;
        detectedExperimentalServicesV2RootRoutes = generatedServicesConfig
          ? generatedConfigs.find(
              config =>
                (hasGeneratedServicesConfig(config) ||
                  hasNonEmptyObject(config?.experimentalServicesV2)) &&
                Array.isArray(config?.routes)
            )?.routes
          : undefined;
        const generatedBuilders = await span
          .child('vc.detectGeneratedServices')
          .trace(() =>
            detectBuildersWithServices(files, pkg, {
              ...localConfig,
              ...(generatedServicesConfig
                ? {
                    services: generatedServicesConfig,
                    experimentalServicesV2: undefined,
                  }
                : {
                    experimentalServicesV2: undefined,
                    experimentalServices: generatedExperimentalServicesV1Config,
                  }),
              projectSettings,
              ignoreBuildScript: true,
              featHandleMiss: true,
              workPath,
            })
          );

        if (generatedBuilders.errors && generatedBuilders.errors.length > 0) {
          throw generatedBuilders.errors[0];
        }

        for (const w of generatedBuilders.warnings) {
          output.warn(w.message, null, w.link, w.action || 'Learn More');
        }

        detectedResolvedServices = generatedBuilders.services;
        if (
          !detectedResolvedServices ||
          detectedResolvedServices.length === 0
        ) {
          detectedResolvedServices = undefined;
          detectedServices = undefined;
        } else {
          detectedServices = detectedResolvedServices.filter(
            isExperimentalService
          );
          if (detectedServices.length > 0) {
            appendExperimentalServicesV1Routes(detectedServices);
          }
        }
        if (
          detectedServices &&
          detectedServices.length > 0 &&
          generatedBuilders.useImplicitEnvInjection
        ) {
          const serviceUrlEnvVars = getExperimentalServiceUrlEnvVars({
            services: detectedServices,
            frameworkList,
            currentEnv: process.env,
            deploymentUrl: process.env.VERCEL_URL,
          });
          for (const [key, value] of Object.entries(serviceUrlEnvVars)) {
            process.env[key] = value;
            output.debug(`Injected service URL env var: ${key}=${value}`);
          }
        }

        const buildsToRun: Builder[] = [];
        const seenBuildsToRun = new Set<string>();
        // Only record services we actually treat as services. A generated service
        // whose builder already ran at the project root is warned about and
        // skipped (no service output is produced for it), so it must not leak into
        // `config.json`'s `services` array.
        const recordedServices: Service[] = [];
        for (const service of detectedResolvedServices || []) {
          const alreadyExecutedBuild = getAlreadyExecutedBuild(service.builder);
          if (alreadyExecutedBuild) {
            if (generatedServicesConfig) {
              output.warn(getGeneratedServiceAlreadyBuiltWarning(service));
              continue;
            }
            serviceByBuilder.set(alreadyExecutedBuild, service);
            recordedServices.push(service);
            continue;
          }
          const serviceBuilderIdentity = getBuilderIdentity(service.builder);
          if (
            serviceBuilderIdentity &&
            !seenBuildsToRun.has(serviceBuilderIdentity)
          ) {
            serviceByBuilder.set(service.builder, service);
            seenBuildsToRun.add(serviceBuilderIdentity);
            buildsToRun.push(service.builder);
          }
          recordedServices.push(service);
        }
        servicesToRecord =
          recordedServices.length > 0 ? recordedServices : undefined;

        if (buildsToRun.length > 0) {
          await runBuilders(buildsToRun);
        }
      }
    }

    // Run pre-deploy commands after all builders succeeded.
    // A builder is responsible for handling preDeployCommand, so
    // it will actually own its env, tracing, etc.
    // We do not fire them during the build itself, because not all builds
    // might succeed and be actually deployed.
    // Sorted: pre-deploys execute in scheduling order, not completion order.
    preDeployEntries.sort((a, b) => a.ordinal - b.ordinal);
    for (const entry of preDeployEntries) {
      if (entry.callback) {
        await entry.callback();
      } else {
        output.warn(
          `Service "${entry.service}" has a preDeployCommand but its builder does not support it. The command was not executed.`
        );
      }
    }
  } finally {
    // Settle queued filesystem ops even on the failure path, so a failed run
    // does not leave promises still writing into `outputDir`. Failed ops are
    // re-queued so the success path's flushOps() below still fails the build.
    const settled = await Promise.all(ops.splice(0));
    for (const err of settled) {
      if (err) ops.push(Promise.resolve(err));
    }
    for (const runner of liveRunners) {
      try {
        runner.teardown();
      } catch (err) {
        output.debug(
          `Runner teardown failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Re-sort again, because the generated-services round appended its results after the first sort.
  sortBuildResultsByOrdinal();

  // Aggregate individual package-manifest.json files from builders into
  // a single project-manifest.json and deploy-manifest.json keyed by service workspace.
  packageManifests.sort((a, b) => a.ordinal - b.ordinal);
  await writeManifests(packageManifests, diagnostics, ops, outputDir);

  if (corepackShimDir) {
    cleanupCorepack(corepackShimDir);
  }

  const collectSpan = span.child('vc.finalizeBuildOutput');

  // Wait for filesystem operations to complete
  // TODO render progress bar?
  await flushOps();

  let needBuildsJsonOverride = false;
  const speedInsightsVersion = await getInstalledPackageVersion(
    '@vercel/speed-insights'
  );
  if (speedInsightsVersion) {
    buildsJson.features = {
      ...(buildsJson.features ?? {}),
      speedInsightsVersion,
    };
    needBuildsJsonOverride = true;
  }
  const webAnalyticsVersion =
    await getInstalledPackageVersion('@vercel/analytics');
  if (webAnalyticsVersion) {
    buildsJson.features = {
      ...(buildsJson.features ?? {}),
      webAnalyticsVersion,
    };
    needBuildsJsonOverride = true;
  }
  if (needBuildsJsonOverride) {
    await writeBuildJson(buildsJson, outputDir);
  }

  // Merge existing `config.json` file into the one that will be produced
  const configPath = join(outputDir, 'config.json');
  const existingConfig = await readJSONFile<BuildOutputConfig>(configPath);
  if (isCantParseJSONFile(existingConfig)) {
    throw existingConfig;
  }
  if (existingConfig) {
    // Validate deploymentId if present (user-configured for skew protection)
    if (
      'deploymentId' in existingConfig &&
      typeof existingConfig.deploymentId === 'string'
    ) {
      const deploymentId = existingConfig.deploymentId;
      if (deploymentId.length > 32) {
        throw new NowBuildError({
          code: 'INVALID_DEPLOYMENT_ID',
          message: `The deploymentId "${deploymentId}" must be 32 characters or less. Please choose a shorter deploymentId in your config.`,
          link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
        });
      }
      // Validate character set: only base62 (a-z, A-Z, 0-9) plus hyphen and underscore
      if (!VALID_DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
        throw new NowBuildError({
          code: 'INVALID_DEPLOYMENT_ID',
          message: `The deploymentId "${deploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
          link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
        });
      }
    }

    if (existingConfig.overrides && !nestExperimentalServicesV2Output) {
      overrides.push({
        ordinal: Number.MAX_SAFE_INTEGER,
        override: existingConfig.overrides,
      });
    }
  }

  const topLevelBuildResults = nestExperimentalServicesV2Output
    ? new Map(
        Array.from(buildResults.entries()).filter(
          ([build]) => !serviceByBuilder.has(build)
        )
      )
    : buildResults;

  const builderRoutes: MergeRoutesProps['builds'] = Array.from(
    topLevelBuildResults.entries()
  )
    .filter(b => 'routes' in b[1] && Array.isArray(b[1].routes))
    .map(b => {
      const build = b[0];
      const buildResult = b[1] as BuildResultV2Typical;
      let entrypoint = build.src!;

      if (getHasDetectedServices() && typeof build.src === 'string') {
        const service = serviceByBuilder.get(build);
        if (
          service &&
          isExperimentalService(service) &&
          service.type === 'web' &&
          typeof service.routePrefix === 'string'
        ) {
          entrypoint = getServicesMergeEntrypoint(service, build.src);
        }
      }

      return {
        use: build.use,
        entrypoint,
        routes: buildResult.routes,
      };
    });
  if (zeroConfigRoutes.length) {
    builderRoutes.unshift({
      use: '@vercel/zero-config-routes',
      entrypoint: '/',
      routes: zeroConfigRoutes,
    });
  }
  let mergedRoutes = mergeRoutes({
    userRoutes: routesResult.routes,
    builds: builderRoutes,
  });
  if (zeroConfigFallbackRoutes.length) {
    mergedRoutes = appendRoutesToPhase({
      routes: mergedRoutes,
      newRoutes: zeroConfigFallbackRoutes,
      phase: 'filesystem',
    });
  }

  const mergedImages = mergeImages(
    localConfig.images,
    topLevelBuildResults.values()
  );
  // Cron jobs are registered for the deployment, including jobs emitted by services.
  const orderedServiceCrons = synthesizedServiceCrons
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(entry => entry.cron);
  const mergedCrons = mergeCrons(
    [...(localConfig.crons || []), ...orderedServiceCrons],
    buildResults.values()
  );
  const mergedWildcard = mergeWildcard(topLevelBuildResults.values());
  const mergedDeploymentId = await mergeDeploymentId(
    existingConfig?.deploymentId,
    topLevelBuildResults.values(),
    workPath,
    readJSONFile,
    isCantParseJSONFile
  );

  // Validate merged deploymentId if present (from build results)
  if (mergedDeploymentId) {
    if (mergedDeploymentId.length > 32) {
      throw new NowBuildError({
        code: 'INVALID_DEPLOYMENT_ID',
        message: `The deploymentId "${mergedDeploymentId}" must be 32 characters or less. Please choose a shorter deploymentId in your config.`,
        link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
      });
    }
    // Validate character set: only base62 (a-z, A-Z, 0-9) plus hyphen and underscore
    if (!VALID_DEPLOYMENT_ID_PATTERN.test(mergedDeploymentId)) {
      throw new NowBuildError({
        code: 'INVALID_DEPLOYMENT_ID',
        message: `The deploymentId "${mergedDeploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
        link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
      });
    }
  }

  const topLevelBuildResultOverrides = Array.from(topLevelBuildResults.values())
    .map(result => ('overrides' in result ? result.overrides : undefined))
    .filter((value): value is Record<string, PathOverride> => Boolean(value));
  const orderedOverrides = overrides
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(entry => entry.override);
  const mergedOverrides: Record<string, PathOverride> =
    overrides.length > 0 || topLevelBuildResultOverrides.length > 0
      ? Object.assign({}, ...orderedOverrides, ...topLevelBuildResultOverrides)
      : undefined;

  const framework =
    topLevelBuildResults.size > 0
      ? await getFramework(workPath, topLevelBuildResults)
      : undefined;
  const explicitRootRoutes = appendBuildOutputRouteTables(
    routesResult.routes,
    detectedExperimentalServicesV2RootRoutes ?? existingConfig?.routes
  );
  const mergedRoutesWithGeneratedServicesV2Routes =
    nestExperimentalServicesV2Output
      ? appendBuildOutputRouteTables(
          mergedRoutes,
          detectedExperimentalServicesV2RootRoutes ?? existingConfig?.routes
        )
      : mergedRoutes;

  // Write out the final `config.json` file based on the
  // user configuration and Builder build results
  const config: BuildOutputConfig = {
    version: 3,
    routes: mergedRoutesWithGeneratedServicesV2Routes ?? explicitRootRoutes,
    images: mergedImages,
    wildcard: mergedWildcard,
    overrides: mergedOverrides,
    framework,
    crons: mergedCrons,
    ...(localConfig.schedules &&
      localConfig.schedules.length > 0 && {
        schedules: localConfig.schedules,
      }),
    ...(detectedExperimentalServicesV1Config &&
      Object.keys(detectedExperimentalServicesV1Config).length > 0 && {
        experimentalServices: detectedExperimentalServicesV1Config,
      }),
    ...(detectedExperimentalServicesV2Config &&
      Object.keys(detectedExperimentalServicesV2Config).length > 0 && {
        experimentalServicesV2: detectedExperimentalServicesV2Config,
      }),
    ...(!detectedExperimentalServicesV1Config &&
      servicesToRecord &&
      servicesToRecord.length > 0 && {
        services: servicesToRecord,
      }),
    ...(mergedDeploymentId && { deploymentId: mergedDeploymentId }),
  };
  await fs.writeJSON(join(outputDir, 'config.json'), config, { spaces: 2 });
  if (nestExperimentalServicesV2Output) {
    await writeServiceConfigs(
      outputDir,
      buildResults,
      serviceByBuilder,
      serviceFileOverrides,
      detectedExperimentalServicesV2Config,
      readJSONFile,
      isCantParseJSONFile
    );
  }

  await writeFlagsJSON(buildResults.values(), outputDir, output);

  // Warn when the detected frameworks don't match how the project was built.
  await span.child('vc.frameworkCrossCheck').trace(async s => {
    const detectedFrameworks = await detectedFrameworksPromise;
    const executedBuilders = Array.from(buildResults.keys());
    const usedBuilders = executedBuilders
      .map(b => b.use)
      .filter((use): use is string => Boolean(use));
    const mismatchResult = warnIfFrameworkMismatch(
      {
        configuredFramework: projectSettings.framework,
        detectedFrameworks,
        usedBuilders,
        usedFrameworks: executedBuilders.map(b => b.config?.framework),
      },
      output
    );
    s.setAttributes({
      result: mismatchResult,
      configuredFramework: projectSettings.framework ?? undefined,
      detectedFrameworks: detectedFrameworks.join(',') || undefined,
      usedBuilders: usedBuilders.join(',') || undefined,
    });
  });

  await span.child('vc.validateBuildOutput').trace(async s => {
    const outputProblems = await validateBuildOutput(outputDir, output);
    s.setAttributes({
      problemCount: String(outputProblems.length),
      problems:
        outputProblems.map(p => `${p.severity}: ${p.message}`).join('; ') ||
        undefined,
    });
    reportBuildOutputProblems(outputProblems, output);
  });

  collectSpan.stop();

  return { buildDuration: buildStamp() };
}

async function getFramework(
  cwd: string,
  buildResults: Map<Builder, BuildResult | BuildOutputConfig>
): Promise<{ slug: string; version: string } | undefined> {
  const detectedFramework = await detectFrameworkRecord({
    fs: new LocalFileSystemDetector(cwd),
    frameworkList,
  });

  if (!detectedFramework) {
    return;
  }

  // determine framework version from build result
  if (detectedFramework.useRuntime) {
    for (const [build, buildResult] of buildResults.entries()) {
      if (
        'framework' in buildResult &&
        build.use === detectedFramework.useRuntime.use
      ) {
        return buildResult.framework
          ? {
              slug: buildResult.framework.slug,
              version: buildResult.framework.version,
            }
          : undefined;
      }
    }
  }

  // determine framework version from listed package.json version
  if (detectedFramework.slug) {
    // check for a valid, explicit version, not a range
    if (
      detectedFramework.detectedVersion &&
      semver.valid(detectedFramework.detectedVersion)
    ) {
      return {
        slug: detectedFramework.slug,
        version: detectedFramework.detectedVersion,
      };
    }

    // determine framework version with runtime lookup
    const frameworkVersion = detectFrameworkVersion(detectedFramework);
    if (frameworkVersion) {
      return {
        slug: detectedFramework.slug,
        version: frameworkVersion,
      };
    }
  }
}

function expandBuild(files: string[], build: Builder): Builder[] {
  if (!build.use) {
    throw new NowBuildError({
      code: `invalid_build_specification`,
      message: 'Field `use` is missing in build specification',
      link: 'https://vercel.com/docs/concepts/projects/project-configuration#builds',
      action: 'View Documentation',
    });
  }

  let src = normalize(build.src || '**')
    .split(sep)
    .join('/');
  if (src === '.' || src === './') {
    throw new NowBuildError({
      code: `invalid_build_specification`,
      message: 'A build `src` path resolves to an empty string',
      link: 'https://vercel.com/docs/concepts/projects/project-configuration#builds',
      action: 'View Documentation',
    });
  }

  if (src[0] === '/') {
    // Remove a leading slash so that the globbing is relative
    // to `cwd` instead of the root of the filesystem.
    src = src.substring(1);
  }

  const matches = files.filter(
    name => name === src || minimatch(name, src, { dot: true })
  );

  return matches.map(m => {
    return {
      ...build,
      src: m,
    };
  });
}

function mergeImages(
  images: BuildResultV2Typical['images'],
  buildResults: Iterable<BuildResult | BuildOutputConfig>
): BuildResultV2Typical['images'] {
  for (const result of buildResults) {
    if ('images' in result && result.images) {
      images = Object.assign({}, images, result.images);
    }
  }
  return images;
}
function mergeCrons(
  crons: BuildOutputConfig['crons'] = [],
  buildResults: Iterable<BuildResult | BuildOutputConfig>
): BuildOutputConfig['crons'] {
  for (const result of buildResults) {
    if ('crons' in result && result.crons) {
      crons = crons.concat(result.crons);
    }
  }
  return crons;
}

function mergeWildcard(
  buildResults: Iterable<BuildResult | BuildOutputConfig>
): BuildResultV2Typical['wildcard'] {
  let wildcard: BuildResultV2Typical['wildcard'] = undefined;
  for (const result of buildResults) {
    if ('wildcard' in result && result.wildcard) {
      if (!wildcard) wildcard = [];
      wildcard.push(...result.wildcard);
    }
  }
  return wildcard;
}

function appendBuildOutputRouteTables(
  ...routeTables: Array<BuildOutputConfig['routes'] | null | undefined>
): BuildOutputConfig['routes'] | undefined {
  let routes: Route[] = [];
  for (const routeTable of routeTables) {
    if (!Array.isArray(routeTable) || routeTable.length === 0) continue;

    let phase: HandleValue | null = null;
    let phaseRoutes: Route[] = [];
    const flushPhase = () => {
      if (phaseRoutes.length === 0) return;
      routes = appendRoutesToPhase({
        routes,
        newRoutes: phaseRoutes,
        phase,
      });
      phaseRoutes = [];
    };

    for (const route of routeTable) {
      if (isHandler(route)) {
        flushPhase();
        phase = route.handle;
      } else {
        phaseRoutes.push(route);
      }
    }
    flushPhase();
  }

  return routes.length > 0 ? routes : undefined;
}

function prependMissingBuildOutputRoutes(
  routesToPrepend: BuildOutputConfig['routes'],
  existingRoutes: BuildOutputConfig['routes']
): BuildOutputConfig['routes'] | undefined {
  if (!Array.isArray(routesToPrepend) || routesToPrepend.length === 0) {
    return existingRoutes;
  }

  const existingRouteKeys = new Set(
    (existingRoutes ?? []).map(route => JSON.stringify(route))
  );
  const missingRoutes = routesToPrepend.filter(
    route => !existingRouteKeys.has(JSON.stringify(route))
  );

  return appendBuildOutputRouteTables(missingRoutes, existingRoutes);
}

async function writeServiceConfigs(
  outputDir: string,
  buildResults: Map<Builder, BuildResult | BuildOutputConfig>,
  serviceByBuilder: Map<Builder, Service>,
  serviceFileOverrides: Map<Builder, Record<string, PathOverride>>,
  experimentalServicesV2: ExperimentalServicesV2 | undefined,
  readJSONFile: ReadJSONFile,
  isCantParseJSONFile: DoBuildDependencies['isCantParseJSONFile']
) {
  const serviceResults = new Map<
    string,
    Array<BuildResult | BuildOutputConfig>
  >();
  const serviceOverrides = new Map<
    string,
    Array<Record<string, PathOverride>>
  >();

  for (const [build, buildResult] of buildResults) {
    const service = serviceByBuilder.get(build);
    if (!service) continue;

    const results = serviceResults.get(service.name) || [];
    results.push(buildResult);
    serviceResults.set(service.name, results);

    const fileOverrides = serviceFileOverrides.get(build);
    if (fileOverrides) {
      const overrides = serviceOverrides.get(service.name) || [];
      overrides.push(fileOverrides);
      serviceOverrides.set(service.name, overrides);
    }
  }

  await Promise.all(
    Array.from(serviceResults.entries()).map(async ([serviceName, results]) => {
      const configPath = join(
        outputDir,
        'services',
        serviceName,
        'config.json'
      );
      const existingConfig = await readJSONFile<BuildOutputConfig>(configPath);
      if (isCantParseJSONFile(existingConfig)) {
        throw existingConfig;
      }

      const routes = results.flatMap(result =>
        'routes' in result && Array.isArray(result.routes) ? result.routes : []
      );
      // A Build Output API service build, e.g. Next.js with the
      // Vercel adapter writes its `config.json` into `services/<name>/` via
      // `writeBuildResult`, and that same config is also adopted as the build
      // result. Treat the on-disk config purely as a fallback for fields
      // the build results don't carry, because appending both copies would
      // duplicate every route.
      const existingRoutes =
        routes.length > 0 ? undefined : existingConfig?.routes;
      const existingCrons = results.some(
        result => 'crons' in result && result.crons?.length
      )
        ? undefined
        : existingConfig?.crons;
      const configuredRoutes = experimentalServicesV2?.[serviceName]
        ? getExperimentalServicesV2Routes(experimentalServicesV2[serviceName])
        : [];
      const overrides = [
        ...results
          .map(result => ('overrides' in result ? result.overrides : undefined))
          .filter((value): value is Record<string, PathOverride> =>
            Boolean(value)
          ),
        ...(serviceOverrides.get(serviceName) || []),
      ];
      const framework = results.find(
        (result): result is BuildOutputConfig =>
          'framework' in result && Boolean(result.framework)
      )?.framework;

      const mergedRoutes = appendBuildOutputRouteTables(
        configuredRoutes,
        routes,
        existingRoutes
      );

      const config: BuildOutputConfig = {
        ...existingConfig,
        version: 3,
        routes: mergedRoutes,
        images: mergeImages(existingConfig?.images, results),
        wildcard: mergeWildcard(results) || existingConfig?.wildcard,
        overrides:
          overrides.length > 0
            ? Object.assign({}, existingConfig?.overrides, ...overrides)
            : existingConfig?.overrides,
        framework: framework || existingConfig?.framework,
        crons: mergeCrons(existingCrons, results),
        services: undefined,
        experimentalServices: undefined,
        experimentalServicesV2: undefined,
      };

      await fs.writeJSON(configPath, config, { spaces: 2 });
    })
  );
}

function getExperimentalServicesV2Routes(
  serviceConfig: ExperimentalServicesV2[string]
): Route[] {
  const routesResult = getTransformedRoutes({
    routes: serviceConfig.routes,
    cleanUrls: serviceConfig.cleanUrls,
    trailingSlash: serviceConfig.trailingSlash,
    headers: serviceConfig.headers,
    redirects: serviceConfig.redirects,
    rewrites: serviceConfig.rewrites,
  });
  if (routesResult.error) {
    throw routesResult.error;
  }

  return routesResult.routes ?? [];
}

function getGeneratedExperimentalServicesV1Config(
  buildResults: Iterable<BuildResult | BuildOutputConfig | null | undefined>
): ExperimentalServices | undefined {
  for (const result of buildResults) {
    if (
      result &&
      'experimentalServices' in result &&
      hasNonEmptyObject(result.experimentalServices)
    ) {
      return result.experimentalServices;
    }
  }
  return undefined;
}

function hasGeneratedServicesConfig(
  result: BuildResult | BuildOutputConfig | null | undefined
): result is (BuildResult | BuildOutputConfig) & {
  services: ExperimentalServicesV2;
} {
  return (
    result != null && 'services' in result && hasNonEmptyObject(result.services)
  );
}

function getGeneratedServicesConfig(
  buildResults: Iterable<BuildResult | BuildOutputConfig | null | undefined>
): ExperimentalServicesV2 | undefined {
  for (const result of buildResults) {
    if (hasGeneratedServicesConfig(result)) {
      return result.services;
    }
    if (
      result &&
      'experimentalServicesV2' in result &&
      hasNonEmptyObject(result.experimentalServicesV2)
    ) {
      return result.experimentalServicesV2;
    }
  }
  return undefined;
}

async function mergeDeploymentId(
  existingDeploymentId: string | undefined,
  buildResults: Iterable<BuildResult | BuildOutputConfig>,
  workPath: string,
  readJSONFile: ReadJSONFile,
  isCantParseJSONFile: DoBuildDependencies['isCantParseJSONFile']
): Promise<string | undefined> {
  // Prefer existing deploymentId from config.json if present
  if (existingDeploymentId) {
    return existingDeploymentId;
  }
  // Otherwise, take the first deploymentId from build results
  for (const result of buildResults) {
    if ('deploymentId' in result && result.deploymentId) {
      return result.deploymentId;
    }
  }
  // For Next.js builds, try reading from routes-manifest.json
  // where Next.js writes the deploymentId during build
  try {
    const routesManifestPath = join(workPath, '.next', 'routes-manifest.json');
    if (await fs.pathExists(routesManifestPath)) {
      const routesManifest = await readJSONFile<{ deploymentId?: string }>(
        routesManifestPath
      );
      if (routesManifest && !isCantParseJSONFile(routesManifest)) {
        if (routesManifest.deploymentId) {
          return routesManifest.deploymentId;
        }
      }
    }
  } catch {
    // Ignore errors reading routes-manifest.json
  }
  return undefined;
}

/**
 * Takes the build output and writes all the flags into the `flags.json`
 * file. It'll skip flags that already exist.
 */
async function writeFlagsJSON(
  buildResults: Iterable<BuildResult | BuildOutputConfig>,
  outputDir: string,
  output: BuildOutput
): Promise<void> {
  const flagsFilePath = join(outputDir, 'flags.json');

  let hasFlags = true;

  const flags = (await fs.readJSON(flagsFilePath).catch(error => {
    if (error.code === 'ENOENT') {
      hasFlags = false;
      return { definitions: {} };
    }

    throw error;
  })) as { definitions: FlagDefinitions };

  for (const result of buildResults) {
    if (!('flags' in result) || !result.flags || !result.flags.definitions)
      continue;

    for (const [key, definition] of Object.entries(result.flags.definitions)) {
      if (result.flags.definitions[key]) {
        output.warn(
          `The flag "${key}" was found multiple times. Only its first occurrence will be considered.`
        );
        continue;
      }

      hasFlags = true;
      flags.definitions[key] = definition;
    }
  }

  // Only create the file when there are flags to write,
  // or when the file already exists.
  // Checking `definitions` alone won't be enough in case there
  // are other properties set.
  if (hasFlags) {
    await fs.writeJSON(flagsFilePath, flags, { spaces: 2 });
  }
}

interface ApiDirFrameworkDetector {
  detect(builderUse: string, workPath: string): Promise<string | undefined>;
}

/**
 * Creates a memoised api/dir framework detector, scoped to one build, so N
 * api/dir files sharing a builder+workPath share one filesystem scan instead
 * of running one per file.
 */
function createApiDirFrameworkDetector(
  detectAllFrameworks: DetectAllFrameworks
): ApiDirFrameworkDetector {
  const cache = new Map<string, Promise<string | undefined>>();
  return {
    detect(builderUse, workPath) {
      const cacheKey = `${builderUse}:${workPath}`;
      let cached = cache.get(cacheKey);
      if (!cached) {
        cached = detectApiDirFramework(
          builderUse,
          workPath,
          detectAllFrameworks
        );
        cache.set(cacheKey, cached);
      }
      return cached;
    },
  };
}

/**
 * Detects the framework used by an api/dir builder.
 *
 * Runs a narrow scan scoped to the builder's own frameworks; builders with
 * no framework mappings (e.g. `@vercel/node`) return without touching the
 * filesystem.
 */
async function detectApiDirFramework(
  builderUse: string,
  workPath: string,
  detectAllFrameworks: DetectAllFrameworks
): Promise<string | undefined> {
  const runtimeFrameworks = builderToFrameworks.get(builderUse) ?? [];
  if (runtimeFrameworks.length === 0) return undefined;

  const detectedSlugs = await detectAllFrameworks(
    workPath,
    runtimeFrameworks
  ).catch(() => []);
  // Return the framework only when exactly one is detected. Zero means none
  // found; more than one means ambiguous (e.g. fastapi + flask), so return
  // undefined rather than picking arbitrarily.
  return detectedSlugs.length === 1 ? detectedSlugs[0] : undefined;
}

async function writeBuildJson(buildsJson: BuildsManifest, outputDir: string) {
  await fs.writeJSON(join(outputDir, 'builds.json'), buildsJson, { spaces: 2 });
}

function normalizeServiceRoutePrefix(routePrefix: string): string {
  let prefix = routePrefix.startsWith('/') ? routePrefix : `/${routePrefix}`;
  if (prefix !== '/' && prefix.endsWith('/')) {
    prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/**
 * Build a synthetic `entrypoint` key used only when merging builder route tables
 * in services mode.
 *
 * `mergeRoutes()` sorts builder routes by `entrypoint` lexicographically. If we
 * used the real build src (file paths), ordering would be unrelated to URL
 * specificity. In services mode we instead want more specific prefixes (longer
 * routePrefix) to win before broader ones.
 *
 * So we create the following key for merge ordering:
 *   `svc:${sortKey}:${normalizedPrefix}:${serviceName}:${buildSrc}`
 *
 * Example:
 *   "/api/fastapi" (len 12) -> "svc:09988:/api/fastapi:fastapi-api:services/fastapi-api/main.py"
 *   "/api"         (len 4)  -> "svc:09996:/api:api:services/api/index.ts"
 *
 * This key is only for merge ordering. It does not change build entrypoints,
 * output paths, or routing destinations.
 */
function getServicesMergeEntrypoint(
  service: ExperimentalService,
  buildSrc: string
): string {
  const routePrefix =
    typeof service.routePrefix === 'string' ? service.routePrefix : '/';
  const normalized = normalizeServiceRoutePrefix(routePrefix);
  const sortKey = String(10000 - normalized.length).padStart(5, '0');
  return `svc:${sortKey}:${normalized}:${service.name}:${buildSrc}`;
}

function attachQueueServiceTrigger(
  buildOutput: BuildResultV2Typical['output'] | BuildResultV3['output'],
  service: ExperimentalService
): void {
  const topics = getServiceQueueTopicConfigs(service);
  const consumer = sanitizeConsumerName(
    getInternalServiceFunctionPath(service.name)
  );

  if (service.builder.use !== '@vercel/python' && topics.length > 1) {
    throw new Error(
      `Worker service "${service.name}" has ${topics.length} topics, but multiple topics are only supported for Python workers.`
    );
  }

  for (const topicConfig of topics) {
    const trigger: TriggerEvent = {
      type: 'queue/v2beta',
      topic: topicConfig.topic,
      consumer,
    };
    if (topicConfig.retryAfterSeconds !== undefined) {
      trigger.retryAfterSeconds = topicConfig.retryAfterSeconds;
    }
    if (topicConfig.initialDelaySeconds !== undefined) {
      trigger.initialDelaySeconds = topicConfig.initialDelaySeconds;
    }

    if (isLambda(buildOutput)) {
      appendTrigger(buildOutput, trigger);
    } else {
      for (const output of Object.values(buildOutput)) {
        if (isLambda(output)) {
          appendTrigger(output, trigger);
        }
      }
    }
  }
}

function triggerMatches(
  trigger: TriggerEvent,
  existingTrigger: TriggerEvent
): boolean {
  if (trigger.type === 'schedule/v1beta') {
    return trigger.type === existingTrigger.type;
  }

  return (
    trigger.type === existingTrigger.type &&
    trigger.topic === existingTrigger.topic &&
    trigger.consumer === existingTrigger.consumer
  );
}

function appendTrigger(lambda: Lambda, trigger: TriggerEvent): void {
  const existingTriggers = Array.isArray(lambda.experimentalTriggers)
    ? lambda.experimentalTriggers
    : [];
  const alreadyConfigured = existingTriggers.some(existing =>
    triggerMatches(trigger, existing)
  );
  if (!alreadyConfigured) {
    lambda.experimentalTriggers = [...existingTriggers, trigger];
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(Uint8Array.from(buffer));
  }
  return Buffer.concat(chunks).toString('utf-8');
}
