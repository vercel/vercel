import { join } from 'path';
import type * as tty from 'tty';
import { URL } from 'url';
import chalk from 'chalk';
import { isErrnoException, isError, errorToString } from '@vercel/error-utils';
import {
  getAuthConfigFilePath,
  getConfigFilePath,
  getDefaultAuthConfig,
  defaultGlobalConfig,
} from '@vercel/cli-config';
import {
  NowBuildError,
  Span,
  type Reporter,
  type TraceEvent,
} from '@vercel/build-utils';
import type { VercelConfig } from '@vercel/client';
import type {
  AuthConfig,
  GlobalConfig,
  ReadableTTY,
  User,
} from '@vercel-internals/types';
import { mkdir, writeFile } from 'fs/promises';
import hp from './util/humanize-path';
import { commands, commandNames } from './commands';
import { handleCommandTypo } from './util/handle-command-typo';
import { matchesCliApiTag } from './util/openapi/matches-cli-api-tag';
import { tryOpenApiFallback } from './util/openapi';
import pkg from './util/pkg';
import param from './util/output/param';
import highlight from './util/output/highlight';
import { parseArguments } from './util/get-args';
import Client from './util/client';
import { setFetchDispatcher } from './util/fetch';
import { printError } from './util/error';
import * as ERRORS from './util/errors-ts';
import { APIError } from './util/errors-ts';
import { isNativeBinaryInstall } from './util/updates';
import { getTitleName } from './util/pkg-name';
import { BUILD_LABEL } from './util/constants';
import promptMissingCredentials from './util/login/prompt-missing-credentials';
import { TelemetryEventStore } from './util/telemetry';
import { RootTelemetryClient } from './util/telemetry/root';
import { help } from './args';
import { checkTelemetryStatus } from './util/telemetry/check-status';
import output from './output-manager';
import {
  shouldPrintVersionBanner,
  wantsMachineReadableOutput,
} from './util/output-format';
import { checkGuidanceStatus } from './util/guidance/check-status';
import { exitOnFatalGlobalConfigWriteError } from './gateways/cli-config-store';
import type { CliContext, ScopeResolutionContext } from './gateways/context';
import { gatewayErrorCause } from './gateways/result';
import {
  hasLocalProjectLink,
  loadCurrentUser,
} from './util/scope/resolve-scope';
import { resolveExplicitScope } from './util/scope/resolve-explicit-scope';

/** The process-level inputs of one CLI invocation. */
export type CliInvocation = {
  /** `process.argv` shape: `[execPath, script, ...args]`. */
  argv: string[];
  env: Readonly<Record<string, string | undefined>>;
  stdin: ReadableTTY;
  stdout: tty.WriteStream;
  stderr: tty.WriteStream;
};

export type RunCliHooks = {
  /** Called as soon as the shared `Client` exists. */
  onClientCreated?(client: Client): void;
};

export type RunCliResult = {
  exitCode: number | undefined;
  /** `undefined` when the run ended before the `Client` was created. */
  client: Client | undefined;
  /** The command that ran, for the post-run update notifier. */
  resolvedCommand: string | undefined;
  /** Whether stdout is a TTY after `FORCE_TTY` handling. */
  isTTY: boolean;
};

const GLOBAL_COMMANDS = new Set(['help']);

// Check if proxy environment variables are configured
function hasProxyConfig(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'ALL_PROXY',
    'all_proxy',
  ].some(v => env[v]);
}

/**
 * `getPlatformEnv` over the invocation environment: prefers `VERCEL_<name>`,
 * falls back to `NOW_<name>`, and throws when both are set.
 */
function getInvocationPlatformEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const vName = `VERCEL_${name}`;
  const nName = `NOW_${name}`;
  const v = env[vName];
  const n = env[nName];
  if (typeof v === 'string') {
    if (typeof n === 'string') {
      throw new NowBuildError({
        code: 'CONFLICTING_ENV_VAR_NAMES',
        message: `Both "${vName}" and "${nName}" env vars are defined. Please only define the "${vName}" env var.`,
        link: 'https://vercel.link/combining-old-and-new-config',
      });
    }
    return v;
  }
  return n;
}

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];
  report(event: TraceEvent) {
    this.events.push(event);
  }
}

/**
 * Runs one CLI invocation: argument parsing, bootstrap, scope resolution,
 * command dispatch, and error rendering. All bootstrap I/O goes through
 * `context`. Process glue (signal/error handlers, update notifier,
 * `process.exitCode`) stays in the entry file.
 *
 * This module has no side effects on import.
 */
