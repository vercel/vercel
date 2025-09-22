import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import minimatch from 'minimatch';
import { join, normalize, relative, resolve, sep } from 'path';
import semver from 'semver';

import {
  download,
  FileFsRef,
  getDiscontinuedNodeVersions,
  getInstalledPackageVersion,
  normalizePath,
  NowBuildError,
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
  type MergeRoutesProps,
  type Route,
} from '@vercel/routing-utils';

import output from '../../output-manager';
import { cleanupCorepack, initCorepack } from '../../util/build/corepack';
import { importBuilders } from '../../util/build/import-builders';
import { setMonorepoDefaultSettings } from '../../util/build/monorepo';
import { scrubArgv } from '../../util/build/scrub-argv';
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
    // telemetryClient.trackCliFlagStandalone(
    //   (parsedArgs.flags as any)['--experimentalStandalone']
    // );
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
  // FIXME: standalone:replace env var with flag
  // const standalone = Boolean(
  //   (parsedArgs.flags as any)['--experimentalStandalone']
  // );
  const standalone = process.env.VERCEL_EXPERIMENTAL_STANDALONE_BUILD === '1';

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

  const workPath = join(cwd, project.settings.rootDirectory || '.');

  const [pkg, vercelConfig, nowConfig, hasInstrumentation] = await Promise.all([
    readJSONFile<PackageJson>(join(workPath, 'package.json')),
    readJSONFile<VercelConfig>(
      localConfigPath || join(workPath, 'vercel.json')
    ),
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
    vercelConfig[fileNameSymbol] = 'vercel.json';
  } else if (nowConfig) {
    nowConfig[fileNameSymbol] = 'now.json';
  }

  const localConfig = vercelConfig || nowConfig || {};
  const validateError = validateConfig(localConfig);

  if (validateError) {
    throw validateError;
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
  const corepackShimDir = await initCorepack({ repoRootPath });
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
        const value = projectSettings[key];
        if (typeof value === 'string') {
          const envKey =
            `VERCEL_PROJECT_SETTINGS_` +
            key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
          process.env[envKey] = value;
          output.debug(`Setting env ${envKey} to "${value}"`);
        }
      }

      const isFrontendBuilder = build.config && 'framework' in build.config;
      const buildConfig: Config = isZeroConfig
        ? {
            outputDirectory: projectSettings.outputDirectory ?? undefined,
            ...build.config,
            projectSettings,
            installCommand: projectSettings.installCommand ?? undefined,
            devCommand: projectSettings.devCommand ?? undefined,
            buildCommand: projectSettings.buildCommand ?? undefined,
            framework: projectSettings.framework,
            nodeVersion: projectSettings.nodeVersion,
          }
        : build.config || {};

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
      output.debug(
        `Building entrypoint "${build.src}" with "${builderPkg.name}"`
      );
      let buildResult: BuildResultV2 | BuildResultV3;
      try {
        buildResult = await builderSpan.trace<BuildResultV2 | BuildResultV3>(
          () => {
            if (
              process.env.VERCEL_EXPERIMENTAL_EXPRESS_BUILD === '1' &&
              'name' in builder &&
              builder.name === 'express' &&
              'experimentalBuild' in builder &&
              typeof builder.experimentalBuild === 'function'
            ) {
              return builder.experimentalBuild(buildOptions);
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
            writeBuildResult(
              repoRootPath,
              outputDir,
              buildResult,
              build,
              builder,
              builderPkg,
              localConfig,
              standalone
            )
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
    userRoutes: routesResult.routes,
    builds: builderRoutes,
  });

  const mergedImages = mergeImages(localConfig.images, buildResults.values());
  const mergedCrons = mergeCrons(localConfig.crons, buildResults.values());
  const mergedWildcard = mergeWildcard(buildResults.values());
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
