import fs from 'fs-extra';
import minimatch from 'minimatch';
import semver from 'semver';
import { join, normalize, sep } from 'path';
import { NowBuildError } from './errors';
import { getInstalledPackageVersion } from './get-installed-package-version';
import {
  isBackendBuilder,
  shouldUseExperimentalBackends,
} from './framework-helpers';
import { getDiscontinuedNodeVersions } from './fs/node-version';
import FileFsRef from './file-fs-ref';
import download from './fs/download';
import type { Span } from './trace';
import type {
  Builder,
  BuilderV2 as TypesBuilderV2,
  BuilderV3 as TypesBuilderV3,
  BuildOptions,
  BuildResultV2,
  BuildResultV2Typical,
  BuildResultV3,
  Config,
  Cron,
  Files,
  FlagDefinitions,
  Meta,
  PackageJson,
  ProjectSettings as TypesProjectSettings,
} from './types';
import type { Lambda } from './lambda';

/**
 * Re-export types for consumers
 */
export type BuildResult = BuildResultV2 | BuildResultV3;

/**
 * Serialized builder information for builds.json
 */
export interface SerializedBuilder extends Builder {
  error?: any;
  require?: string;
  requirePath?: string;
  apiVersion: number;
}

/**
 * Build Output API `config.json` file interface.
 */
export interface BuildOutputConfig {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<string, PathOverride>;
  framework?: {
    version: string;
  };
  crons?: Cron[];
  deploymentId?: string;
}

/**
 * Contents of the `builds.json` file.
 */
export interface BuildsManifest {
  '//': string;
  target: string;
  argv: string[];
  error?: any;
  builds?: SerializedBuilder[];
  features?: {
    speedInsightsVersion?: string | undefined;
    webAnalyticsVersion?: string | undefined;
  };
}

/**
 * Path override configuration for static files
 */
export interface PathOverride {
  contentType?: string;
  path?: string;
}

/**
 * Logger interface for build output
 */
export interface BuildLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * Re-export BuilderV2 and BuilderV3 from types for consumers
 */
export type BuilderV2 = TypesBuilderV2;
export type BuilderV3 = TypesBuilderV3;

/**
 * Builder with package information
 */
export interface BuilderWithPkg {
  path: string;
  pkgPath: string;
  builder: BuilderV2 | BuilderV3;
  pkg: PackageJson & { name: string };
}

/**
 * Route type (simplified)
 */
export interface Route {
  src?: string;
  dest?: string;
  headers?: Record<string, string>;
  methods?: string[];
  handle?: string;
  status?: number;
  continue?: boolean;
  check?: boolean;
  redirect?: boolean;
  [key: string]: unknown;
}

/**
 * Framework interface (simplified)
 */
export interface Framework {
  slug: string;
  name: string;
  useRuntime?: { use: string };
  defaultRoutes?: Route[] | ((dirPrefix: string) => Promise<Route[]>);
  [key: string]: unknown;
}

/**
 * Re-export ProjectSettings from types for consumers
 */
export type ProjectSettings = TypesProjectSettings;

/**
 * Vercel config interface (simplified)
 */
export interface VercelConfig {
  builds?: Builder[];
  functions?: Record<string, unknown>;
  routes?: Route[];
  images?: BuildResultV2Typical['images'];
  crons?: Cron[];
  cleanUrls?: boolean;
  bunVersion?: string;
  customErrorPage?: string | { default5xx?: string; default4xx?: string };
  [key: string]: unknown;
}

/**
 * Experimental backends builder interface
 */
export interface ExperimentalBackendsBuilder {
  build: (options: BuildOptions) => Promise<BuildResultV2 | BuildResultV3>;
}

/**
 * Options for the runBuild function
 */
export interface RunBuildOptions {
  /**
   * Current working directory (repo root)
   */
  cwd: string;

  /**
   * Work path (project root with rootDirectory applied)
   */
  workPath: string;

  /**
   * Output directory for build artifacts
   */
  outputDir: string;

  /**
   * Build target (e.g., 'preview', 'production')
   */
  target: string;

  /**
   * Project settings
   */
  projectSettings: ProjectSettings;

  /**
   * Local vercel.json configuration
   */
  localConfig: VercelConfig;

  /**
   * Package.json contents
   */
  pkg: PackageJson | null;

  /**
   * List of source files (relative paths)
   */
  files: string[];

  /**
   * Builds manifest to populate
   */
  buildsJson: BuildsManifest;

