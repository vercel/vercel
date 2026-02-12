import chalk from 'chalk';
import dotenv from 'dotenv';
import fs, { existsSync } from 'fs-extra';
import minimatch from 'minimatch';
import { join, normalize, relative, resolve, sep } from 'path';
import semver from 'semver';

import {
  download,
  FileFsRef,
  getDiscontinuedNodeVersions,
  getInstalledPackageVersion,
  getServiceUrlEnvVars,
  normalizePath,
  NowBuildError,
  runNpmInstall,
  runCustomInstallCommand,
  resetCustomInstallCommandSet,
  type Reporter,
  Span,
  type TraceEvent,
  validateNpmrc,
  type Builder,
  type BuildOptions,
  type BuildResultV2,
  type BuildResultV2Typical,
  type BuildResultV3,
  type Config,
  type Cron,
  type Files,
  type FlagDefinitions,
  type Meta,
  type PackageJson,
  type Service,
  isBackendBuilder,
  type Lambda,
} from '@vercel/build-utils';
import type { VercelConfig } from '@vercel/client';
import { fileNameSymbol } from '@vercel/client';
import { frameworkList, type Framework } from '@vercel/frameworks';
import {
  detectBuilders,
  detectFrameworkRecord,
  detectFrameworkVersion,
  detectInstrumentation,
  LocalFileSystemDetector,
} from '@vercel/fs-detectors';
import {
  appendRoutesToPhase,
  getTransformedRoutes,
  mergeRoutes,
  sourceToRegex,
  type MergeRoutesProps,
  type Route,
} from '@vercel/routing-utils';

import output from '../../output-manager';
import { cleanupCorepack, initCorepack } from '../../util/build/corepack';
import { importBuilders } from '../../util/build/import-builders';
import { setMonorepoDefaultSettings } from '../../util/build/monorepo';
import { scrubArgv } from '../../util/build/scrub-argv';
import { scopeRoutesToServiceOwnership } from '../../util/build/service-route-ownership';
import { sortBuilders } from '../../util/build/sort-builders';
import {
  OUTPUT_DIR,
  writeBuildResult,
  type PathOverride,
} from '../../util/build/write-build-result';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import { printError, toEnumerableError } from '../../util/error';
import { CantParseJSONFile } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { staticFiles as getFiles } from '../../util/get-files';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import parseTarget from '../../util/parse-target';
import cliPkg from '../../util/pkg';
import * as cli from '../../util/pkg-name';
import { getProjectLink, VERCEL_DIR } from '../../util/projects/link';
import {
  pickOverrides,
  readProjectSettings,
  type ProjectLinkAndSettings,
} from '../../util/projects/project-settings';
import readJSONFile from '../../util/read-json-file';
import { BuildTelemetryClient } from '../../util/telemetry/commands/build';
import { validateConfig } from '../../util/validate-config';
import { validateCronSecret } from '../../util/validate-cron-secret';
import {
  compileVercelConfig,
  findSourceVercelConfigFile,
  DEFAULT_VERCEL_CONFIG_FILENAME,
} from '../../util/compile-vercel-config';
import { help } from '../help';
import { pullCommandLogic } from '../pull';
import { buildCommand } from './command';
import { mkdir, writeFile } from 'fs/promises';

type BuildResult = BuildResultV2 | BuildResultV3;

interface SerializedBuilder extends Builder {
  error?: any;
  require?: string;
  requirePath?: string;
  apiVersion: number;
}

/**
 *  Build Output API `config.json` file interface.
 */
interface BuildOutputConfig {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<string, PathOverride>;
  framework?: {
    version: string;
  };
  crons?: Cron[];
  services?: Service[];
  deploymentId?: string;
}

/**
 * Contents of the `builds.json` file.
 */
export interface BuildsManifest {
  '//': string;
  target: string;
  argv: string[];
  cliVersion?: string;
  error?: any;
  builds?: SerializedBuilder[];
  features?: {
    speedInsightsVersion?: string | undefined;
    webAnalyticsVersion?: string | undefined;
  };
}

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];

  report(event: TraceEvent) {
    this.events.push(event);
  }
}

