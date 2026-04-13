import chalk from 'chalk';
import dotenv from 'dotenv';
import fs, { existsSync } from 'fs-extra';
import minimatch from 'minimatch';
import { dirname, join, normalize, relative, resolve, sep } from 'path';
import semver from 'semver';
import { readdirSync, statSync } from 'fs';

import {
  download,
  FileBlob,
  FileFsRef,
  getDiscontinuedNodeVersions,
  getInstalledPackageVersion,
  getServiceUrlEnvVars,
  normalizePath,
  NowBuildError,
  runNpmInstall,
  runCustomInstallCommand,
  resetCustomInstallCommandSet,
  Span,
  validateNpmrc,
  type Builder,
  type BuildOptions,
  type BuildResultV2,
  type BuildResultV2Typical,
  type BuildResultV3,
  type BuildResultVX,
  type Config,
  type Cron,
  type Files,
  type FlagDefinitions,
  type Meta,
  type PackageJson,
  glob,
  type Service,
  getWorkerTopics,
  isBackendBuilder,
  type Lambda,
  type TriggerEvent,
  downloadFile,
} from '@vercel/build-utils';
import type { VercelConfig } from '@vercel/client';
import { fileNameSymbol } from '@vercel/client';
import { frameworkList, type Framework } from '@vercel/frameworks';
import {
  detectBuilders,
  detectFrameworkRecord,
  detectFrameworkVersion,
  detectInstrumentation,
  getInternalServiceCronPath,
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
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { cleanupCorepack, initCorepack } from '../../util/build/corepack';
import { importBuilders } from '../../util/build/import-builders';
import { setMonorepoDefaultSettings } from '../../util/build/monorepo';
import { scrubArgv } from '../../util/build/scrub-argv';
import { scopeRoutesToServiceOwnership } from '../../util/build/service-route-ownership';
import { sortBuilders } from '../../util/build/sort-builders';
import {
  OUTPUT_DIR,
  writeBuildResult,
  isLambda,
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
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import {
  pickOverrides,
  readProjectSettings,
  type ProjectLinkAndSettings,
} from '../../util/projects/project-settings';
import readJSONFile from '../../util/read-json-file';
import { BuildTelemetryClient } from '../../util/telemetry/commands/build';
import { validateConfig } from '../../util/validate-config';
import ua from '../../util/ua';
import { validateCronSecret } from '../../util/validate-cron-secret';
import {
  compileVercelConfig,
  findSourceVercelConfigFile,
  DEFAULT_VERCEL_CONFIG_FILENAME,
} from '../../util/compile-vercel-config';
import { help } from '../help';
import { pullCommandLogic } from '../pull';
import { pullEnvRecords } from '../../util/env/get-env-records';
import { buildCommand } from './command';
import { validatePackageManifest } from '../../util/validate-package-manifest';

/** Build a plain suggested command with global flags (e.g. --cwd, --non-interactive) appended. */
function buildCommandWithGlobalFlags(
  baseSubcommand: string,
  argv: string[]
): string {
  const globalFlags = getGlobalFlagsOnlyFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${baseSubcommand} ${globalFlags.join(' ')}`
    : baseSubcommand;
  return cli.getCommandNamePlain(full);
}

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

export default async function main(client: Client): Promise<number> {
  const telemetryClient = new BuildTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Create build trace span as a child of the CLI-wide root span
  const rootSpan = client.rootSpan?.child('vc') ?? new Span({ name: 'vc' });

  let { cwd } = client;
  cwd = await resolveProjectCwd(cwd);

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
    telemetryClient.trackCliOptionId(parsedArgs.flags['--id']);
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
  const link = await rootSpan
    .child('vc.getProjectLink')
    .trace(() => getProjectLink(client, cwd));
  const projectRootDirectory = link?.projectRootDirectory ?? '';
  if (link?.repoRoot) {
    cwd = client.cwd = link.repoRoot;
  }

  // TODO: read project settings from the API, fall back to local `project.json` if that fails

  // Read project settings, and pull them from Vercel if necessary
  const vercelDir = join(cwd, projectRootDirectory, VERCEL_DIR);
  let project = await rootSpan
    .child('vc.readProjectSettings')
    .trace(() => readProjectSettings(vercelDir));
  const isTTY = process.stdin.isTTY;
  while (!project?.settings) {
    let confirmed = yes;
    if (!confirmed) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.PROJECT_SETTINGS_REQUIRED,
            message:
              'No project settings found locally. Run pull to retrieve them, or re-run with --yes to pull automatically.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  `pull --yes --environment ${target}`,
                  client.argv
                ),
                when: 'retrieve project settings',
              },
              {
                command: buildCommandWithGlobalFlags(
                  'build --yes',
                  client.argv
                ),
                when: 're-run build after pull',
              },
            ],
          },
          1
        );
        return 1;
      }
      if (!isTTY) {
        output.print(
          `No Project Settings found locally. Run ${cli.getCommandName(
            'pull --yes'
          )} to retrieve them. In non-interactive mode, set VERCEL_TOKEN for authentication.`
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
      if (!client.nonInteractive)
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

  client.traceDiagnosticsPath = join(
    outputDir,
    'diagnostics',
    'cli_traces.json'
  );

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

  const deploymentId = parsedArgs.flags['--id'];

  // When --id is provided, system env vars are fetched from the deployment,
  // so the warning about missing system env vars does not apply.
  if (
    !process.env.VERCEL_BUILD_IMAGE &&
    !deploymentId &&
    !client.nonInteractive
  ) {
    output.warn(
      'Build not running on Vercel. System environment variables will not be available.'
    );
  }
  const envToUnset = new Set<string>(['VERCEL', 'NOW_BUILDER']);

  try {
    const loadEnvSpan = rootSpan.child('vc.loadEnv');
    try {
      if (deploymentId) {
        // Set the team context so API calls include the teamId query param.
        // Without this, the API can't find the deployment.
        if (link?.orgId?.startsWith('team_')) {
          client.config.currentTeam = link.orgId;
        }

        // When --id is provided, fetch env vars from the deployment
        // instead of loading from local .env files.
        output.debug(
          `Fetching environment variables for deployment ${deploymentId}`
        );
        const { buildEnv } = await fetchDeploymentBuildEnv(
          client,
          deploymentId
        );
        for (const [key, value] of Object.entries(buildEnv)) {
          envToUnset.add(key);
          process.env[key] = value;
        }
        output.debug(
          `Loaded ${Object.keys(buildEnv).length} environment variables from deployment ${deploymentId}`
        );
      } else {
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
      }
    } finally {
      loadEnvSpan.stop();
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

    if (client.nonInteractive) {
      const relOutputDir = relative(cwd, outputDir);
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.OK,
            outputDir: outputDir,
            outputDirRelative: relOutputDir.startsWith('..')
              ? outputDir
              : relOutputDir,
            target,
            message: 'Build completed successfully.',
            next: [
              {
                command: buildCommandWithGlobalFlags('deploy', client.argv),
                when: 'Deploy the build output',
              },
            ],
          },
          null,
          2
        )}\n`
      );
    }
    return 0;
  } catch (err: any) {
    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: AGENT_STATUS.ERROR,
            reason: 'build_failed',
            message: err?.message ?? String(err),
            next: [
              {
                command: buildCommandWithGlobalFlags('pull --yes', client.argv),
                when: 'Ensure project settings are present',
              },
              {
                command: buildCommandWithGlobalFlags(
                  'build --yes',
                  client.argv
                ),
                when: 're-run build',
              },
            ],
          },
          null,
          2
        )}\n`
      );
    }
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

    const installDepsSpan = span.child('vc.installDeps');
    try {
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
    } finally {
      installDepsSpan.stop();
    }
    process.env.VERCEL_INSTALL_COMPLETED = '1';
  }

  const compileResult = await span
    .child('vc.compileVercelConfig')
    .trace(() => compileVercelConfig(workPath));

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

  if (process.env.VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING !== '1') {
    const { prepareFlagsDefinitions } = await import(
      '@vercel/prepare-flags-definitions'
    );
    await prepareFlagsDefinitions({
      cwd,
      env: process.env as Record<string, string | undefined>,
      userAgentSuffix: ua,
      output,
    });
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
    builds = builds.flatMap(b => expandBuild(files, b));
  } else {
    // Zero config
    isZeroConfig = true;

    // Detect the Vercel Builders that will need to be invoked
    const detectedBuilders = await span.child('vc.detectBuilders').trace(() =>
      detectBuilders(files, pkg, {
        ...localConfig,
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

  const buildersWithPkgs = await span
    .child('vc.importBuilders')
    .trace(() => importBuilders(builderSpecs, cwd, span));

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
  const packageManifests: Array<{
    workspace: string;
    key: string;
    manifest: Record<string, unknown>;
    service?: Service;
    builderUse: string;
  }> = [];

  const hasDetectedServices =
    detectedServices !== undefined && detectedServices.length > 0;
  const hasWorkerServices =
    hasDetectedServices && detectedServices!.some(s => s.type === 'worker');
  const serviceByBuilder = new Map<Builder, Service>();
  if (hasDetectedServices) {
    for (const service of detectedServices!) {
      serviceByBuilder.set(service.builder, service);
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
        ? serviceByBuilder.get(build)
        : undefined;
      const stripServiceRoutePrefix =
        !!service?.routePrefix && service.routePrefix !== '/';

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
            ...(hasWorkerServices ? { hasWorkerServices: true } : undefined),
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
        'builder.name': builderPkg.name,
        'builder.version': builderPkg.version,
        'builder.dynamicallyInstalled': String(
          builderWithPkg.dynamicallyInstalled
        ),
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
        ...(service
          ? {
              service: {
                name: service.name,
                type: service.type,
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
      let rawBuildResult: BuildResultV2 | BuildResultV3 | BuildResultVX;
      try {
        rawBuildResult = await builderSpan.trace<
          BuildResultV2 | BuildResultV3 | BuildResultVX
        >(async () => builder.build(buildOptions));
        if (builder.version === -1) {
          const vx = rawBuildResult as BuildResultVX;
          buildResult = vx.result;
        } else {
          buildResult = rawBuildResult as BuildResultV2 | BuildResultV3;
        }

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
          if (builderDiagnostics) {
            const prefix =
              service && service.workspace !== '.'
                ? service.workspace + '/' + builderPkg.name + '/'
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
                      service && service.workspace !== '.'
                        ? service.workspace
                        : '.';
                    packageManifests.push({
                      workspace,
                      key: fullKey,
                      manifest: packageManifest,
                      service,
                      builderUse: builderPkg.name,
                    });
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

      if (service?.type === 'worker' && 'output' in buildResult) {
        attachWorkerServiceTrigger(buildResult.output, service);
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
        if (buildOutputConfig instanceof CantParseJSONFile) {
          throw buildOutputConfig;
        }

        if (buildOutputConfig) {
          if (buildOutputConfig.overrides) {
            overrides.push(buildOutputConfig.overrides);
          }
          if (
            hasDetectedServices &&
            service &&
            Array.isArray(buildOutputConfig.routes) &&
            detectedServices
          ) {
            buildOutputConfig.routes = scopeRoutesToServiceOwnership({
              routes: buildOutputConfig.routes as Route[],
              owner: service,
              allServices: detectedServices,
            });
          }
          mergedBuildResult = buildOutputConfig;
        }
      }
      // Store the build result to generate the final `config.json` after
      // all builds have completed
      buildResults.set(build, mergedBuildResult);

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
              buildResult: rawBuildResult,
              build,
              builder,
              builderPkg,
              vercelConfig: localConfig,
              standalone,
              workPath: buildWorkPath,
              service,
              stripServiceRoutePrefix,
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

  // Aggregate individual package-manifest.json files from builders into
  // a single project-manifest.json keyed by service workspace.
  if (packageManifests.length > 0) {
    const projectManifest: Record<string, unknown> = {};
    for (const {
      workspace,
      manifest,
      service,
      builderUse,
    } of packageManifests) {
      projectManifest[`${builderUse}:${workspace}`] = {
        ...manifest,
        workspace,
        builder: builderUse,
        framework: service?.framework,
        serviceName: service?.name,
        serviceType: service?.type,
        routePrefix: service?.routePrefix,
      };
    }
    if (Object.keys(projectManifest).length > 0) {
      const projectManifestBlob = new FileBlob({
        data: JSON.stringify(projectManifest),
      });
      diagnostics['project-manifest.json'] = projectManifestBlob;
      ops.push(
        downloadFile(
          projectManifestBlob,
          join(outputDir, 'diagnostics', 'project-manifest.json')
        ).then(
          () => undefined,
          err => err
        )
      );
    }
  }

  if (corepackShimDir) {
    cleanupCorepack(corepackShimDir);
  }

  const collectSpan = span.child('vc.finalizeBuildOutput');

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
        const service = serviceByBuilder.get(build);
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
  const serviceCrons = getServiceCrons(detectedServices);
  const mergedCrons = mergeCrons(
    [...(localConfig.crons || []), ...serviceCrons],
    buildResults.values()
  );
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
  collectSpan.stop();

  const relOutputDir = relative(cwd, outputDir);
  if (!client.nonInteractive) {
    output.print(
      `${prependEmoji(
        `Build Completed in ${chalk.bold(
          relOutputDir.startsWith('..') ? outputDir : relOutputDir
        )} ${chalk.gray(buildStamp())}`,
        emoji('success')
      )}\n`
    );
  }

  // Analyze .vc-config.json files if environment variable is set
  if (process.env.VERCEL_ANALYZE_BUILD_OUTPUT === '1') {
    await analyzeVcConfigFiles(cwd, outputDir);
  }
}

function getFunctionUrlPath(vcConfigPath: string, outputDir: string): string {
  const funcPath = normalizePath(relative(outputDir, vcConfigPath))
    .replace(/^functions\//, '')
    .replace(/\/\.vc-config\.json$/, '')
    .replace(/\.func$/, ''); // Remove .func suffix

  return (
    '/' +
    funcPath
      .split('/')
      .filter(part => part && part !== 'index')
      .join('/')
  );
}

const LAMBDA_SIZE_LIMIT_MB = 250;

function printFileSizeBreakdown(files: Map<string, number>): void {
  // Group files by package or directory structure
  const dependencies = new Map<string, number>();

  for (const [bundlePath, sizeMB] of files.entries()) {
    // Use first 3 segments to group
    const depKey = bundlePath.split('/').slice(0, 3).join('/');

    dependencies.set(depKey, (dependencies.get(depKey) || 0) + sizeMB);
  }

  // Sort by size and show top 10 largest dependencies
  const sortedDeps = Array.from(dependencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sortedDeps.length > 0) {
    output.print(chalk.yellow('  Large dependencies:\n'));
    for (const [dep, size] of sortedDeps) {
      if (size >= 0.5) {
        // Only show files >= 500KB
        output.print(
          `    ${chalk.gray('•')} ${dep}: ${chalk.bold(size.toFixed(2))} MB\n`
        );
      }
    }
    output.print('\n');
  }
}

async function analyzeVcConfigFiles(
  cwd: string,
  outputDir: string
): Promise<void> {
  // Find all .vc-config.json files using @vercel/build-utils glob
  const filesObject = await glob('**/.vc-config.json', {
    cwd: outputDir,
  });

  // Filter out .rsc.func symlinks to avoid duplicates
  const vcConfigFiles = Object.keys(filesObject)
    .filter(relativePath => !relativePath.includes('.rsc.func'))
    .map(relativePath => join(outputDir, relativePath));

  if (vcConfigFiles.length === 0) {
    output.print('No functions to analyze.\n');
    return;
  }

  output.print(
    `\nAnalyzing ${vcConfigFiles.length} function${vcConfigFiles.length === 1 ? '' : 's'}...\n`
  );

  // Analyze all functions in parallel
  const results = await Promise.all(
    vcConfigFiles.map(file => analyzeSingleFunction(file, cwd, outputDir))
  );

  // Filter out failed analyses
  const validResults = results.filter(
    (r): r is NonNullable<typeof r> => r !== null
  );

  // Separate exceeded and normal functions
  const sortedResults = validResults.sort((a, b) => b.size - a.size);
  const exceededFunctions = sortedResults.filter(
    r => r.size > LAMBDA_SIZE_LIMIT_MB
  );
  const normalFunctions = sortedResults.filter(
    r => r.size <= LAMBDA_SIZE_LIMIT_MB
  );

  // Show warning once if there are exceeded functions
  if (exceededFunctions.length > 0) {
    output.print(
      `${chalk.red.bold(`⚠️  Max serverless function size of ${LAMBDA_SIZE_LIMIT_MB} MB uncompressed reached`)}\n\n`
    );

    // List all affected functions
    for (const result of exceededFunctions) {
      output.print(
        `${chalk.red('Function :')} ${chalk.red.bold(result.path)}\n` +
          `${chalk.red('Size     :')} ${chalk.red.bold(result.size.toFixed(2))} MB\n`
      );

      // Show breakdown of largest files/dependencies
      printFileSizeBreakdown(result.files);
      output.print('\n');
    }

    // Show summary of normal functions
    if (normalFunctions.length > 0) {
      output.print(chalk.cyan(`Other functions:\n`));
      for (const result of normalFunctions) {
        output.print(
          `${chalk.cyan(result.path)}: ${chalk.bold(result.size.toFixed(2))} MB\n`
        );
      }
    }

    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_MAX_LAMBDA_SIZE',
      message: `${exceededFunctions.length} function${exceededFunctions.length === 1 ? '' : 's'} exceeded the uncompressed maximum size of ${LAMBDA_SIZE_LIMIT_MB} MB.`,
      link: 'https://vercel.link/serverless-function-size',
      action: 'Learn More',
    });
  }
}

async function analyzeSingleFunction(
  file: string,
  cwd: string,
  outputDir: string
): Promise<{
  path: string;
  size: number;
  files: Map<string, number>;
} | null> {
  try {
    const content = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(content);
    const funcDir = dirname(file);

    // Size the files that were written into .func (FileBlob, zipBuffer, etc.)
    const funcDirStats = getDirectorySizeInMB(funcDir);

    // Also size FileFsRef entries from filePathMap — these live on disk
    // outside .func so there's no overlap with the directory walk above.
    const filePathMap =
      parsed.filePathMap && typeof parsed.filePathMap === 'object'
        ? Object.entries(parsed.filePathMap)
            .filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
            .map(([bundlePath, sourcePath]) => ({
              bundlePath,
              sourcePath: join(cwd, sourcePath),
            }))
        : [];

    const fsRefStats = getTotalFileSizeInMB(filePathMap);

    const totalSize = funcDirStats.size + fsRefStats.size;
    const allFiles = new Map([...funcDirStats.files, ...fsRefStats.files]);

    const functionUrlPath = getFunctionUrlPath(file, outputDir);

    return {
      path: functionUrlPath,
      size: totalSize,
      files: allFiles,
    };
  } catch (error) {
    output.warn(`Failed to analyze ${file}: ${error}`);
    return null;
  }
}

function getTotalFileSizeInMB(
  files: Array<{ bundlePath: string; sourcePath: string }>
): {
  size: number;
  files: Map<string, number>;
} {
  let size = 0;
  const filesSizeMap = new Map<string, number>();

  for (const { bundlePath, sourcePath } of files) {
    try {
      const stats = statSync(sourcePath);
      if (stats.isFile()) {
        const fileSizeMB = stats.size / (1024 * 1024);
        size += fileSizeMB;
        // Use bundlePath (the key) for the map, not sourcePath
        filesSizeMap.set(bundlePath, fileSizeMB);
      }
    } catch {
      // File doesn't exist or can't be accessed
    }
  }

  return { size, files: filesSizeMap };
}

function getDirectorySizeInMB(dir: string): {
  size: number;
  files: Map<string, number>;
} {
  let size = 0;
  const filesSizeMap = new Map<string, number>();
  try {
    const entries = readdirSync(dir, { recursive: true });
    for (const entry of entries) {
      const entryPath =
        typeof entry === 'string' ? entry : (entry as Buffer).toString();
      const fullPath = join(dir, entryPath);
      try {
        const stats = statSync(fullPath);
        if (stats.isFile()) {
          const fileSizeMB = stats.size / (1024 * 1024);
          size += fileSizeMB;
          filesSizeMap.set(normalizePath(entryPath), fileSizeMB);
        }
      } catch {
        // File doesn't exist or can't be accessed
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return { size, files: filesSizeMap };
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

function getServiceCrons(services?: Service[]): Cron[] {
  if (!services || services.length === 0) {
    return [];
  }

  const crons: Cron[] = [];
  for (const service of services) {
    if (service.type !== 'cron' || typeof service.schedule !== 'string') {
      continue;
    }
    const cronEntrypoint = service.entrypoint || service.builder.src || 'index';
    crons.push({
      path: getInternalServiceCronPath(service.name, cronEntrypoint),
      schedule: service.schedule,
    });
  }

  return crons;
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

function attachWorkerServiceTrigger(
  buildOutput: BuildResultV2Typical['output'] | BuildResultV3['output'],
  service: Service
): void {
  const topics = getWorkerTopics(service);
  const consumer = service.consumer || 'default';

  for (const topic of topics) {
    const trigger: TriggerEvent = {
      type: 'queue/v1beta',
      topic,
      consumer,
    };

    if (isLambda(buildOutput)) {
      appendWorkerTrigger(buildOutput, trigger);
    } else {
      for (const output of Object.values(buildOutput)) {
        if (isLambda(output)) {
          appendWorkerTrigger(output, trigger);
        }
      }
    }
  }
}

function appendWorkerTrigger(lambda: Lambda, trigger: TriggerEvent): void {
  const existingTriggers = Array.isArray(lambda.experimentalTriggers)
    ? lambda.experimentalTriggers
    : [];
  const alreadyConfigured = existingTriggers.some(
    existing =>
      existing.type === trigger.type &&
      existing.topic === trigger.topic &&
      existing.consumer === trigger.consumer
  );
  if (!alreadyConfigured) {
    lambda.experimentalTriggers = [...existingTriggers, trigger];
  }
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

const INTEGRATIONS_POLL_INTERVAL_MS = 5000;
const INTEGRATIONS_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes, matches API timeout

/**
 * Fetches build environment variables for a deployment from the API.
 * If integrations are still provisioning, polls until they complete.
 */
async function fetchDeploymentBuildEnv(
  client: Client,
  deploymentId: string
): Promise<{ env: Record<string, string>; buildEnv: Record<string, string> }> {
  const deadline = Date.now() + INTEGRATIONS_POLL_TIMEOUT_MS;
  let isPolling = false;

  while (Date.now() < deadline) {
    try {
      return await pullEnvRecords(client, deploymentId, 'vercel-cli:pull');
    } catch (err: unknown) {
      // If the API returns integrationsStatus: 'pending', poll until ready
      if (
        err &&
        typeof err === 'object' &&
        'integrationsStatus' in err &&
        (err as { integrationsStatus?: string }).integrationsStatus ===
          'pending'
      ) {
        if (!isPolling) {
          output.spinner(
            'Waiting for deployment integrations to finish provisioning...'
          );
          isPolling = true;
        }
        await new Promise(resolve =>
          setTimeout(resolve, INTEGRATIONS_POLL_INTERVAL_MS)
        );
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    'Timed out waiting for deployment integrations to complete provisioning.'
  );
}
