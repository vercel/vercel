import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { mkdirp } from 'fs-extra';
import { errorToString, isErrnoException } from '@vercel/error-utils';
import { defaultGlobalConfig, getDefaultAuthConfig } from '@vercel/cli-config';
import { determineAgent } from '@vercel/detect-agent';
import { Span, type Reporter, type TraceEvent } from '@vercel/build-utils';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import type { VercelConfig } from '@vercel/client';
import Client from './util/client';
import * as configFiles from './util/config/files';
import getGlobalPathConfig from './util/config/global-path';
import * as ERRORS from './util/errors-ts';
import { recordDirectBuildFallback } from './util/direct-build-fallback';
import { setFetchDispatcher } from './util/fetch';
import { parseArguments } from './util/get-args';
import { getShortFlagLongName } from './util/get-flags-specification';
import earlyGetConfig from './util/get-config';
import hp from './util/humanize-path';
import { installProcessGuards } from './util/install-process-guards';
import isOutputDebugEnabled from './util/is-output-debug-enabled';
import { isNativeBinaryInstall } from './util/native-install';
import highlight from './util/output/highlight';
import param from './util/output/param';
import {
  shouldPrintVersionBanner,
  wantsMachineReadableOutput,
} from './util/output-format';
import pkg from './util/pkg';
import { getTitleName } from './util/pkg-name';
import { hasLocalProjectLink } from './util/projects/link';
import { TelemetryEventStore } from './util/telemetry';
import { checkTelemetryStatus } from './util/telemetry/check-status';
import {
  exitWithUnexpectedError,
  handleUnexpectedError,
  registerUnexpectedErrorHandlers,
} from './util/unexpected-error';
import { BUILD_LABEL } from './util/constants';
import output from './output-manager';

// `vercel build` as run by the build container, without loading the command
// router in index.ts. Each step mirrors main() in index.ts for this one
// command; anything it handles that this does not falls back to index.ts.

const DIRECT_GLOBAL_FLAGS = new Set([
  '--cwd',
  '--debug',
  '--global-config',
  '--local-config',
  '--no-color',
  '--non-interactive',
  '--scope',
  '--token',
]);

const PROXY_ENV_VARS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
  'ALL_PROXY',
  'all_proxy',
];

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];
  report(event: TraceEvent) {
    this.events.push(event);
  }
}

function parseInitialArgs(argv: string[]) {
  return parseArguments(
    argv,
    {
      '--version': Boolean,
      '-v': '--version',
      '--changelog': Boolean,
      '--non-interactive': Boolean,
    },
    { permissive: true }
  );
}

/**
 * Returns why this invocation needs the full CLI, or `undefined` when
 * runInternalBuild() can run it with the same behavior.
 */
export function getDirectBuildFallbackReason(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  let parsedArgs: ReturnType<typeof parseInitialArgs>;
  try {
    parsedArgs = parseInitialArgs(argv);
  } catch {
    return 'invalid_arguments';
  }

  if (parsedArgs.args[2] !== 'build' || argv[2] !== 'build') {
    return 'not_build';
  }
  for (const [flag, value] of Object.entries(parsedArgs.flags)) {
    if (value !== undefined && !DIRECT_GLOBAL_FLAGS.has(flag)) {
      return `flag:${flag}`;
    }
  }

  const separatorIndex = argv.indexOf('--');
  const cliArgs = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  if (
    cliArgs.some(
      arg =>
        arg === '--project' ||
        arg.startsWith('--project=') ||
        getShortFlagLongName(arg) === '--project'
    )
  ) {
    return 'project_scope';
  }

  if (env.FORCE_TTY === '1') return 'force_tty';
  if (env.FF_GUIDANCE_MODE) return 'guidance_mode';
  // Telemetry events and the user lookup that attributes them are only kept
  // by the full CLI in index.ts.
  if (!env.VERCEL_TELEMETRY_DISABLED) return 'telemetry_enabled';
  if (env.VERCEL_TELEMETRY_DEBUG === '1') return 'telemetry_debug';
  if (!env.NO_UPDATE_NOTIFIER && !env.VERCEL && !isNativeBinaryInstall()) {
    return 'update_check';
  }

  return undefined;
}

/**
 * Runs `vercel build` for the internal build worker. Resolves to `undefined`
 * without side effects when the invocation must go through index.ts.
 */