export default async function main(client: Client): Promise<number> {
  const telemetryClient = new BuildTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Setup tracer to output into the build directory
  const reporter = new InMemoryReporter();
  const rootSpan = new Span({ name: 'vc', reporter });

  let { cwd } = client;

  // Ensure that `vc build` is not being invoked recursively
  if (process.env.__VERCEL_BUILD_RUNNING) {
    output.error(
      `${cmd(
        `${cli.packageName} build`
      )} must not recursively invoke itself. Check the Build Command in the Project Settings or the ${cmd(
        'build'
      )} script in ${cmd('package.json')}`
    );
    output.error(
      `Learn More: https://vercel.link/recursive-invocation-of-commands`
    );
    return 1;
  } else {
    process.env.__VERCEL_BUILD_RUNNING = '1';
  }

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(buildCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
    telemetryClient.trackCliOptionOutput(parsedArgs.flags['--output']);
    telemetryClient.trackCliOptionTarget(parsedArgs.flags['--target']);
    telemetryClient.trackCliFlagProd(parsedArgs.flags['--prod']);
    telemetryClient.trackCliFlagYes(parsedArgs.flags['--yes']);
    telemetryClient.trackCliFlagStandalone(parsedArgs.flags['--standalone']);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('build');
    output.print(help(buildCommand, { columns: client.stderr.columns }));
    return 2;
  }

  // Build `target` influences which environment variables will be used
  const target =
    parseTarget({
      flagName: 'target',
      flags: parsedArgs.flags,
    }) || 'preview';

  const yes = Boolean(parsedArgs.flags['--yes']);

  // Check for deprecated env var
  const hasDeprecatedEnvVar =
    process.env.VERCEL_EXPERIMENTAL_STANDALONE_BUILD === '1';
  if (hasDeprecatedEnvVar) {
    output.warn(
      'The VERCEL_EXPERIMENTAL_STANDALONE_BUILD environment variable is deprecated. Please use the --standalone flag instead.'
    );
  }

  // Use flag first, fall back to deprecated env var
  const standalone = Boolean(
    parsedArgs.flags['--standalone'] || hasDeprecatedEnvVar
  );

  try {
    await validateNpmrc(cwd);
  } catch (err) {
    output.prettyError(err);
    return 1;
  }

  // If repo linked, update `cwd` to the repo root
  const link = await getProjectLink(client, cwd);
  const projectRootDirectory = link?.projectRootDirectory ?? '';
  if (link?.repoRoot) {
    cwd = client.cwd = link.repoRoot;
  }

  // TODO: read project settings from the API, fall back to local `project.json` if that fails

  // Read project settings, and pull them from Vercel if necessary
  const vercelDir = join(cwd, projectRootDirectory, VERCEL_DIR);
  let project = await readProjectSettings(vercelDir);
  const isTTY = process.stdin.isTTY;
  while (!project?.settings) {
    let confirmed = yes;
    if (!confirmed) {
      if (!isTTY) {
        output.print(
          `No Project Settings found locally. Run ${cli.getCommandName(
            'pull --yes'
          )} to retrieve them.`
        );
        return 1;
      }

      confirmed = await client.input.confirm(
        `No Project Settings found locally. Run ${cli.getCommandName(
          'pull'
        )} for retrieving them?`,
        true
      );
    }
    if (!confirmed) {
      output.print(`Canceled. No Project Settings retrieved.\n`);
      return 0;
    }
    const { argv: originalArgv } = client;
    client.cwd = join(cwd, projectRootDirectory);
    client.argv = [
      ...originalArgv.slice(0, 2),
      'pull',
      `--environment`,
      target,
    ];
    const result = await pullCommandLogic(
      client,
      client.cwd,
      Boolean(parsedArgs.flags['--yes']),
      target,
      parsedArgs.flags
    );
    if (result !== 0) {
      return result;
    }
    client.cwd = cwd;
    client.argv = originalArgv;
    project = await readProjectSettings(vercelDir);
  }

  // Delete output directory from potential previous build
  const defaultOutputDir = join(cwd, projectRootDirectory, OUTPUT_DIR);
  const outputDir = parsedArgs.flags['--output']
    ? resolve(parsedArgs.flags['--output'])
    : defaultOutputDir;

  await Promise.all([
    fs.remove(outputDir),
    // Also delete `.vercel/output`, in case the script is targeting Build Output API directly
    outputDir !== defaultOutputDir ? fs.remove(defaultOutputDir) : undefined,
  ]);

  const buildsJson: BuildsManifest = {
    '//': 'This file was generated by the `vercel build` command. It is not part of the Build Output API.',
    target,
    argv: scrubArgv(process.argv),
    cliVersion: cliPkg.version,
  };

  if (!process.env.VERCEL_BUILD_IMAGE) {
    output.warn(
      'Build not running on Vercel. System environment variables will not be available.'
    );
  }

  const envToUnset = new Set<string>(['VERCEL', 'NOW_BUILDER']);

  try {
    const envPath = join(
      cwd,
      projectRootDirectory,
      VERCEL_DIR,
      `.env.${target}.local`
    );
    // TODO (maybe?): load env vars from the API, fall back to the local file if that fails
    const dotenvResult = dotenv.config({
      path: envPath,
      debug: output.isDebugEnabled(),
    });
    if (dotenvResult.error) {
      output.debug(
        `Failed loading environment variables: ${dotenvResult.error}`
      );
    } else if (dotenvResult.parsed) {
      for (const key of Object.keys(dotenvResult.parsed)) {
        envToUnset.add(key);
      }
      output.debug(`Loaded environment variables from "${envPath}"`);
    }

    // For legacy Speed Insights
    if (project.settings.analyticsId) {
      // we pass the env down to the builder
      // inside the builder we decide if we want to keep it or not

      envToUnset.add('VERCEL_ANALYTICS_ID');
      process.env.VERCEL_ANALYTICS_ID = project.settings.analyticsId;
    }

    // Some build processes use these env vars to platform detect Vercel
    process.env.VERCEL = '1';
    process.env.NOW_BUILDER = '1';

    try {
      await rootSpan
        .child('vc.doBuild')
        .trace(span =>
          doBuild(client, project, buildsJson, cwd, outputDir, span, standalone)
        );
    } finally {
      await rootSpan.stop();
    }

    return 0;
  } catch (err: any) {
    output.prettyError(err);

    // Write error to `builds.json` file
    buildsJson.error = toEnumerableError(err);
    const buildsJsonPath = join(outputDir, 'builds.json');
    const configJsonPath = join(outputDir, 'config.json');
    await fs.outputJSON(buildsJsonPath, buildsJson, {
      spaces: 2,
    });
    await fs.writeJSON(configJsonPath, { version: 3 }, { spaces: 2 });

    return 1;
  } finally {
    try {
      const diagnosticsOutputPath = join(outputDir, 'diagnostics');
      await mkdir(diagnosticsOutputPath, { recursive: true });
      // Ensure that all traces have flushed to disk before we exit
      await writeFile(
        join(diagnosticsOutputPath, 'cli_traces.json'),
        JSON.stringify(reporter.events)
      );
    } catch (err) {
      output.error('Failed to write diagnostics trace file');
      output.prettyError(err);
    }

    // Unset environment variables that were added by dotenv
    // (this is mostly for the unit tests)
    for (const key of envToUnset) {
      delete process.env[key];
    }

    // Clean up VERCEL_INSTALL_COMPLETED to allow subsequent builds in the same process
    delete process.env.VERCEL_INSTALL_COMPLETED;

    // Reset customInstallCommandSet to allow subsequent builds in the same process
    resetCustomInstallCommandSet();
  }
}