export async function runCli(
  invocation: CliInvocation,
  context: CliContext,
  hooks?: RunCliHooks
): Promise<RunCliResult> {
  const { env } = invocation;
  let client: Client | undefined;
  let resolvedCommand: string | undefined;
  let isTTY = invocation.stdout.isTTY === true;

  const run = async (): Promise<number | undefined> => {
    const traceReporter = new InMemoryReporter();
    const rootSpan = new Span({ name: 'vc.cli', reporter: traceReporter });
    const isTelemetryFlushCommand =
      invocation.argv[2] === 'telemetry' && invocation.argv[3] === 'flush';

    if (env.FORCE_TTY === '1') {
      isTTY = true;
      invocation.stdout.isTTY = true;
      invocation.stdin.isTTY = true;
    }

    const parseInitialArgs = () =>
      parseArguments(
        invocation.argv,
        {
          '--version': Boolean,
          '-v': '--version',
          '--changelog': Boolean,
          '--non-interactive': Boolean,
        },
        { permissive: true }
      );

    let parsedArgs: ReturnType<typeof parseInitialArgs>;

    try {
      parsedArgs = parseInitialArgs();
      const isDebugging = parsedArgs.flags['--debug'];
      const isNoColor = parsedArgs.flags['--no-color'];
      output.initialize({
        stream: invocation.stderr,
        debug: isDebugging,
        noColor: isNoColor,
      });
    } catch (err: unknown) {
      printError(err);
      return 1;
    }

    const localConfigPath = parsedArgs.flags['--local-config'];
    let localConfig: VercelConfig | undefined;
    let earlyCwd: string;
    try {
      earlyCwd = context.workingDirectory.current();
    } catch (err: unknown) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        output.prettyError(new ERRORS.WorkingDirectoryDoesNotExist());
        return 1;
      }
      throw err;
    }
    const earlyConfig = await context.workspace.readEarlyLocalConfig({
      cwd: earlyCwd,
      localConfigPath,
    });

    if (earlyConfig.type === 'found') {
      localConfig = earlyConfig.config;
    } else if (earlyConfig.type === 'missing') {
      if (localConfigPath) {
        output.error(
          `Couldn't find a project configuration file at \n    ${earlyConfig.searchedPaths.join(
            ' or\n    '
          )}`
        );
        return 1;
      }
    } else if (earlyConfig.error.code === 'CANT_PARSE_JSON_FILE') {
      output.error(
        `Couldn't parse JSON file ${earlyConfig.error.details?.file}.`
      );
      return 1;
    } else {
      output.prettyError(
        (earlyConfig.error.details?.cause as Error | undefined) ??
          earlyConfig.error
      );
      return 1;
    }

    // The second argument to the command can be:
    //
    //  * a path to deploy (as in: `vercel path/`)
    //  * a subcommand (as in: `vercel ls`)
    const targetOrSubcommand =
      parsedArgs.args[2] ||
      (parsedArgs.flags['--changelog'] ? 'changelog' : undefined);
    const subSubCommand = parsedArgs.args[3];

    // If empty, leave this code here for easy adding of beta commands later
    const betaCommands: string[] = ['api', 'crons', 'curl', 'kms', 'webhooks'];
    // Short build label stamped by CI for non-release builds (e.g. "pr-115"
    // from "pr-115 abc1234"). The full label is shown by `vc --version`.
    const shortBuildLabel = BUILD_LABEL
      ? ` (${BUILD_LABEL.split(' ')[0]})`
      : '';
    const versionBanner = isNativeBinaryInstall()
      ? `${getTitleName()} CLI ${pkg.version}${shortBuildLabel}`
      : `${getTitleName()} CLI ${pkg.version}${shortBuildLabel} (Node.js ${process.versions.node})`;
    const msg =
      targetOrSubcommand && betaCommands.includes(targetOrSubcommand)
        ? `${versionBanner} | ${targetOrSubcommand} is in beta — https://vercel.com/feedback`
        : versionBanner;
    if (shouldPrintVersionBanner(targetOrSubcommand, invocation.argv)) {
      output.print(`${chalk.dim(msg)}\n`);
    }

    // Handle `--version` directly
    if (!targetOrSubcommand && parsedArgs.flags['--version']) {
      invocation.stdout.write(`${pkg.version}\n`);
      return 0;
    }

    // Handle bare `-h` directly
    const bareHelpOption = !targetOrSubcommand && parsedArgs.flags['--help'];
    const bareHelpSubcommand = targetOrSubcommand === 'help' && !subSubCommand;
    if (bareHelpOption || bareHelpSubcommand) {
      output.print(help());
      return 0;
    }

    // Ensure that the Vercel global configuration directory exists
    const { cliConfig } = context;
    const globalDir = cliConfig.globalDir;
    const globalConfigPath = getConfigFilePath(globalDir);
    const authConfigPath = getAuthConfigFilePath(globalDir);
    const ensureDirResult = cliConfig.ensureGlobalDir();
    if (!ensureDirResult.ok) {
      output.error(
        `An unexpected error occurred while trying to create the global directory "${hp(
          globalDir
        )}" ${errorToString(gatewayErrorCause(ensureDirResult.error))}`
      );
      return 1;
    }

    let config: GlobalConfig;
    const readConfigResult = cliConfig.readGlobalConfig();
    if (readConfigResult.type === 'found') {
      config = readConfigResult.value;
    } else if (readConfigResult.type === 'missing') {
      // Copy so the shared default is never mutated by later config updates.
      config = structuredClone(defaultGlobalConfig);
      const writeResult = cliConfig.writeGlobalConfig({ config });
      if (!writeResult.ok) {
        exitOnFatalGlobalConfigWriteError(cliConfig, writeResult.error);
        output.error(
          `An unexpected error occurred while trying to save the config to "${hp(
            globalConfigPath
          )}" ${errorToString(gatewayErrorCause(writeResult.error))}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the config in "${hp(
          globalConfigPath
        )}" ${errorToString(gatewayErrorCause(readConfigResult.error))}`
      );
      return 1;
    }

    // Check for explicit tokens before reading persisted credentials so CI/headless
    // usage does not depend on local auth storage such as an OS keyring.
    let tokenSource: 'flag' | 'env' | undefined;
    let explicitToken: string | undefined;
    if (typeof parsedArgs.flags['--token'] === 'string') {
      explicitToken = parsedArgs.flags['--token'];
      tokenSource = 'flag';
    } else if (env.VERCEL_TOKEN) {
      explicitToken = env.VERCEL_TOKEN;
      tokenSource = 'env';
    }

    let authConfig: AuthConfig;
    if (tokenSource) {
      authConfig = getDefaultAuthConfig();
    } else {
      const readAuthResult = cliConfig.readAuthConfig();
      if (readAuthResult.type === 'found') {
        authConfig = readAuthResult.value;
      } else if (readAuthResult.type === 'missing') {
        authConfig = getDefaultAuthConfig();
      } else {
        output.error(
          `An unexpected error occurred while trying to read the auth config in "${hp(
            authConfigPath
          )}" ${errorToString(gatewayErrorCause(readAuthResult.error))}`
        );
        return 1;
      }
    }

    const telemetryEventStore = new TelemetryEventStore({
      isDebug: env.VERCEL_TELEMETRY_DEBUG === '1',
      config: config.telemetry,
      telemetry: context.telemetry,
      persistIdentity: !isTelemetryFlushCommand,
    });

    checkTelemetryStatus({
      config,
      configStore: cliConfig,
      env,
    });

    if (env.FF_GUIDANCE_MODE) {
      checkGuidanceStatus({
        config,
        configStore: cliConfig,
        env,
      });
    }

    const telemetry = new RootTelemetryClient({
      opts: {
        store: telemetryEventStore,
      },
    });

    const { isAgent, agentName } = await context.agentDetector.detect();
    telemetry.trackInvocationId(telemetryEventStore.currentInvocationId);
    telemetry.trackDeviceId(telemetryEventStore.currentDeviceId);
    const vercelPluginMarker = context.telemetry.readPluginSessionMarker();
    if (vercelPluginMarker) {
      telemetry.trackVercelPluginActiveSession();
      telemetry.trackVercelPluginVersion(vercelPluginMarker.pluginVersion);
    }
    telemetry.trackAgenticUse(agentName);
    telemetry.trackCPUs();
    telemetry.trackPlatform();
    telemetry.trackArch();
    telemetry.trackCIVendorName();
    telemetry.trackStdinIsTTY(invocation.stdin?.isTTY === true);
    telemetry.trackVersion(pkg.version);
    telemetry.trackCliOptionCwd(parsedArgs.flags['--cwd']);
    telemetry.trackCliOptionLocalConfig(parsedArgs.flags['--local-config']);
    telemetry.trackCliOptionGlobalConfig(parsedArgs.flags['--global-config']);
    telemetry.trackCliFlagDebug(parsedArgs.flags['--debug']);
    telemetry.trackCliFlagNoColor(parsedArgs.flags['--no-color']);
    telemetry.trackCliOptionScope(parsedArgs.flags['--scope']);
    telemetry.trackCliOptionToken(parsedArgs.flags['--token']);
    telemetry.trackCliOptionTeam(parsedArgs.flags['--team']);
    telemetry.trackCliOptionApi(parsedArgs.flags['--api']);

    let earlyGetUserPromise: Promise<User | undefined> | undefined;
    let telemetrySaved = false;

    const getStringProperty = (
      value: unknown,
      key: string
    ): string | undefined => {
      if (typeof value === 'object' && value !== null && key in value) {
        const property = (value as Record<string, unknown>)[key];
        if (typeof property === 'string') {
          return property;
        }
      }

      return undefined;
    };

    const getNumberProperty = (
      value: unknown,
      key: string
    ): number | undefined => {
      if (typeof value === 'object' && value !== null && key in value) {
        const property = (value as Record<string, unknown>)[key];
        if (typeof property === 'number') {
          return property;
        }
      }

      return undefined;
    };

    const trackAgenticErrorTelemetry = (err: unknown) => {
      if (!isAgent) {
        return;
      }

      telemetry.trackErrorStatus(getNumberProperty(err, 'status'));
      telemetry.trackErrorCode(getStringProperty(err, 'code'));
      telemetry.trackErrorSlug(getStringProperty(err, 'slug'));
      telemetry.trackErrorAction(getStringProperty(err, 'action'));

      const serverMessage =
        getStringProperty(err, 'serverMessage') ??
        (isError(err) ? err.message : undefined);
      telemetry.trackErrorServerMessage(serverMessage);
    };

    const saveTelemetry = async () => {
      if (telemetrySaved) {
        return;
      }

      const postCommandSpan = rootSpan.child('vc.postCommand');

      telemetryEventStore.updateTeamId(
        client?.config.currentTeam ?? config.currentTeam
      );
      telemetryEventStore.updateUserId(
        client?.authConfig.userId ?? authConfig.userId
      );
      if (!telemetryEventStore.hasUserId) {
        const getUserSpan = postCommandSpan.child('vc.postCommand.getUser');
        try {
          const user = await earlyGetUserPromise;
          if (user) {
            telemetryEventStore.updateUserId(user.id);
          }
        } catch {
          // best-effort for telemetry
        } finally {
          getUserSpan.stop();
        }
      }

      try {
        const envProjectId = getInvocationPlatformEnv(env, 'PROJECT_ID');
        if (envProjectId) {
          telemetryEventStore.updateProjectId(envProjectId);
        } else {
          const cwdForProjectId =
            client?.cwd ||
            (typeof parsedArgs.flags['--cwd'] === 'string'
              ? parsedArgs.flags['--cwd']
              : context.workingDirectory.current());
          const link = await context.projectLinks.readProjectLink({
            dir: cwdForProjectId,
          });
          if (link.type === 'found') {
            telemetryEventStore.updateProjectId(link.value.projectId);
          }
        }
      } catch {
        // best-effort for telemetry — project may not be linked
      }
      telemetry.trackProjectId(telemetryEventStore.currentProjectId);

      await telemetryEventStore.save();
      postCommandSpan.stop();
      telemetrySaved = true;
    };

    const finishWithExitCode = async (code: number) => {
      await saveTelemetry();
      return code;
    };

    let apiUrl = 'https://api.vercel.com';
    if (typeof parsedArgs.flags['--api'] === 'string') {
      apiUrl = parsedArgs.flags['--api'];
    } else if (config && config.api) {
      apiUrl = config.api;
    }

    try {
      new URL(apiUrl);
    } catch (_err: unknown) {
      output.error(
        `Please provide a valid URL instead of ${highlight(apiUrl)}.`
      );
      return finishWithExitCode(1);
    }

    // Shared API `Client` instance for all sub-commands to utilize.
    // Non-interactive when: --non-interactive is set, or agent is detected (and no TTY). Explicit --non-interactive=false overrides agent detection.
    const stdinIsTTY = invocation.stdin?.isTTY === true;
    const nonInteractiveFlag = parsedArgs.flags['--non-interactive'] === true;
    const argv = invocation.argv;
    const explicitNonInteractiveFalse =
      argv.includes('--non-interactive=false') ||
      (argv.includes('--non-interactive') &&
        argv[argv.indexOf('--non-interactive') + 1] === 'false');
    const nonInteractive = explicitNonInteractiveFalse
      ? false
      : nonInteractiveFlag || (isAgent && !stdinIsTTY);

    output.debug(
      `Agent/TTY/nonInteractive: isAgent=${isAgent} agentName=${agentName ?? 'none'} stdin.isTTY=${String(invocation.stdin?.isTTY)} --non-interactive=${nonInteractiveFlag} explicitFalse=${explicitNonInteractiveFalse} => nonInteractive=${nonInteractive}`
    );

    // Only load proxy support if proxy env vars are configured (saves startup time).
    if (hasProxyConfig(env)) {
      const { EnvProxyDispatcher } = await import('./util/fetch-proxy');
      setFetchDispatcher(new EnvProxyDispatcher());
    }

    client = new Client({
      apiUrl,
      stdin: invocation.stdin,
      stdout: invocation.stdout,
      stderr: output.stream,
      config,
      authConfig,
      localConfig,
      localConfigPath,
      argv: invocation.argv,
      telemetryEventStore,
      isAgent,
      agentName,
      nonInteractive,
      cliConfig,
      workingDirectory: context.workingDirectory,
      env,
    });
    hooks?.onClientCreated?.(client);

    const scopeContext: ScopeResolutionContext = {
      ...context.createApiGateways({ client }),
      projectLinks: context.projectLinks,
      cliConfig,
    };

    client.rootSpan = rootSpan;

    // The `--cwd` flag is respected for all sub-commands
    if (parsedArgs.flags['--cwd']) {
      client.cwd = parsedArgs.flags['--cwd'];
    }
    const { cwd } = client;

    let defaultDeploy = false;
    // Gets populated to the subcommand name when a built-in is
    // provided, otherwise it remains undefined for an extension
    let subcommand: string | undefined = undefined;
    let userSuppliedSubCommand: string = '';
    // Check if we are deploying something
    if (targetOrSubcommand) {
      const targetPathExists = await context.workspace.hasEntry({
        cwd,
        name: targetOrSubcommand,
      });
      const subcommandExists =
        GLOBAL_COMMANDS.has(targetOrSubcommand) ||
        commands.has(targetOrSubcommand);

      if (
        targetPathExists &&
        subcommandExists &&
        !parsedArgs.flags['--cwd'] &&
        !env.NOW_BUILDER &&
        !wantsMachineReadableOutput(targetOrSubcommand, invocation.argv) &&
        !(await hasLocalProjectLink(scopeContext, { cwd }))
      ) {
        output.warn(
          `Did you mean to deploy the subdirectory "${targetOrSubcommand}"? ` +
            `Use \`vc --cwd ${targetOrSubcommand}\` instead.`
        );
      }

      if (subcommandExists) {
        output.debug(`user supplied known subcommand: "${targetOrSubcommand}"`);
        subcommand = targetOrSubcommand;
        userSuppliedSubCommand = targetOrSubcommand;
      } else {
        output.debug(
          'user supplied a possible target for deployment or an extension'
        );
        if (
          env.VERCEL_AUTO_API &&
          (await matchesCliApiTag(targetOrSubcommand))
        ) {
          output.debug(
            `first token "${targetOrSubcommand}" matches an OpenAPI tag; routing to api`
          );
          const tag = targetOrSubcommand;
          const result = await tryOpenApiFallback(
            client,
            parsedArgs.args.slice(3),
            async () => tag
          );
          return finishWithExitCode(result ?? 1);
        } else if (targetPathExists) {
          subcommand = 'deploy';
          userSuppliedSubCommand = targetOrSubcommand;
          output.debug(
            `first token "${targetOrSubcommand}" is an existing path; routing to deploy`
          );
        }
      }
    } else {
      output.debug('user supplied no target, defaulting to deploy');
      subcommand = 'deploy';
      defaultDeploy = true;
    }

    if (subcommand === 'help') {
      telemetry.trackCliCommandHelp('help');
      subcommand = subSubCommand || 'deploy';
      client.argv.push('-h');
    }

    const subcommandsWithoutToken = [
      'login',
      'logout',
      'help',
      'init',
      'build',
      'changelog',
      'deploy',
      'sandbox',
      'telemetry',
      'upgrade',
      'version',
      'skills',
      'agent',
      'whoami',
    ];

    if (env.FF_GUIDANCE_MODE) {
      subcommandsWithoutToken.push('guidance');
    }

    if (
      subcommand === 'dev' &&
      (client.argv.includes('--local') || client.argv.includes('-L'))
    ) {
      subcommandsWithoutToken.push('dev');
    }

    if (subcommand === 'flags' && subSubCommand === 'prepare') {
      subcommandsWithoutToken.push('flags');
    }

    // Apply VERCEL_TOKEN after telemetry so env-provided tokens are not reported
    // as if the user supplied `--token` on the command line.
    if (tokenSource === 'env' && explicitToken) {
      parsedArgs.flags['--token'] = explicitToken;
    }

    // Prompt for login if there is no current token
    if (
      (!authConfig || !authConfig.token) &&
      !client.argv.includes('-h') &&
      !client.argv.includes('--help') &&
      typeof parsedArgs.flags['--token'] !== 'string' &&
      subcommand &&
      !subcommandsWithoutToken.includes(subcommand)
    ) {
      const result = await promptMissingCredentials(
        client,
        trackAgenticErrorTelemetry
      );
      if (result !== 0) {
        return finishWithExitCode(result);
      }
    }

    if (
      typeof parsedArgs.flags['--token'] === 'string' &&
      subcommand === 'switch'
    ) {
      output.prettyError({
        message: `This command doesn't work with ${param(
          '--token'
        )}. Please use ${param('--scope')}.`,
        link: 'https://err.sh/vercel/no-token-allowed',
      });

      return finishWithExitCode(1);
    }

    if (typeof parsedArgs.flags['--token'] === 'string') {
      const token: string = parsedArgs.flags['--token'];

      if (token.length === 0) {
        output.prettyError({
          message: `You defined ${param('--token')}, but it's missing a value`,
          link: 'https://err.sh/vercel/missing-token-value',
        });

        return finishWithExitCode(1);
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

        return finishWithExitCode(1);
      }

      client.authConfig = { token, skipWrite: true, tokenSource };

      // Don't use team from config if `--token` was set
      if (client.config && client.config.currentTeam) {
        delete client.config.currentTeam;
      }
    }

    if (parsedArgs.flags['--team']) {
      output.warn(
        `The ${param('--team')} option is deprecated. Please use ${param(
          '--scope'
        )} instead.`
      );
    }

    let targetCommand =
      typeof subcommand === 'string' ? commands.get(subcommand) : undefined;
    const scope =
      parsedArgs.flags['--scope'] ||
      parsedArgs.flags['--team'] ||
      localConfig?.scope;
    const separatorIndex = client.argv.indexOf('--');
    const cliArgs =
      separatorIndex === -1
        ? client.argv
        : client.argv.slice(0, separatorIndex);
    const buildNeedsRemoteProjectScope =
      targetCommand === 'build' &&
      cliArgs.some(arg => arg === '--project' || arg.startsWith('--project='));

    if (
      typeof scope === 'string' &&
      targetCommand !== 'login' &&
      (targetCommand !== 'build' || buildNeedsRemoteProjectScope) &&
      targetCommand !== 'sandbox'
    ) {
      const scopeResult = await resolveExplicitScope(scopeContext, client, {
        scope,
        trackAgenticErrorTelemetry,
      });
      if (!scopeResult.ok) {
        return finishWithExitCode(scopeResult.exitCode);
      }
    }

    let exitCode;

    try {
      if (!targetCommand) {
        // Set this for the metrics to record it at the end
        targetCommand = parsedArgs.args[2];

        // Try to execute as an extension
        try {
          const { execExtension } = await import('./util/extension/exec');
          exitCode = await execExtension(
            client,
            targetCommand,
            parsedArgs.args.slice(3),
            cwd
          );
          telemetry.trackCliExtension();
        } catch (err: unknown) {
          if (isErrnoException(err) && err.code === 'ENOENT') {
            // Check if the user made a typo before falling back to deploy
            if (
              handleCommandTypo({
                command: targetCommand,
                availableCommands: commandNames,
              })
            ) {
              return 1;
            }
            // Fall back to `vc deploy <dir>`
            targetCommand = subcommand = 'deploy';
          } else {
            throw err;
          }
        }
      }

      // Not using an `else` here because if the CLI extension
      // was not found then we have to fall back to `vc deploy`
      if (subcommand) {
        let func: any;
        switch (targetCommand) {
          // Priority commands - separate bundles for fast loading
          case 'deploy':
            telemetry.trackCliCommandDeploy(userSuppliedSubCommand);
            telemetry.trackCliDefaultDeploy(defaultDeploy);
            func = (await import('./commands/deploy/index.js')).default;
            break;
          case 'dev':
            telemetry.trackCliCommandDev(userSuppliedSubCommand);
            func = (await import('./commands/dev/index.js')).default;
            break;
          case 'env':
            telemetry.trackCliCommandEnv(userSuppliedSubCommand);
            func = (await import('./commands/env/index.js')).default;
            break;
          case 'build':
            telemetry.trackCliCommandBuild(userSuppliedSubCommand);
            func = (await import('./commands/build/index.js')).default;
            break;
          case 'list':
            telemetry.trackCliCommandList(userSuppliedSubCommand);
            func = (await import('./commands/list/index.js')).default;
            break;
          case 'link':
            telemetry.trackCliCommandLink(userSuppliedSubCommand);
            func = (await import('./commands/link/index.js')).default;
            break;

          // Non-priority commands - loaded from bulk bundle
          case 'agent':
            telemetry.trackCliCommandAgent(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).agent;
            break;
          case 'agent-runs':
            telemetry.trackCliCommandAgentRuns(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).agentRuns;
            break;
          case 'ai-gateway':
            telemetry.trackCliCommandAiGateway(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).aiGateway;
            break;
          case 'alias':
            telemetry.trackCliCommandAlias(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).alias;
            break;
          case 'activity':
            telemetry.trackCliCommandActivity(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).activity;
            break;
          case 'alerts':
            telemetry.trackCliCommandAlerts(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).alerts;
            break;
          case 'api':
            telemetry.trackCliCommandApi(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).api;
            break;
          case 'bisect':
            telemetry.trackCliCommandBisect(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).bisect;
            break;
          case 'blob':
            telemetry.trackCliCommandBlob(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).blob;
            break;
          case 'buy':
            telemetry.trackCliCommandBuy(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).buy;
            break;
          case 'init':
            telemetry.trackCliCommandInit(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).init;
            break;
          case 'cache':
            telemetry.trackCliCommandCache(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).cache;
            break;
          case 'connect':
            telemetry.trackCliCommandConnex(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).connex;
            break;
          case 'contract':
            telemetry.trackCliCommandContract(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).contract;
            break;
          case 'certs':
            telemetry.trackCliCommandCerts(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).certs;
            break;
          case 'changelog':
            telemetry.trackCliCommandChangelog(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).changelog;
            break;
          case 'comments':
            telemetry.trackCliCommandComments(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).comments;
            break;
          case 'crons':
          case 'cron':
            telemetry.trackCliCommandCrons(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).crons;
            break;
          case 'curl':
            telemetry.trackCliCommandCurl(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).curl;
            break;
          case 'dns':
            telemetry.trackCliCommandDns(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).dns;
            break;
          case 'deploy-hooks':
          case 'deploy-hook':
            telemetry.trackCliCommandDeployHooks(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).deployHooks;
            break;
          case 'global-config':
            telemetry.trackCliCommandGlobalConfig(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).globalConfig;
            break;
          case 'domains':
            telemetry.trackCliCommandDomains(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).domains;
            break;
          case 'firewall':
            telemetry.trackCliCommandFirewall(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).firewall;
            break;
          case 'flags':
            telemetry.trackCliCommandFlags(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).flags;
            break;
          case 'git':
            telemetry.trackCliCommandGit(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).git;
            break;
          case 'guidance':
            if (env.FF_GUIDANCE_MODE) {
              telemetry.trackCliCommandGuidance(userSuppliedSubCommand);
              func = (await import('./commands-bulk.js')).guidance;
              break;
            } else {
              func = null;
              break;
            }
          case 'httpstat':
            telemetry.trackCliCommandHttpstat(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).httpstat;
            break;
          case 'install':
            telemetry.trackCliCommandInstall(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).install;
            break;
          case 'integration':
            telemetry.trackCliCommandIntegration(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).integration;
            break;
          case 'integration-resource':
            telemetry.trackCliCommandIntegrationResource(
              userSuppliedSubCommand
            );
            func = (await import('./commands-bulk.js')).integrationResource;
            break;
          case 'kms':
            telemetry.trackCliCommandKms(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).kms;
            break;
          case 'mcp':
            func = (await import('./commands-bulk.js')).mcp;
            break;
          case 'logout':
            telemetry.trackCliCommandLogout(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).logout;
            break;
          case 'login':
            telemetry.trackCliCommandLogin(userSuppliedSubCommand);
            func = (c: Client) =>
              import('./commands-bulk.js').then(m =>
                m.login(c, { shouldParseArgs: true })
              );
            break;
          case 'inspect':
            telemetry.trackCliCommandInspect(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).inspect;
            break;
          case 'logs':
            telemetry.trackCliCommandLogs(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).logs;
            break;
          case 'metrics':
            telemetry.trackCliCommandMetrics(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).metrics;
            break;
          case 'microfrontends':
            telemetry.trackCliCommandMicrofrontends(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).microfrontends;
            break;
          case 'open':
            telemetry.trackCliCommandOpen(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).open;
            break;
          case 'project':
            telemetry.trackCliCommandProject(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).project;
            break;
          case 'promote':
            telemetry.trackCliCommandPromote(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).promote;
            break;
          case 'pull':
            telemetry.trackCliCommandPull(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).pull;
            break;
          case 'redeploy':
            telemetry.trackCliCommandRedeploy(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).redeploy;
            break;
          case 'redirects':
            telemetry.trackCliCommandRedirects(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).redirects;
            break;
          case 'routes':
            telemetry.trackCliCommandRoutes(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).routes;
            break;
          case 'remove':
            telemetry.trackCliCommandRemove(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).remove;
            break;
          case 'rollback':
            telemetry.trackCliCommandRollback(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).rollback;
            break;
          case 'rr':
          case 'release':
          case 'rolling-release':
            telemetry.trackCliCommandRollingRelease(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).rollingRelease;
            break;
          case 'sandbox':
            telemetry.trackCliCommandSandbox(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).sandbox;
            break;
          case 'security':
            telemetry.trackCliCommandSecurity(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).security;
            break;
          case 'skills':
            telemetry.trackCliCommandSkills(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).skills;
            break;
          case 'target':
            telemetry.trackCliCommandTarget(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).target;
            break;
          case 'teams':
            telemetry.trackCliCommandTeams(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).teams;
            break;
          case 'tokens':
            telemetry.trackCliCommandTokens(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).tokens;
            break;
          case 'telemetry':
            telemetry.trackCliCommandTelemetry(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).telemetry;
            break;
          case 'traces':
            telemetry.trackCliCommandTraces(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).traces;
            break;
          case 'upgrade':
            telemetry.trackCliCommandUpgrade(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).upgrade;
            break;
          case 'version':
            telemetry.trackCliCommandVersion(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).version;
            break;
          case 'webhooks':
            telemetry.trackCliCommandWebhooks(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).webhooks;
            break;
          case 'usage':
            telemetry.trackCliCommandUsage(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).usage;
            break;
          case 'vcr':
            telemetry.trackCliCommandVcr(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).vcr;
            break;
          case 'whoami':
            telemetry.trackCliCommandWhoami(userSuppliedSubCommand);
            func = (await import('./commands-bulk.js')).whoami;
            break;
          default:
            func = null;
            break;
        }

        if (!func || !targetCommand) {
          if (
            !handleCommandTypo({
              command: subcommand,
              availableCommands: commandNames,
            })
          ) {
            output.error(`The ${param(subcommand)} subcommand does not exist`);
          }
          return 1;
        }

        if (func.default) {
          func = func.default;
        }

        if (!telemetryEventStore.hasUserId && !client.authConfig.userId) {
          earlyGetUserPromise = loadCurrentUser(scopeContext, client).catch(
            () => undefined
          );
        }

        resolvedCommand = targetCommand;
        exitCode = await rootSpan
          .child('vc.cli.command', { command: subcommand || 'deploy' })
          .trace(() => func(client, scopeContext));
      }
    } catch (err: unknown) {
      trackAgenticErrorTelemetry(err);

      if (isErrnoException(err) && err.code === 'ENOTFOUND') {
        // Error message will look like the following:
        // "request to https://api.vercel.com/v2/user failed, reason: getaddrinfo ENOTFOUND api.vercel.com"
        const matches = /getaddrinfo ENOTFOUND (.*)$/.exec(err.message || '');
        if (matches && matches[1]) {
          const hostname = matches[1];
          output.error(
            `The hostname ${highlight(
              hostname
            )} could not be resolved. Please verify your internet connectivity and DNS configuration.`
          );
        }
        if (typeof err.stack === 'string') {
          output.debug(err.stack);
        }
        return finishWithExitCode(1);
      }

      if (isErrnoException(err) && err.code === 'ECONNRESET') {
        // Error message will look like the following:
        // request to https://api.vercel.com/v2/user failed, reason: socket hang up
        const matches = /request to https:\/\/(.*?)\//.exec(err.message || '');
        const hostname = matches?.[1];
        if (hostname) {
          output.error(
            `Connection to ${highlight(
              hostname
            )} interrupted. Please verify your internet connectivity and DNS configuration.`
          );
        }
        return finishWithExitCode(1);
      }

      if (
        isErrnoException(err) &&
        (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
      ) {
        output.prettyError(err);
        return finishWithExitCode(1);
      }

      if (err instanceof APIError && 400 <= err.status && err.status <= 499) {
        err.message = err.serverMessage;
        output.prettyError(err);
        return finishWithExitCode(1);
      }

      // If there is a code we should not consider the error unexpected
      // but instead show the message. Any error that is handled by this should
      // actually be handled in the sub command instead. Please make sure
      // that happens for anything that lands here. It should NOT bubble up to here.
      if (isErrnoException(err)) {
        if (typeof err.stack === 'string') {
          output.debug(err.stack);
        }
        output.prettyError(err);
      } else {
        await context.errorReporter.report({ error: err, client });

        // Otherwise it is an unexpected error and we should show the trace
        // and an unexpected error message
        output.error(`An unexpected error occurred in ${subcommand}: ${err}`);
      }

      return finishWithExitCode(1);
    }

    await saveTelemetry();

    rootSpan.stop();

    // Flush trace events to disk. Only `vc build` sets traceDiagnosticsPath,
    // so traces are not written for other commands (deploy, env, etc.).
    if (client.traceDiagnosticsPath) {
      try {
        await mkdir(join(client.traceDiagnosticsPath, '..'), {
          recursive: true,
        });
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
  };

  const exitCode = await run();
  return { exitCode, client, resolvedCommand, isTTY };
}