  /**
   * Builders with their packages
   */
  buildersWithPkgs: Map<string, BuilderWithPkg>;

  /**
   * Sorted list of builders to execute
   */
  sortedBuilders: Builder[];

  /**
   * Whether this is a zero-config build
   */
  isZeroConfig: boolean;

  /**
   * Zero-config routes (if applicable)
   */
  zeroConfigRoutes: Route[];

  /**
   * User-defined routes from config
   */
  userRoutes?: Route[];

  /**
   * CLI version
   */
  cliVersion: string;

  /**
   * Whether to create standalone builds
   */
  standalone?: boolean;

  /**
   * Logger for build output
   */
  logger: BuildLogger;

  /**
   * Tracing span
   */
  span: Span;

  /**
   * Framework list for route detection
   */
  frameworkList: Framework[];

  /**
   * Function to write build results to filesystem
   */
  writeBuildResult: (
    args: WriteBuildResultArgs
  ) => Promise<Record<string, PathOverride> | undefined | void>;

  /**
   * Function to merge routes
   */
  mergeRoutes: (args: MergeRoutesArgs) => Route[];

  /**
   * Function to convert source to regex
   */
  sourceToRegex: (source: string) => { src: string };

  /**
   * Function to detect framework record
   */
  detectFrameworkRecord: (
    args: DetectFrameworkArgs
  ) => Promise<DetectedFramework | null>;

  /**
   * Function to detect framework version
   */
  detectFrameworkVersion: (framework: DetectedFramework) => string | undefined;

  /**
   * LocalFileSystemDetector class
   */
  LocalFileSystemDetector: new (path: string) => any;

  /**
   * Optional experimental backends builder (for @vercel/backends support)
   */
  experimentalBackendsBuilder?: ExperimentalBackendsBuilder;
}

/**
 * Arguments for writeBuildResult
 */
export interface WriteBuildResultArgs {
  repoRootPath: string;
  outputDir: string;
  buildResult: BuildResult;
  build: Builder;
  builder: BuilderV2 | BuilderV3;
  builderPkg: PackageJson;
  vercelConfig: VercelConfig | null;
  standalone: boolean;
  workPath: string;
}

/**
 * Arguments for mergeRoutes
 */
export interface MergeRoutesArgs {
  userRoutes?: Route[];
  builds: Array<{
    use: string;
    entrypoint: string;
    routes?: Route[];
  }>;
}

/**
 * Arguments for detectFrameworkRecord
 */
export interface DetectFrameworkArgs {
  fs: any;
  frameworkList: Framework[];
}

/**
 * Detected framework result
 */
export interface DetectedFramework {
  slug: string;
  useRuntime?: { use: string };
  detectedVersion?: string;
  [key: string]: unknown;
}

/**
 * Options for preparing the build
 */
export interface PrepareBuildOptions {
  /**
   * List of source files (relative paths)
   */
  files: string[];

  /**
   * Package.json contents
   */
  pkg: PackageJson | null;

  /**
   * Local vercel.json configuration
   */
  localConfig: VercelConfig;

  /**
   * Project settings
   */
  projectSettings: ProjectSettings;

  /**
   * Work path (project root)
   */
  workPath: string;

  /**
   * Logger for build output
   */
  logger: BuildLogger;

  /**
   * Function to detect builders
   */
  detectBuilders: (
    files: string[],
    pkg: PackageJson | null,
    options: any
  ) => Promise<DetectBuildersResult>;

  /**
   * Function to append routes to a phase
   */
  appendRoutesToPhase: (args: {
    routes: Route[];
    newRoutes?: Route[];
    phase?: string;
  }) => Route[];
}

/**
 * Result from detectBuilders
 */
export interface DetectBuildersResult {
  builders?: Builder[] | null;
  errors?: Array<{ message: string; code?: string }> | null;
  warnings: Array<{ message: string; link?: string; action?: string }>;
  redirectRoutes?: Route[] | null;
  rewriteRoutes?: Route[] | null;
  errorRoutes?: Route[] | null;
  defaultRoutes?: Route[] | null;
}

/**
 * Result from prepareBuild
 */
export interface PrepareBuildResult {
  /**
   * List of builders to execute
   */
  builds: Builder[];

  /**
   * Zero-config routes
   */
  zeroConfigRoutes: Route[];

  /**
   * Whether this is a zero-config build
   */
  isZeroConfig: boolean;
}

