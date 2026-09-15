import chalk from 'chalk';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import { dirname, join, relative, resolve } from 'path';
import { readdirSync, statSync } from 'fs';

import {
  normalizePath,
  NowBuildError,
  resetCustomInstallCommandSet,
  Span,
  validateNpmrc,
  glob,
} from '@vercel/build-utils';

import output from '../../output-manager';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import {
  formatResolvedBuilders,
  importBuilders,
} from '../../builders/import-builders';
import {
  doBuild,
  type BuildsManifest,
  type CreateBuildRunnerOptions,
} from '@vercel-internals/cli-builder-integration';
import {
  canBuildInSubprocess,
  SubprocessBuildRunner,
} from '../../util/build/builder-process';
import { scrubArgv } from '../../util/build/scrub-argv';
import {
  OUTPUT_DIR,
  writeBuildResult,
} from '../../builders/write-build-result';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import { printError, toEnumerableError } from '../../util/error';
import { CantParseJSONFile } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import cmd from '../../util/output/cmd';
import stamp from '../../util/output/stamp';
import parseTarget from '../../util/parse-target';
import cliPkg from '../../util/pkg';
import * as cli from '../../util/pkg-name';
import {
  getLinkedProject,
  getProjectLink,
  VERCEL_DIR,
} from '../../util/projects/link';
import { printProjectNotFoundError } from '../../util/projects/project-not-found-error';
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import { detectExplicitScope } from '../../util/get-scope';
import { readProjectSettings } from '../../util/projects/project-settings';
import readJSONFile from '../../util/read-json-file';
import { BuildTelemetryClient } from '../../util/telemetry/commands/build';
import { validateConfig } from '../../util/validate-config';
import ua from '../../util/ua';
import {
  compileVercelConfig,
  findSourceVercelConfigFile,
  DEFAULT_VERCEL_CONFIG_FILENAME,
} from '../../util/compile-vercel-config';
import { help } from '../help';
import { ensureLink } from '../../util/link/ensure-link';
import { pullCommandLogic } from '../pull';
import { pullEnvRecords } from '../../util/env/get-env-records';
import { buildCommand } from './command';
import { resolvePerDirectoryLinkRoot } from '../../util/build/repo-root';
export type { BuildsManifest } from '@vercel-internals/cli-builder-integration';

/**
 * Pick how a single builder is invoked. Eligible builds run in a forked worker so their output
 * (including subprocesses they spawn) can be captured and prefixed per line, and so builds are
 * isolated. Everything else — see `canBuildInSubprocess` — stays in-process, which `doBuild`
 * falls back to when this returns `undefined`.
 */
function createBuildRunner({
  ctx,
  hasDetectedServices,
  builderPath,
}: CreateBuildRunnerOptions) {
  return canBuildInSubprocess({
    hasDetectedServices,
    builderPath,
  })
    ? new SubprocessBuildRunner(ctx)
    : undefined;
}