export async function runInternalBuild(): Promise<number | undefined> {
  const fallbackReason = getDirectBuildFallbackReason();
  if (fallbackReason !== undefined) {
    recordDirectBuildFallback(fallbackReason);
    return undefined;
  }

  installProcessGuards();

  let client: Client | undefined;
  registerUnexpectedErrorHandlers(() => client);

  if (process.env.CLAUDECODE) {
    process.stderr.write(
      '<claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />\n'
    );
  }

  // Unlike index.ts, this never schedules a native auto-update: it only runs
  // in the build container's worker, whose CLI is pinned by the image, and the
  // handoff env does not reliably carry NO_UPDATE_NOTIFIER or VERCEL.
  try {
    const exitCode = await main(c => {
      client = c;
    });
    process.exitCode = exitCode;
    return exitCode ?? 0;
  } catch (error: unknown) {
    await handleUnexpectedError(client, error as Error);
    return exitWithUnexpectedError(error);
  }
}

async function main(
  setClient: (client: Client) => void
): Promise<number | undefined> {
  const vercelDir = getGlobalPathConfig();
  const traceReporter = new InMemoryReporter();
  const rootSpan = new Span({
    name: 'vc.cli',
    reporter: traceReporter,
    attrs: { directBuild: 'true' },
  });
  const parsedArgs = parseInitialArgs(process.argv);
  output.initialize({
    debug: isOutputDebugEnabled(parsedArgs.flags['--debug']),
    noColor: parsedArgs.flags['--no-color'],
  });

  const localConfigPath = parsedArgs.flags['--local-config'];
  let localConfig: VercelConfig | Error | undefined =
    await earlyGetConfig(localConfigPath);

  if (localConfig instanceof ERRORS.CantParseJSONFile) {
    output.error(`Couldn't parse JSON file ${localConfig.meta.file}.`);
    return 1;
  }

  if (localConfig instanceof ERRORS.CantFindConfig) {
    if (localConfigPath) {
      output.error(
        `Couldn't find a project configuration file at \n    ${localConfig.meta.paths.join(
          ' or\n    '
        )}`
      );
      return 1;
    } else {
      localConfig = undefined;
    }
  }

  if (localConfig instanceof Error) {
    output.prettyError(localConfig);
    return 1;
  }

  const shortBuildLabel = BUILD_LABEL ? ` (${BUILD_LABEL.split(' ')[0]})` : '';
  const versionBanner = isNativeBinaryInstall()
    ? `${getTitleName()} CLI ${pkg.version}${shortBuildLabel}`
    : `${getTitleName()} CLI ${pkg.version}${shortBuildLabel} (Node.js ${process.versions.node})`;
  if (shouldPrintVersionBanner('build', process.argv)) {
    output.print(`${chalk.dim(versionBanner)}\n`);
  }

  try {
    await mkdirp(vercelDir);
  } catch (err: unknown) {
    output.error(
      `An unexpected error occurred while trying to create the global directory "${hp(
        vercelDir
      )}" ${errorToString(err)}`
    );
    return 1;
  }

  let config: GlobalConfig;
  try {
    config = configFiles.readConfigFile();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      config = defaultGlobalConfig;
      try {
        configFiles.writeToConfigFile(config);
      } catch (err: unknown) {
        output.error(
          `An unexpected error occurred while trying to save the config to "${hp(
            configFiles.getConfigFilePath()
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the config in "${hp(
          configFiles.getConfigFilePath()
        )}" ${errorToString(err)}`
      );
      return 1;
    }
  }

  let tokenSource: 'flag' | 'env' | undefined;
  let explicitToken: string | undefined;
  if (typeof parsedArgs.flags['--token'] === 'string') {
    explicitToken = parsedArgs.flags['--token'];
    tokenSource = 'flag';
  } else if (process.env.VERCEL_TOKEN) {
    explicitToken = process.env.VERCEL_TOKEN;
    tokenSource = 'env';
  }

  let authConfig: AuthConfig;
  if (tokenSource) {
    authConfig = getDefaultAuthConfig();
  } else {
    try {
      authConfig = configFiles.readAuthConfigFile(config);
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        authConfig = getDefaultAuthConfig();
      } else {
        output.error(
          `An unexpected error occurred while trying to read the auth config in "${hp(
            configFiles.getAuthConfigFilePath()
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    }
  }

  const telemetryEventStore = new TelemetryEventStore({
    config: config.telemetry,
    cliDevice: { filePath: join(vercelDir, 'telemetry-device.json') },
    cliSession: { filePath: join(vercelDir, 'telemetry-session.json') },
  });

  checkTelemetryStatus({ config });

  const { isAgent, agent: detectedAgent } = await determineAgent();

  let apiUrl = 'https://api.vercel.com';
  if (config && config.api) {
    apiUrl = config.api;
  }

  let client: Client | undefined;
  try {
    new URL(apiUrl);
  } catch (_err: unknown) {
    output.error(`Please provide a valid URL instead of ${highlight(apiUrl)}.`);
    return 1;
  }

  const stdinIsTTY = process.stdin?.isTTY === true;
  const nonInteractiveFlag = parsedArgs.flags['--non-interactive'] === true;
  const argv = process.argv;
  const explicitNonInteractiveFalse =
    argv.includes('--non-interactive=false') ||
    argv.includes('--no-non-interactive') ||
    (argv.includes('--non-interactive') &&
      argv[argv.indexOf('--non-interactive') + 1] === 'false');
  const nonInteractive = explicitNonInteractiveFalse
    ? false
    : nonInteractiveFlag || (isAgent && !stdinIsTTY);

  output.debug(
    `Agent/TTY/nonInteractive: isAgent=${isAgent} agentName=${detectedAgent?.name ?? 'none'} stdin.isTTY=${String(process.stdin?.isTTY)} --non-interactive=${nonInteractiveFlag} explicitFalse=${explicitNonInteractiveFalse} => nonInteractive=${nonInteractive}`
  );

  if (PROXY_ENV_VARS.some(v => process.env[v])) {
    const { EnvProxyDispatcher } = await import('./util/fetch-proxy');
    setFetchDispatcher(new EnvProxyDispatcher());
  }

  client = new Client({
    apiUrl,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: output.stream,
    config,
    authConfig,
    localConfig,
    localConfigPath,
    argv: process.argv,
    telemetryEventStore,
    isAgent,
    agentName: detectedAgent?.name,
    nonInteractive,
  });
  setClient(client);
  client.rootSpan = rootSpan;

  if (parsedArgs.flags['--cwd']) {
    client.cwd = parsedArgs.flags['--cwd'];
  }
  const { cwd } = client;

  if (
    existsSync(join(cwd, 'build')) &&
    !parsedArgs.flags['--cwd'] &&
    !process.env.NOW_BUILDER &&
    !wantsMachineReadableOutput('build', process.argv) &&
    !(await hasLocalProjectLink(client, cwd))
  ) {
    output.warn(
      `Did you mean to deploy the subdirectory "build"? ` +
        `Use \`vc --cwd build\` instead.`
    );
  }
  output.debug('user supplied known subcommand: "build"');

  if (tokenSource === 'env' && explicitToken) {
    parsedArgs.flags['--token'] = explicitToken;
  }

  if (typeof parsedArgs.flags['--token'] === 'string') {
    const token: string = parsedArgs.flags['--token'];

    if (token.length === 0) {
      output.prettyError({
        message: `You defined ${param('--token')}, but it's missing a value`,
        link: 'https://err.sh/vercel/missing-token-value',
      });

      return 2;
    }

    const invalid = token.match(/(\W)/g);
    if (invalid) {
      const notContain = Array.from(new Set(invalid)).sort();
      output.prettyError({
        message: `You defined ${param(
          '--token'
        )}, but its contents are invalid. Must not contain: ${notContain
          .map(c => JSON.stringify(c))
          .join(', ')}`,
        link: 'https://err.sh/vercel/invalid-token-value',
      });

      return 2;
    }

    client.authConfig = { token, skipWrite: true, tokenSource };

    if (client.config && client.config.currentTeam) {
      delete client.config.currentTeam;
    }
  }

  let exitCode: number | undefined;
  try {
    const buildModule = await import('./commands/build/index.js');
    const buildCommand = buildModule.default;

    const buildClient = client;
    exitCode = await rootSpan
      .child('vc.cli.command', { command: 'build' })
      .trace(() => buildCommand(buildClient));
  } catch (err: unknown) {
    // The build command reports its own build failures. This only catches an
    // error thrown before its build starts, which the full CLI would format
    // in more detail; the build container only needs it printed and exit 1.
    output.prettyError(err);
    return 1;
  }

  rootSpan.stop();

  if (client.traceDiagnosticsPath) {
    try {
      await mkdir(join(client.traceDiagnosticsPath, '..'), { recursive: true });
      await writeFile(
        client.traceDiagnosticsPath,
        JSON.stringify(traceReporter.events)
      );
    } catch (err) {
      output.error('Failed to write diagnostics trace file');
      output.prettyError(err);
    }
  }

  return exitCode;
}