/**
 * Regex pattern for validating deploymentId characters
 */
const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Prepares the build configuration by detecting builders and routes.
 * This function handles the setup logic before actual build execution.
 */
export async function prepareBuild(
  options: PrepareBuildOptions
): Promise<PrepareBuildResult> {
  const {
    files,
    pkg,
    localConfig,
    projectSettings,
    workPath,
    logger,
    detectBuilders,
    appendRoutesToPhase,
  } = options;

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
  let isZeroConfig = false;

  if (builds.length > 0) {
    logger.warn(
      'Due to `builds` existing in your configuration file, the Build and Development Settings defined in your Project Settings will not apply. Learn More: https://vercel.link/unused-build-settings'
    );
    builds = builds.map(b => expandBuild(files, b)).flat();
  } else {
    // Zero config
    isZeroConfig = true;

    // Detect the Vercel Builders that will need to be invoked
    const detectedBuilders = await detectBuilders(files, pkg, {
      ...localConfig,
      projectSettings,
      ignoreBuildScript: true,
      featHandleMiss: true,
      workPath,
    });

    if (detectedBuilders.errors && detectedBuilders.errors.length > 0) {
      throw detectedBuilders.errors[0];
    }

    for (const w of detectedBuilders.warnings) {
      logger.warn(w.message);
    }

    if (detectedBuilders.builders) {
      builds = detectedBuilders.builders;
    } else {
      builds = [{ src: '**', use: '@vercel/static' }];
    }

    zeroConfigRoutes.push(...(detectedBuilders.redirectRoutes || []));
    zeroConfigRoutes.push(
      ...appendRoutesToPhase({
        routes: [],
        newRoutes: detectedBuilders.rewriteRoutes ?? undefined,
        phase: 'filesystem',
      })
    );
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: detectedBuilders.errorRoutes ?? undefined,
      phase: 'error',
    });
    zeroConfigRoutes.push(...(detectedBuilders.defaultRoutes || []));
  }

  return {
    builds,
    zeroConfigRoutes,
    isZeroConfig,
  };
}

/**
 * Expands a build specification by matching src patterns against files
 */