/** Build a plain suggested command with global flags (e.g. --cwd, --non-interactive) appended. */
function buildCommandWithGlobalFlags(
  baseSubcommand: string,
  argv: string[]
): string {
  const globalFlags = getGlobalFlagsFromArgs(argv.slice(2));
  const full = globalFlags.length
    ? `${baseSubcommand} ${globalFlags.join(' ')}`
    : baseSubcommand;
  return cli.getCommandNamePlain(full);
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
    telemetryClient.trackCliOptionProject(parsedArgs.flags['--project']);
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

  const projectNameOrId = parsedArgs.flags['--project'];
  const hasExplicitScope =
    Boolean(projectNameOrId) && detectExplicitScope(client);

  // If repo linked, update `cwd` to the repo root
  let link = hasExplicitScope
    ? null
    : await rootSpan
        .child('vc.getProjectLink')
        .trace(() => getProjectLink(client, cwd, projectNameOrId, true));

  // No local link matched `--project`; resolve via API before the
  // settings-pull prompt would silently re-link to the wrong project.
  if (projectNameOrId && !link) {
    const linkedFromApi = await getLinkedProject(client, {
      cwd,
      projectName: projectNameOrId,
      projectNameIsExplicit: true,
      scopeIsExplicit: hasExplicitScope,
    });
    if (linkedFromApi.status === 'linked') {
      link = {
        projectId: linkedFromApi.project.id,
        orgId: linkedFromApi.org.id,
        repoRoot: linkedFromApi.repoRoot,
        projectRootDirectory: linkedFromApi.projectRootDirectory,
      };
    } else if (linkedFromApi.status === 'error') {
      return linkedFromApi.exitCode;
    } else {
      await printProjectNotFoundError(
        client,
        projectNameOrId,
        'build',
        linkedFromApi.orgId
      );
      return 1;
    }
  }

  // `cwd` before any repo-root re-anchoring below.
  const invokedCwd = cwd;
  const hasRepoLevelLink = Boolean(link?.repoRoot);
  let projectRootDirectory = link?.projectRootDirectory ?? '';
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

      // An unlinked directory gets the link flow first, so the pull
      // question refers to a known project instead of linking as a side
      // effect of the pull.
      if (!link) {
        const ensured = await ensureLink('build', client, cwd, {
          projectName: projectNameOrId,
          failIfNotFound: !!projectNameOrId,
          pullEnv: false,
        });
        if (typeof ensured === 'number') {
          return ensured;
        }
        link = await getProjectLink(client, cwd, projectNameOrId, true);
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
    client.setArgv([
      ...originalArgv.slice(0, 2),
      'pull',
      `--environment`,
      target,
    ]);
    const result = await pullCommandLogic(
      client,
      client.cwd,
      Boolean(parsedArgs.flags['--yes']),
      target,
      parsedArgs.flags,
      projectNameOrId
    );
    if (result !== 0) {
      return result;
    }
    client.cwd = cwd;
    client.setArgv(originalArgv);
    project = await readProjectSettings(vercelDir);
  }

  // The settings pull above may have just established the link; re-read it
  // so the re-anchoring below sees it.
  if (!link) {
    link = await getProjectLink(client, cwd, projectNameOrId, true);
  }

  // A per-directory link (`<dir>/.vercel/project.json`) doesn't report a
  // `repoRoot` like a repo-level (`repo.json`) link does, so the build would
  // treat the linked subdirectory as the repo root. When an ancestor workspace
  // claims the directory as a member package, re-anchor to that root and
  // express the project relative to it, so it behaves like a repo-level link
  // regardless of where the command was run. Directories not claimed by any
  // workspace are left untouched.
  if (!hasRepoLevelLink && link && project?.settings) {
    const resolved = resolvePerDirectoryLinkRoot(
      invokedCwd,
      project.settings.rootDirectory
    );
    if (resolved.advisory) {
      output.warn(resolved.advisory);
    }
    if (resolved.resolvedRootDirectory !== '') {
      projectRootDirectory = resolved.resolvedRootDirectory;
      project.settings.rootDirectory = resolved.resolvedRootDirectory;
      cwd = client.cwd = resolved.repoRoot;
    }
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

    let buildResult;
    try {
      buildResult = await rootSpan.child('vc.doBuild').trace(span =>
        doBuild(
          {
            project,
            buildsJson,
            cwd,
            outputDir,
            span,
            standalone,
            localConfigPath: client.localConfigPath,
            cliVersion: cliPkg.version,
            userAgent: ua,
          },
          {
            output,
            createBuildRunner,
            canBuildInSubprocess,
            importBuilders,
            formatResolvedBuilders,
            writeBuildResult,
            toEnumerableError: error =>
              toEnumerableError(error as Partial<Error>),
            readJSONFile,
            isCantParseJSONFile: value => value instanceof CantParseJSONFile,
            validateConfig,
            compileVercelConfig,
            findSourceVercelConfigFile,
            defaultVercelConfigFilename: DEFAULT_VERCEL_CONFIG_FILENAME,
            startBuildTiming: stamp,
          }
        )
      );
    } finally {
      await rootSpan.stop();
    }

    if (!client.nonInteractive) {
      const relOutputDir = relative(cwd, outputDir);
      output.print(
        `${prependEmoji(
          `Build Completed in ${chalk.bold(
            relOutputDir.startsWith('..') ? outputDir : relOutputDir
          )} ${chalk.gray(buildResult.buildDuration)}`,
          emoji('success')
        )}\n`
      );
    }

    if (process.env.VERCEL_ANALYZE_BUILD_OUTPUT === '1') {
      await analyzeVcConfigFiles(cwd, outputDir);
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
    delete process.env.VERCEL_INSTALL_COMPLETED_PATH;

    // Reset customInstallCommandSet to allow subsequent builds in the same process
    resetCustomInstallCommandSet();
  }
}

/**
 * Execute the Project's builders. If this function throws an error,
 * then it will be serialized into the `builds.json` manifest file.
 */
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
const CLOSE_TO_LIMIT_MB = LAMBDA_SIZE_LIMIT_MB - 5;

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
    output.print(chalk.yellow('Large dependencies:\n'));
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

  // Sort by size descending (largest first)
  const sortedResults = validResults.sort((a, b) => b.size - a.size);

  output.print(chalk.bold(`\nServerless function size info:\n`));

  let numExceeded = 0;
  for (const result of sortedResults) {
    const exceeded = result.size >= LAMBDA_SIZE_LIMIT_MB;
    const close = result.size >= CLOSE_TO_LIMIT_MB && !exceeded;

    // Print warning if function exceeded or is close to limit
    if (exceeded) {
      numExceeded++;
      output.print(
        chalk.yellow(
          `\n⚠️  Max serverless function size of ${LAMBDA_SIZE_LIMIT_MB} MB uncompressed reached\n`
        )
      );
    } else if (close) {
      output.print(
        chalk.yellow(
          `\n⚠️  Max serverless function size of ${LAMBDA_SIZE_LIMIT_MB} MB uncompressed almost reached\n`
        )
      );
    }

    output.print(
      `${chalk.cyan('Function :')} ${chalk.cyan.bold(result.path)}\n` +
        `${chalk.cyan('Size     :')} ${chalk.cyan.bold(result.size.toFixed(2))} MB\n`
    );
    printFileSizeBreakdown(result.files);
  }

  // Throw error if any functions exceeded the limit
  if (numExceeded > 0) {
    throw new NowBuildError({
      code: 'NOW_SANDBOX_WORKER_MAX_LAMBDA_SIZE',
      message: `${numExceeded} function${numExceeded === 1 ? '' : 's'} exceeded the uncompressed maximum size of ${LAMBDA_SIZE_LIMIT_MB} MB.`,
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
