import chalk from 'chalk';
import dotenv from 'dotenv';
import fs, { existsSync } from 'fs-extra';
import { join, relative, resolve } from 'path';
import * as experimentalBackends from '@vercel/backends';

import {
  normalizePath,
  NowBuildError,
  runNpmInstall,
  runCustomInstallCommand,
  resetCustomInstallCommandSet,
  type Reporter,
  Span,
  type TraceEvent,
  validateNpmrc,
  type PackageJson,
  runBuild,
  prepareBuild,
  type BuildsManifest,
  type BuildLogger,
  type BuilderWithPkg,
  type VercelConfig as BuildUtilsVercelConfig,
  type RunBuildOptions,
  type PrepareBuildOptions,
} from '@vercel/build-utils';
import type { VercelConfig } from '@vercel/client';
import { fileNameSymbol } from '@vercel/client';
import { frameworkList } from '@vercel/frameworks';
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

// Re-export BuildsManifest for other modules that import from this file
export type { BuildsManifest } from '@vercel/build-utils';

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];

  report(event: TraceEvent) {
    this.events.push(event);
  }
}

/**
 * Create a BuildLogger that wraps the CLI output manager
 */
function createBuildLogger(): BuildLogger {
  return {
    log: (message: string) => output.log(message),
    warn: (message: string) => output.warn(message),
    error: (message: string) => output.error(message),
    debug: (message: string) => output.debug(message),
  };
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

  if (localConfig.customErrorPage) {
    const errorPages =
      typeof localConfig.customErrorPage === 'string'
        ? [localConfig.customErrorPage]
        : Object.values(localConfig.customErrorPage);

    for (const page of errorPages) {
      if (page) {
        const src = join(workPath, page);
        if (!existsSync(src)) {
          throw new NowBuildError({
            code: 'CUSTOM_ERROR_PAGE_NOT_FOUND',
            message: `The custom error page "${page}" was not found in "${workPath}".`,
            link: 'https://vercel.com/docs/projects/project-configuration#custom-error-page',
          });
        }
      }
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

  // Get a list of source files
  const files = (await getFiles(workPath, {})).map(f =>
    normalizePath(relative(workPath, f))
  );

  const routesResult = getTransformedRoutes(localConfig);
  if (routesResult.error) {
    throw routesResult.error;
  }

  // Create the build logger
  const logger = createBuildLogger();

  // Prepare the build configuration (detect builders, routes, etc.)
  const prepareBuildOptions: PrepareBuildOptions = {
    files,
    pkg: pkg || null,
    localConfig: localConfig as BuildUtilsVercelConfig,
    projectSettings: projectSettings as PrepareBuildOptions['projectSettings'],
    workPath,
    logger,
    detectBuilders: detectBuilders as PrepareBuildOptions['detectBuilders'],
    appendRoutesToPhase:
      appendRoutesToPhase as PrepareBuildOptions['appendRoutesToPhase'],
  };

  const { builds, zeroConfigRoutes, isZeroConfig } =
    await prepareBuild(prepareBuildOptions);

  const builderSpecs = new Set(builds.map(b => b.use));

  const buildersWithPkgs = await importBuilders(builderSpecs, cwd);

  const buildStamp = stamp();

  // Only initialize corepack if not already done during early install
  if (!corepackShimDir) {
    corepackShimDir = await initCorepack({ repoRootPath: cwd });
  }

  // Sort builders for execution order
  const sortedBuilders = sortBuilders(builds);

  // Call the core build function from build-utils
  await runBuild({
    cwd,
    workPath,
    outputDir,
    target: buildsJson.target,
    projectSettings: projectSettings as RunBuildOptions['projectSettings'],
    localConfig: localConfig as BuildUtilsVercelConfig,
    pkg: pkg || null,
    files,
    buildsJson,
    buildersWithPkgs: buildersWithPkgs as Map<string, BuilderWithPkg>,
    sortedBuilders,
    isZeroConfig,
    zeroConfigRoutes: zeroConfigRoutes as RunBuildOptions['zeroConfigRoutes'],
    userRoutes: routesResult.routes ?? undefined,
    cliVersion: cliPkg.version,
    standalone,
    logger,
    span,
    frameworkList: frameworkList as unknown as RunBuildOptions['frameworkList'],
    writeBuildResult: writeBuildResult as RunBuildOptions['writeBuildResult'],
    mergeRoutes: mergeRoutes as unknown as RunBuildOptions['mergeRoutes'],
    sourceToRegex: sourceToRegex as unknown as RunBuildOptions['sourceToRegex'],
    detectFrameworkRecord:
      detectFrameworkRecord as unknown as RunBuildOptions['detectFrameworkRecord'],
    detectFrameworkVersion:
      detectFrameworkVersion as unknown as RunBuildOptions['detectFrameworkVersion'],
    LocalFileSystemDetector:
      LocalFileSystemDetector as unknown as RunBuildOptions['LocalFileSystemDetector'],
    experimentalBackendsBuilder: experimentalBackends,
  });

  if (corepackShimDir) {
    cleanupCorepack(corepackShimDir);
  }

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