/**
 * Execute the Project's builders. If this function throws an error,
 * then it will be serialized into the `builds.json` manifest file.
 */
async function doBuild(
  client: Client,
  project: ProjectLinkAndSettings,
  buildsJson: BuildsManifest,
  cwd: string,
  outputDir: string,
  span: Span,
  standalone: boolean = false
): Promise<void> {
  const { localConfigPath } = client;

  // Regex pattern for validating deploymentId characters: alphanumeric, hyphen, underscore
  const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

  const workPath = join(cwd, project.settings.rootDirectory || '.');

  const sourceConfigFile = await findSourceVercelConfigFile(workPath);
  let corepackShimDir: string | null | undefined;
  if (sourceConfigFile) {
    corepackShimDir = await initCorepack({ repoRootPath: cwd });

    const installCommand = project.settings.installCommand;
    if (typeof installCommand === 'string') {
      if (installCommand.trim()) {
        output.log(`Running install command before config compilation...`);
        await runCustomInstallCommand({
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
      await runNpmInstall(
        workPath,
        [],
        { env: process.env },
        undefined,
        project.settings.createdAt
      );
    }
    process.env.VERCEL_INSTALL_COMPLETED = '1';
  }

  const compileResult = await compileVercelConfig(workPath);

  const vercelConfigPath =
    localConfigPath ||
    compileResult.configPath ||
    join(workPath, 'vercel.json');

  const [pkg, vercelConfig, nowConfig, hasInstrumentation] = await Promise.all([
    readJSONFile<PackageJson>(join(workPath, 'package.json')),
    readJSONFile<VercelConfig>(vercelConfigPath),
    readJSONFile<VercelConfig>(join(workPath, 'now.json')),
    detectInstrumentation(new LocalFileSystemDetector(workPath)),
  ]);

  if (pkg instanceof CantParseJSONFile) throw pkg;
  if (vercelConfig instanceof CantParseJSONFile) throw vercelConfig;
  if (nowConfig instanceof CantParseJSONFile) throw nowConfig;

  if (hasInstrumentation) {
    output.debug(
      'OpenTelemetry instrumentation detected. Automatic fetch instrumentation will be disabled.'
    );
    process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION = '1';
  }

  if (vercelConfig) {
    vercelConfig[fileNameSymbol] = compileResult.wasCompiled
      ? compileResult.sourceFile || DEFAULT_VERCEL_CONFIG_FILENAME
      : 'vercel.json';
  } else if (nowConfig) {
    nowConfig[fileNameSymbol] = 'now.json';
  }

  const localConfig = vercelConfig || nowConfig || {};
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

  if (
    process.env.VERCEL_BUILD_MONOREPO_SUPPORT === '1' &&
    pkg?.scripts?.['vercel-build'] === undefined &&
    projectSettings.rootDirectory !== null &&
    projectSettings.rootDirectory !== '.'
  ) {
    await setMonorepoDefaultSettings(cwd, workPath, projectSettings);
  }

  if (process.env.VERCEL_EXPERIMENTAL_EMBED_FLAG_DEFINITIONS === '1') {
    const { emitFlagsDefinitions } = await import('./emit-flags-definitions');
    await emitFlagsDefinitions(cwd, process.env);
  }

  // Get a list of source files
  const files = (await getFiles(workPath, {})).map(f =>
    normalizePath(relative(workPath, f))
  );

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
  let detectedServices: Service[] | undefined;
  let isZeroConfig = false;

  if (builds.length > 0) {
    output.warn(
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
      output.warn(w.message, null, w.link, w.action || 'Learn More');
    }

    if (detectedBuilders.builders) {
      builds = detectedBuilders.builders;
    } else {
      builds = [{ src: '**', use: '@vercel/static' }];
    }

    // Capture detected services for the config.json
    detectedServices = detectedBuilders.services;

    // Inject service URL environment variables so they're available during builds.
    // for frontend frameworks like Vite (VITE_) or Next.js (NEXT_PUBLIC_) where
    // these env vars are baked into the client bundle so they can be accessed in the client code.
    // User-defined env vars take precedence and won't be overwritten.
    if (detectedServices && detectedServices.length > 0) {
      const serviceUrlEnvVars = getServiceUrlEnvVars({
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

    zeroConfigRoutes.push(...(detectedBuilders.redirectRoutes || []));
    zeroConfigRoutes.push(
      ...appendRoutesToPhase({
        routes: [],
        newRoutes: detectedBuilders.rewriteRoutes,
        phase: 'filesystem',
      })
    );
    zeroConfigRoutes = appendRoutesToPhase({
      routes: zeroConfigRoutes,
      newRoutes: detectedBuilders.errorRoutes,
      phase: 'error',
    });
    zeroConfigRoutes.push(...(detectedBuilders.defaultRoutes || []));
  }

  const builderSpecs = new Set(builds.map(b => b.use));

  const buildersWithPkgs = await importBuilders(builderSpecs, cwd);

  // Populate Files -> FileFsRef mapping
  const filesMap: Files = {};
  for (const path of files) {
    const fsPath = join(workPath, path);
    const { mode } = await fs.stat(fsPath);
    filesMap[path] = new FileFsRef({ mode, fsPath });
  }

  const buildStamp = stamp();

  // Create fresh new output directory
  await fs.mkdirp(outputDir);

  const ops: Promise<Error | void>[] = [];

  // Write the `detectedBuilders` result to output dir
  const buildsJsonBuilds = new Map<Builder, SerializedBuilder>(
    builds.map(build => {
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
    cliVersion: cliPkg.version,
  };

  // Execute Builders for detected entrypoints
  // TODO: parallelize builds (except for frontend)
  const sortedBuilders = sortBuilders(builds);
  const buildResults: Map<Builder, BuildResult | BuildOutputConfig> = new Map();
  const overrides: PathOverride[] = [];
  const repoRootPath = cwd;
  // Only initialize corepack if not already done during early install
  if (!corepackShimDir) {
    corepackShimDir = await initCorepack({ repoRootPath });
  }
  const diagnostics: Files = {};

  const hasDetectedServices =
    detectedServices !== undefined && detectedServices.length > 0;
  const servicesByBuilderSrc = new Map<string, Service>();
  if (hasDetectedServices) {
    for (const service of detectedServices!) {
      if (service.builder.src) {
        const existing = servicesByBuilderSrc.get(service.builder.src);
        if (existing) {
          throw new NowBuildError({
            code: 'DUPLICATE_SERVICE_BUILDER_SRC',
            message: `Services "${existing.name}" and "${service.name}" both have the same builder source "${service.builder.src}". Each service must have a unique builder source.`,
          });
        }
        servicesByBuilderSrc.set(service.builder.src, service);
      }
    }
  }

  for (const build of sortedBuilders) {
    if (typeof build.src !== 'string') continue;

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
      const service = hasDetectedServices
        ? servicesByBuilderSrc.get(build.src)
        : undefined;

      let buildWorkPath = workPath;
      let buildEntrypoint = build.src;
      let buildFiles: Files = filesMap;

      if (service && service.workspace !== '.') {
        const wsPrefix = service.workspace + '/';
        buildWorkPath = join(workPath, service.workspace);

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
        if (typeof value === 'string') {
          process.env[envKey] = value;
          output.debug(`Setting env ${envKey} to "${value}"`);
        } else {
          delete process.env[envKey];
        }
      }

      const isFrontendBuilder = build.config && 'framework' in build.config;
      // For services builds, the builder framework is set by the service resolver,
      // the project-level framework is 'services'.
      const builderFramework =
        build.config?.framework ?? projectSettings.framework;

      let buildConfig: Config;

      if (isZeroConfig) {
        if (service) {
          // Services build: use service-specific config from resolution.
          // build.config already contains framework, routePrefix, memory, etc.
          buildConfig = {
            ...build.config,
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
            framework: projectSettings.framework,
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
        name: builderPkg.name,
      });

      const serviceRoutePrefix = build.config?.routePrefix;
      const serviceWorkspace = build.config?.workspace;
      const buildOptions: BuildOptions = {
        files: buildFiles,
        entrypoint: buildEntrypoint,
        workPath: buildWorkPath,
        repoRootPath,
        config: buildConfig,
        meta,
        span: builderSpan,
        ...(typeof serviceRoutePrefix === 'string' ||
        typeof serviceWorkspace === 'string'
          ? {
              service: {
                routePrefix:
                  typeof serviceRoutePrefix === 'string'
                    ? serviceRoutePrefix
                    : undefined,
                workspace:
                  typeof serviceWorkspace === 'string'
                    ? serviceWorkspace
                    : undefined,
              },
            }
          : undefined),
      };
      output.debug(
        `Building entrypoint "${build.src}" with "${builderPkg.name}"`
      );
      let buildResult: BuildResultV2 | BuildResultV3;
      try {
        buildResult = await builderSpan.trace<BuildResultV2 | BuildResultV3>(
          async () => builder.build(buildOptions)
        );

        // If the build result has no routes and the framework has default routes,
        // then add the default routes to the build result
        if (
          !hasDetectedServices &&
          buildConfig.zeroConfig &&
          isFrontendBuilder &&
          'output' in buildResult &&
          !buildResult.routes
        ) {
          const framework = frameworkList.find(
            f => f.slug === buildConfig.framework
          );
          if (framework) {
            const defaultRoutes = await getFrameworkRoutes(
              framework,
              buildWorkPath
            );
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
                (buildResult as BuildResultV2Typical).output = convertedOutputs;
              }
            }
          } catch (error) {
            output.error(`Failed to read routes.json: ${error}`);
          }
        }
      }

      if (
        hasDetectedServices &&
        service &&
        'routes' in buildResult &&
        Array.isArray(buildResult.routes) &&
        detectedServices
      ) {
        buildResult.routes = scopeRoutesToServiceOwnership({
          routes: buildResult.routes as Route[],
          owner: service,
          allServices: detectedServices,
        });
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
              workPath: buildWorkPath,
              service,
            })
          )
          .then(
            (override: Record<string, PathOverride> | undefined | void) => {
              if (override) overrides.push(override);
            },
            (err: Error) => err
          )
      );
    } catch (err: any) {
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
  }

  if (corepackShimDir) {
    cleanupCorepack(corepackShimDir);
  }

  // Wait for filesystem operations to complete
  // TODO render progress bar?
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

  // Merge existing `config.json` file into the one that will be produced
  const configPath = join(outputDir, 'config.json');
  const existingConfig = await readJSONFile<BuildOutputConfig>(configPath);
  if (existingConfig instanceof CantParseJSONFile) {
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

    if (existingConfig.overrides) {
      overrides.push(existingConfig.overrides);
    }
    // Find the `Build` entry for this config file and update the build result
    for (const [build, buildResult] of buildResults.entries()) {
      if ('buildOutputPath' in buildResult) {
        output.debug(`Using "config.json" for "${build.use}`);
        buildResults.set(build, existingConfig);
        break;
      }
    }
  }

  const builderRoutes: MergeRoutesProps['builds'] = Array.from(
    buildResults.entries()
  )
    .filter(b => 'routes' in b[1] && Array.isArray(b[1].routes))
    .map(b => {
      const build = b[0];
      const buildResult = b[1] as BuildResultV2Typical;
      let entrypoint = build.src!;

      if (hasDetectedServices && typeof build.src === 'string') {
        const service = servicesByBuilderSrc.get(build.src);
        if (
          service &&
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
  const mergedRoutes = mergeRoutes({
    userRoutes: routesResult.routes,
    builds: builderRoutes,
  });

  const mergedImages = mergeImages(localConfig.images, buildResults.values());
  const mergedCrons = mergeCrons(localConfig.crons, buildResults.values());
  const mergedWildcard = mergeWildcard(buildResults.values());
  const mergedDeploymentId = await mergeDeploymentId(
    existingConfig?.deploymentId,
    buildResults.values(),
    workPath
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

  const mergedOverrides: Record<string, PathOverride> =
    overrides.length > 0 ? Object.assign({}, ...overrides) : undefined;

  const framework = await getFramework(workPath, buildResults);

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
    ...(detectedServices &&
      detectedServices.length > 0 && { services: detectedServices }),
    ...(mergedDeploymentId && { deploymentId: mergedDeploymentId }),
  };
  await fs.writeJSON(join(outputDir, 'config.json'), config, { spaces: 2 });

  await writeFlagsJSON(buildResults.values(), outputDir);

  const relOutputDir = relative(cwd, outputDir);
  output.print(
    `${prependEmoji(
      `Build Completed in ${chalk.bold(
        relOutputDir.startsWith('..') ? outputDir : relOutputDir
      )} ${chalk.gray(buildStamp())}`,
      emoji('success')
    )}\n`
  );
}

async function getFramework(
  cwd: string,
  buildResults: Map<Builder, BuildResult | BuildOutputConfig>
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

async function mergeDeploymentId(
  existingDeploymentId: string | undefined,
  buildResults: Iterable<BuildResult | BuildOutputConfig>,
  workPath: string
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
      if (routesManifest && !(routesManifest instanceof CantParseJSONFile)) {
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
  outputDir: string
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

async function writeBuildJson(buildsJson: BuildsManifest, outputDir: string) {
  await fs.writeJSON(join(outputDir, 'builds.json'), buildsJson, { spaces: 2 });
}

async function getFrameworkRoutes(
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
  service: Service,
  buildSrc: string
): string {
  const routePrefix =
    typeof service.routePrefix === 'string' ? service.routePrefix : '/';
  const normalized = normalizeServiceRoutePrefix(routePrefix);
  const sortKey = String(10000 - normalized.length).padStart(5, '0');
  return `svc:${sortKey}:${normalized}:${service.name}:${buildSrc}`;
}