export function expandBuild(files: string[], build: Builder): Builder[] {
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

/**
 * Merges images configuration from build results
 */
export function mergeImages(
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

/**
 * Merges crons configuration from build results
 */
export function mergeCrons(
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

/**
 * Merges wildcard configuration from build results
 */
export function mergeWildcard(
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

/**
 * Merges deploymentId from build results
 */
export async function mergeDeploymentId(
  existingDeploymentId: string | undefined,
  buildResults: Iterable<BuildResult | BuildOutputConfig>,
  workPath: string,
  readJSONFile: <T>(path: string) => Promise<T | null | { error: Error }>
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
  // For prebuilt Next.js deployments, try reading from routes-manifest.json
  // where Next.js writes the deploymentId during build
  try {
    const routesManifestPath = join(workPath, '.next', 'routes-manifest.json');
    if (await fs.pathExists(routesManifestPath)) {
      const routesManifest = await readJSONFile<{ deploymentId?: string }>(
        routesManifestPath
      );
      if (
        routesManifest &&
        typeof routesManifest === 'object' &&
        !('error' in routesManifest)
      ) {
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
 * Validates a deploymentId
 */
export function validateDeploymentId(deploymentId: string): void {
  if (deploymentId.startsWith('dpl_')) {
    throw new NowBuildError({
      code: 'INVALID_DEPLOYMENT_ID',
      message: `The deploymentId "${deploymentId}" cannot start with the "dpl_" prefix. Please choose a different deploymentId in your config.`,
      link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
    });
  }
  if (deploymentId.length > 32) {
    throw new NowBuildError({
      code: 'INVALID_DEPLOYMENT_ID',
      message: `The deploymentId "${deploymentId}" must be 32 characters or less. Please choose a shorter deploymentId in your config.`,
      link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
    });
  }
  if (!VALID_DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
    throw new NowBuildError({
      code: 'INVALID_DEPLOYMENT_ID',
      message: `The deploymentId "${deploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
      link: 'https://vercel.com/docs/skew-protection#custom-skew-protection-deployment-id',
    });
  }
}

/**
 * Writes the builds.json manifest file
 */
export async function writeBuildJson(
  buildsJson: BuildsManifest,
  outputDir: string
): Promise<void> {
  await fs.writeJSON(join(outputDir, 'builds.json'), buildsJson, { spaces: 2 });
}

/**
 * Takes the build output and writes all the flags into the `flags.json` file
 */
export async function writeFlagsJSON(
  buildResults: Iterable<BuildResult | BuildOutputConfig>,
  outputDir: string,
  logger: BuildLogger
): Promise<void> {
  const flagsFilePath = join(outputDir, 'flags.json');

  let hasFlags = true;

  const flags = (await fs.readJSON(flagsFilePath).catch((error: any) => {
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
      if (flags.definitions[key]) {
        logger.warn(
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
  if (hasFlags) {
    await fs.writeJSON(flagsFilePath, flags, { spaces: 2 });
  }
}

/**
 * Gets framework routes from a framework definition
 */
export async function getFrameworkRoutes(
  framework: Framework,
  dirPrefix: string
): Promise<Route[]> {
  let routes: Route[] = [];
  if (typeof framework.defaultRoutes === 'function') {
    routes = await framework.defaultRoutes(dirPrefix);
  } else if (Array.isArray(framework.defaultRoutes)) {
    routes = framework.defaultRoutes;
  }
  return routes;
}

/**
 * Gets the detected framework and version
 */
export async function getFramework(
  cwd: string,
  buildResults: Map<Builder, BuildResult | BuildOutputConfig>,
  detectFrameworkRecord: RunBuildOptions['detectFrameworkRecord'],
  detectFrameworkVersion: RunBuildOptions['detectFrameworkVersion'],
  LocalFileSystemDetector: RunBuildOptions['LocalFileSystemDetector'],
  frameworkList: Framework[]
): Promise<{ version: string } | undefined> {
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
        return buildResult.framework;
      }
    }
  }

  // determine framework version from listed package.json version
  if (detectedFramework.detectedVersion) {
    // check for a valid, explicit version, not a range
    if (semver.valid(detectedFramework.detectedVersion)) {
      return {
        version: detectedFramework.detectedVersion,
      };
    }
  }

  // determine framework version with runtime lookup
  const frameworkVersion = detectFrameworkVersion(detectedFramework);
  if (frameworkVersion) {
    return {
      version: frameworkVersion,
    };
  }

  return undefined;
}

/**
 * Execute the Project's builders and generate build output.
 * This is the core build logic extracted from the CLI.
 */
export async function runBuild(options: RunBuildOptions): Promise<void> {
  const {
    cwd,
    workPath,
    outputDir,
    projectSettings,
    localConfig,
    files,
    buildsJson,
    buildersWithPkgs,
    sortedBuilders,
    isZeroConfig,
    zeroConfigRoutes,
    userRoutes,
    cliVersion,
    standalone = false,
    logger,
    span,
    frameworkList,
    writeBuildResult,
    mergeRoutes,
    sourceToRegex,
    detectFrameworkRecord,
    detectFrameworkVersion,
    LocalFileSystemDetector,
    experimentalBackendsBuilder,
  } = options;

  // Populate Files -> FileFsRef mapping
  const filesMap: Files = {};
  for (const path of files) {
    const fsPath = join(workPath, path);
    const { mode } = await fs.stat(fsPath);
    filesMap[path] = new FileFsRef({ mode, fsPath });
  }

  // Create fresh new output directory
  await fs.mkdirp(outputDir);

  const ops: Promise<Error | void>[] = [];

  // Write the `detectedBuilders` result to output dir
  const buildsJsonBuilds = new Map<Builder, SerializedBuilder>(
    sortedBuilders.map(build => {
      const builderWithPkg = buildersWithPkgs.get(build.use);
      if (!builderWithPkg) {
        throw new Error(`Failed to load Builder "${build.use}"`);
      }
      const { builder, pkg: builderPkg } = builderWithPkg;
      return [
        build,
        {
          require: builderPkg.name,
          requirePath: builderWithPkg.path,
          apiVersion: builder.version,
          ...build,
        },
      ];
    })
  );

  buildsJson.builds = Array.from(buildsJsonBuilds.values());
  await writeBuildJson(buildsJson, outputDir);

  // The `meta` config property is re-used for each Builder
  // invocation so that Builders can share state between
  // subsequent entrypoint builds.
  const meta: Meta = {
    skipDownload: true,
    cliVersion,
  };

  // Execute Builders for detected entrypoints
  const buildResults: Map<Builder, BuildResult | BuildOutputConfig> = new Map();
  const overrides: PathOverride[] = [];
  const repoRootPath = cwd;
  const diagnostics: Files = {};

  for (const build of sortedBuilders) {
    if (typeof build.src !== 'string') continue;

    const builderWithPkg = buildersWithPkgs.get(build.use);
    if (!builderWithPkg) {
      throw new Error(`Failed to load Builder "${build.use}"`);
    }

    try {
      const { builder, pkg: builderPkg } = builderWithPkg;

      for (const key of [
        'buildCommand',
        'installCommand',
        'outputDirectory',
        'nodeVersion',
      ] as const) {
        const value = projectSettings[key as keyof ProjectSettings];
        if (typeof value === 'string') {
          const envKey =
            `VERCEL_PROJECT_SETTINGS_` +
            key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
          process.env[envKey] = value;
          logger.debug(`Setting env ${envKey} to "${value}"`);
        }
      }

      const isFrontendBuilder = build.config && 'framework' in build.config;
      const buildConfig: Config = isZeroConfig
        ? {
            outputDirectory:
              (projectSettings.outputDirectory as string) ?? undefined,
            ...build.config,
            projectSettings,
            installCommand:
              (projectSettings.installCommand as string) ?? undefined,
            devCommand: (projectSettings.devCommand as string) ?? undefined,
            buildCommand: (projectSettings.buildCommand as string) ?? undefined,
            framework: projectSettings.framework,
            nodeVersion: projectSettings.nodeVersion,
            bunVersion: (localConfig.bunVersion as string) ?? undefined,
          }
        : {
            ...(build.config || {}),
            bunVersion: (localConfig.bunVersion as string) ?? undefined,
          };

      const builderSpan = span.child('vc.builder', {
        name: builderPkg.name,
      });

      const buildOptions: BuildOptions = {
        files: filesMap,
        entrypoint: build.src,
        workPath,
        repoRootPath,
        config: buildConfig,
        meta,
        span: builderSpan,
      };
      logger.debug(
        `Building entrypoint "${build.src}" with "${builderPkg.name}"`
      );
      let buildResult: BuildResultV2 | BuildResultV3;
      try {
        buildResult = await builderSpan.trace<BuildResultV2 | BuildResultV3>(
          async () => {
            // Use experimental backends builder only for backend framework builders,
            // not for static builders (which handle public/ directories)
            if (
              experimentalBackendsBuilder &&
              shouldUseExperimentalBackends(buildConfig.framework) &&
              builderPkg.name !== '@vercel/static' &&
              isBackendBuilder(build)
            ) {
              return experimentalBackendsBuilder.build(buildOptions);
            }
            return builder.build(buildOptions);
          }
        );

        // If the build result has no routes and the framework has default routes,
        // then add the default routes to the build result
        if (
          buildConfig.zeroConfig &&
          isFrontendBuilder &&
          'output' in buildResult &&
          !buildResult.routes
        ) {
          const framework = frameworkList.find(
            f => f.slug === buildConfig.framework
          );
          if (framework) {
            const defaultRoutes = await getFrameworkRoutes(framework, workPath);
            buildResult.routes = defaultRoutes;
          }
        }
      } finally {
        // Make sure we don't fail the build
        try {
          const builderDiagnostics = await builderSpan
            .child('vc.builder.diagnostics')
            .trace(async () => {
              return await builder.diagnostics?.(buildOptions);
            });
          Object.assign(diagnostics, builderDiagnostics);
        } catch (error) {
          logger.error('Collecting diagnostics failed');
          logger.debug(String(error));
        }
      }

      if (
        buildResult &&
        'output' in buildResult &&
        'runtime' in buildResult.output &&
        'type' in buildResult.output &&
        buildResult.output.type === 'Lambda'
      ) {
        const lambdaRuntime = (buildResult.output as Lambda).runtime;
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
        const routesJsonPath = join(workPath, '.vercel', 'routes.json');
        if (await fs.pathExists(routesJsonPath)) {
          try {
            const routesJson = await fs.readJSON(routesJsonPath);
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
              const convertedRoutes: Route[] = [];
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
                (buildResult as BuildResultV2Typical).output = convertedOutputs;
              }
            }
          } catch (error) {
            logger.error(`Failed to read routes.json: ${error}`);
          }
        }
      }

      // Store the build result to generate the final `config.json` after
      // all builds have completed
      buildResults.set(build, buildResult);

      let buildOutputLength = 0;
      if ('output' in buildResult) {
        buildOutputLength = Array.isArray(buildResult.output)
          ? buildResult.output.length
          : 1;
      }

      // Start flushing the file outputs to the filesystem asynchronously
      ops.push(
        builderSpan
          .child('vc.builder.writeBuildResult', {
            buildOutputLength: String(buildOutputLength),
          })
          .trace<Record<string, PathOverride> | undefined | void>(() =>
            writeBuildResult({
              repoRootPath,
              outputDir,
              buildResult,
              build,
              builder,
              builderPkg,
              vercelConfig: localConfig,
              standalone,
              workPath,
            })
          )
          .then(
            (override: Record<string, PathOverride> | undefined | void) => {
              if (override) overrides.push(override as PathOverride);
            },
            (err: Error) => err
          )
      );
    } catch (err: any) {
      const buildJsonBuild = buildsJsonBuilds.get(build);
      if (buildJsonBuild) {
        buildJsonBuild.error = err;
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
  }

  // Wait for filesystem operations to complete
  const errors = await Promise.all(ops);
  for (const error of errors) {
    if (error) {
      throw error;
    }
  }

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

  // Define a simple readJSONFile function for mergeDeploymentId
  const readJSONFile = async <T>(
    path: string
  ): Promise<T | null | { error: Error }> => {
    try {
      return await fs.readJSON(path);
    } catch (error) {
      return null;
    }
  };

  // Merge existing `config.json` file into the one that will be produced
  const configPath = join(outputDir, 'config.json');
  let existingConfig: BuildOutputConfig | null = null;
  try {
    existingConfig = await fs.readJSON(configPath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (existingConfig) {
    // Validate deploymentId if present (user-configured for skew protection)
    if (
      'deploymentId' in existingConfig &&
      typeof existingConfig.deploymentId === 'string'
    ) {
      validateDeploymentId(existingConfig.deploymentId);
    }

    if (existingConfig.overrides) {
      overrides.push(existingConfig.overrides as PathOverride);
    }
    // Find the `Build` entry for this config file and update the build result
    for (const [build, buildResult] of buildResults.entries()) {
      if ('buildOutputPath' in buildResult) {
        logger.debug(`Using "config.json" for "${build.use}`);
        buildResults.set(build, existingConfig);
        break;
      }
    }
  }

  const builderRoutes: MergeRoutesArgs['builds'] = Array.from(
    buildResults.entries()
  )
    .filter(b => 'routes' in b[1] && Array.isArray(b[1].routes))
    .map(b => {
      return {
        use: b[0].use,
        entrypoint: b[0].src!,
        routes: (b[1] as BuildResultV2Typical).routes,
      };
    });
  if (zeroConfigRoutes.length) {
    builderRoutes.unshift({
      use: '@vercel/zero-config-routes',
      entrypoint: '/',
      routes: zeroConfigRoutes,
    });
  }
  const mergedRoutes = mergeRoutes({
    userRoutes,
    builds: builderRoutes,
  });

  const mergedImages = mergeImages(localConfig.images, buildResults.values());
  const mergedCrons = mergeCrons(localConfig.crons, buildResults.values());
  const mergedWildcard = mergeWildcard(buildResults.values());
  const mergedDeploymentId = await mergeDeploymentId(
    existingConfig?.deploymentId,
    buildResults.values(),
    workPath,
    readJSONFile
  );

  // Validate merged deploymentId if present (from build results)
  if (mergedDeploymentId) {
    validateDeploymentId(mergedDeploymentId);
  }

  const mergedOverrides: Record<string, PathOverride> | undefined =
    overrides.length > 0
      ? Object.assign(
          {},
          ...overrides.map(o => (typeof o === 'object' ? o : {}))
        )
      : undefined;

  const framework = await getFramework(
    workPath,
    buildResults,
    detectFrameworkRecord,
    detectFrameworkVersion,
    LocalFileSystemDetector,
    frameworkList
  );

  // Write out the final `config.json` file based on the
  // user configuration and Builder build results
  const config: BuildOutputConfig = {
    version: 3,
    routes: mergedRoutes,
    images: mergedImages,
    wildcard: mergedWildcard,
    overrides: mergedOverrides,
    framework,
    crons: mergedCrons,
    ...(mergedDeploymentId && { deploymentId: mergedDeploymentId }),
  };
  await fs.writeJSON(join(outputDir, 'config.json'), config, { spaces: 2 });

  await writeFlagsJSON(buildResults.values(), outputDir, logger);
}
