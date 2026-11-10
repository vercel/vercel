import { isErrnoException, isError, errorToString } from '@vercel/error-utils';

try {
  // Test to see if cwd has been deleted before
  // importing 3rd party packages that might need cwd.
  process.cwd();
} catch (err: unknown) {
  if (isError(err) && err.message.includes('uv_cwd')) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('Error: The current working directory does not exist.');
    process.exit(1);
  }
}

import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { mkdirp } from 'fs-extra';
import chalk from 'chalk';
import semver from 'semver';
import getLatestVersion, {
  fetchLatestVersion,
  updateLatestVersionCache,
} from './util/get-latest-version';
import { URL } from 'url';
import { getSentry } from './util/get-sentry';
import hp from './util/humanize-path';
import { commands, commandsStructs } from './commands';
import { SUBCOMMANDS_WITHOUT_TOKEN } from './util/subcommands-without-token';
import {
  getSchedulesErrorContext,
  isLocalSchedulesCommand,
  isSchedulesCommand,
  parseSchedulesArguments,
} from './util/schedules/local-mode';
import { handleCommandTypo } from './util/handle-command-typo';
import { matchesCliApiTag } from './util/openapi/matches-cli-api-tag';
import pkg from './util/pkg';
import cmd from './util/output/cmd';
import { configureHelpOutput } from './util/output/help-theme';
import param from './util/output/param';
import { warnDeprecatedInput } from './util/warn-deprecated-subcommand';
import highlight from './util/output/highlight';
import { getUsedDeprecatedShorthands, parseArguments } from './util/get-args';
import { getShortFlagLongName } from './util/get-flags-specification';
import {
  findCommandShorthands,
  findHiddenShorthandOption,
} from './util/command-shorthands';
import isOutputDebugEnabled from './util/is-output-debug-enabled';
import getUser from './util/get-user';
import { getWhoamiCachedAnswer } from './commands/whoami/cached';
import { isAppPrincipalEnabled, resolveAppTokenScope } from './util/app';
import getTeams from './util/teams/get-teams';
import getTeamByIdOrSlug from './util/teams/get-team-by-id-or-slug';
import {
  getCachedScopeTeamId,
  setCachedScopeTeamId,
} from './util/teams/scope-team-cache';
import Client, { TEAM_NOT_CHOSEN } from './util/client';
import { setFetchDispatcher } from './util/fetch';
import { printError } from './util/error';
import { installProcessGuards } from './util/install-process-guards';
import {
  attempt,
  captureStdoutErrors,
  createRunTelemetry,
} from './util/telemetry/agent-run';
import {
  getStartupDurationMs,
  toCommandTrace,
} from './util/telemetry/command-trace';
import {
  cliErrorFromUnknown,
  recordCliError,
} from './util/telemetry/cli-error';
import { shouldEmitNonInteractiveCommandError } from './util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from './util/agent-output-constants';
import reportError from './util/report-error';
import {
  exitWithUnexpectedError,
  handleUnexpectedError,
  registerUnexpectedErrorHandlers,
} from './util/unexpected-error';
import earlyGetConfig from './util/get-config';
import * as configFiles from './util/config/files';
import getGlobalPathConfig from './util/config/global-path';
import { getDefaultAuthConfig, defaultGlobalConfig } from '@vercel/cli-config';
import * as ERRORS from './util/errors-ts';
import { APIError } from './util/errors-ts';
import { forgetCachedTeamSlug } from './util/teams/team-name-cache';
import getUpdateCommand from './util/get-update-command';
import { executeAutomaticUpgrade, executeUpgrade } from './util/upgrade';
import { getReleaseNotesUrl } from './util/release-notes-url';
import { runUpdateMaintenance } from './util/run-update-maintenance';
import { scheduleNativeAutoUpdate } from './commands/version/native-auto-update';
import {
  canAutoUpdate,
  hasAutoUpdatePreference,
  isNativeBinaryInstall,
  setAutoUpdate,
} from './util/updates';
import { getCommandNamePlain, getTitleName } from './util/pkg-name';
import { BUILD_LABEL } from './util/constants';
import type {
  AuthConfig,
  GlobalConfig,
  Team,
  User,
} from '@vercel-internals/types';
import type { VercelConfig } from '@vercel/client';
import box from './util/output/box';
import { TelemetryEventStore } from './util/telemetry';
import { RootTelemetryClient } from './util/telemetry/root';
import { shouldStartUserLookupForTelemetry } from './util/telemetry/should-start-user-lookup';
import { readVercelPluginActiveSessionMarker } from './util/telemetry/vercel-plugin';
import { help } from './args';
import {
  asksForVersion,
  deployAcceptsOptions,
  getCommandPathOptions,
  printCommandHelp,
  printGroupHelp,
  printUnknownCommand,
  tokensAfterCommand,
} from './commands/print-command-help';
import { globalCommandOptions } from './util/arg-common';
import { getFalseValueWarnings } from './util/on-off-option';
import { getRootHelpCommands } from './commands/root-help';
import { BETA_COMMANDS } from './util/beta-commands';
import { getDirectBuildFallbackAttributes } from './util/direct-build-fallback';
import { checkTelemetryStatus } from './util/telemetry/check-status';
import output from './output-manager';
import {
  shouldPrintVersionBanner,
  wantsMachineReadableOutput,
} from './util/output-format';
import { checkGuidanceStatus } from './util/guidance/check-status';
import { determineAgent } from '@vercel/detect-agent';
import {
  getLinkFromDir,
  getLinkedProjectIdSync,
  getVercelDirectory,
  hasLocalProjectLink,
} from './util/projects/link';
import {
  getPlatformEnv,
  Span,
  type Reporter,
  type TraceEvent,
} from '@vercel/build-utils';
import { mkdir, writeFile } from 'fs/promises';

const VERCEL_DIR = getGlobalPathConfig();
const VERCEL_CONFIG_PATH = configFiles.getConfigFilePath();
const VERCEL_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath();

const GLOBAL_COMMANDS = new Set(['help']);

// Check if proxy environment variables are configured
function hasProxyConfig(): boolean {
  return [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
    'ALL_PROXY',
    'all_proxy',
  ].some(v => process.env[v]);
}

installProcessGuards();

let client: Client;
let resolvedCommandForUpdate: string | undefined;

// Register global error handlers early to catch errors during initialization.
registerUnexpectedErrorHandlers(() => client);

// Emit plugin hint when running inside Claude Code
if (process.env.CLAUDECODE) {
  process.stderr.write(
    '<claude-code-hint v="1" type="plugin" value="vercel@claude-plugins-official" />\n'
  );
}

// Snapshot before any command has a chance to mutate process.env
const IS_LOCAL_SCHEDULES_COMMAND = isLocalSchedulesCommand(process.argv);
const SHOULD_CHECK_FOR_UPDATES =
  !IS_LOCAL_SCHEDULES_COMMAND &&
  !process.env.NO_UPDATE_NOTIFIER &&
  !process.env.VERCEL;

let { isTTY } = process.stdout;

let apiUrl = 'https://api.vercel.com';

class InMemoryReporter implements Reporter {
  public events: TraceEvent[] = [];
  report(event: TraceEvent) {
    this.events.push(event);
  }
}

const main = async () => {
  const traceReporter = new InMemoryReporter();
  const rootSpan = new Span({
    name: 'vc.cli',
    reporter: traceReporter,
    attrs: getDirectBuildFallbackAttributes(),
  });
  const isTelemetryFlushCommand =
    process.argv[2] === 'telemetry' && process.argv[3] === 'flush';

  if (process.env.FORCE_TTY === '1') {
    isTTY = true;
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
  }

  // A command's own `-d`, as in `flags create checkout -d "Checkout flow"`,
  // isn't `--debug`.
  const commandShorthands = findCommandShorthands(
    commandsStructs,
    process.argv,
    2
  );
  const parseInitialArgs = ({ keepNegations = false } = {}) =>
    IS_LOCAL_SCHEDULES_COMMAND || isSchedulesCommand(process.argv)
      ? parseSchedulesArguments(process.argv)
      : parseArguments(
          process.argv,
          {
            '--version': Boolean,
            '-v': '--version',
            '--changelog': Boolean,
            '--non-interactive': Boolean,
          },
          { permissive: true, keepNegations, commandShorthands }
        );

  const emitSchedulesArgumentError = async (message: string) => {
    if (isSchedulesCommand(process.argv)) {
      const context = getSchedulesErrorContext(process.argv);
      const nonInteractive =
        context.nonInteractive ??
        ((await determineAgent()).isAgent && process.stdin?.isTTY !== true);
      if (nonInteractive) {
        process.stdout.write(
          `${JSON.stringify(
            {
              status: AGENT_STATUS.ERROR,
              reason: AGENT_REASON.INVALID_ARGUMENTS,
              message,
              next: [
                {
                  command: getCommandNamePlain(
                    `schedules${context.local ? ' --local' : ''} --help`
                  ),
                  when: 'Review the supported schedules options',
                },
              ],
            },
            null,
            2
          )}\n`
        );
        return true;
      }
    }
    return false;
  };

  let parsedArgs: ReturnType<typeof parseInitialArgs>;

  try {
    parsedArgs = parseInitialArgs();
    const isDebugging = isOutputDebugEnabled(parsedArgs.flags['--debug']);
    const isNoColor = parsedArgs.flags['--no-color'];
    configureHelpOutput(isNoColor);
    output.initialize({
      debug: isDebugging,
      noColor: isNoColor,
    });
  } catch (err: unknown) {
    // A global option missing its value, such as a bare `--scope`.
    if (
      !(await emitSchedulesArgumentError(
        err instanceof Error ? err.message : String(err)
      ))
    ) {
      printError(err);
    }
    return 2;
  }

  if (
    IS_LOCAL_SCHEDULES_COMMAND &&
    (parsedArgs.flags['--token'] !== undefined ||
      parsedArgs.flags['--scope'] !== undefined ||
      parsedArgs.flags['--team'] !== undefined)
  ) {
    const message =
      "Can't combine `--local` with `--token`, `--scope`, or `--team`. Remove the cloud options to manage local schedules.";
    if (!(await emitSchedulesArgumentError(message))) {
      output.fatal(message);
    }
    return 2;
  }

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

  // The second argument to the command can be:
  //
  //  * a path to deploy (as in: `vercel path/`)
  //  * a subcommand (as in: `vercel ls`)
  const targetOrSubcommand =
    parsedArgs.args[2] ||
    (parsedArgs.flags['--changelog'] ? 'changelog' : undefined);
  const subSubCommand = parsedArgs.args[3];

  // Short build label stamped by CI for non-release builds (e.g. "pr-115"
  // from "pr-115 abc1234"). The full label is shown by `vc --version`.
  const shortBuildLabel = BUILD_LABEL ? ` (${BUILD_LABEL.split(' ')[0]})` : '';
  const versionBanner = isNativeBinaryInstall()
    ? `${getTitleName()} CLI ${pkg.version}${shortBuildLabel}`
    : `${getTitleName()} CLI ${pkg.version}${shortBuildLabel} (Node.js ${process.versions.node})`;
  let msg = versionBanner;
  if (targetOrSubcommand === 'ci') {
    msg = `${versionBanner} | ci is in beta`;
  } else if (targetOrSubcommand && BETA_COMMANDS.has(targetOrSubcommand)) {
    msg = `${versionBanner} | ${targetOrSubcommand} is in beta — https://vercel.com/feedback`;
  }
  if (shouldPrintVersionBanner(targetOrSubcommand, process.argv)) {
    output.print(`${chalk.dim(msg)}\n`);
  }

  // Handle bare `-h` directly
  const bareHelpOption = !targetOrSubcommand && parsedArgs.flags['--help'];
  // `vercel help help` asks about `help` itself, which root help documents.
  const bareHelpSubcommand =
    targetOrSubcommand === 'help' &&
    (!subSubCommand || subSubCommand === 'help');
  if (bareHelpOption || bareHelpSubcommand) {
    process.stdout.write(
      help(getRootHelpCommands(commandsStructs), process.stdout.columns)
    );
    return 0;
  }

  // Handle `--version` directly. `--help` wins when both are given.
  if (!targetOrSubcommand && parsedArgs.flags['--version']) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(pkg.version);
    return 0;
  }

  // Ensure that the Vercel global configuration directory exists
  try {
    await mkdirp(VERCEL_DIR);
  } catch (err: unknown) {
    output.error(
      `An unexpected error occurred while trying to create the global directory "${hp(
        VERCEL_DIR
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
            VERCEL_CONFIG_PATH
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the config in "${hp(
          VERCEL_CONFIG_PATH
        )}" ${errorToString(err)}`
      );
      return 1;
    }
  }

  // Check for explicit tokens before reading persisted credentials so CI/headless
  // usage does not depend on local auth storage such as an OS keyring.
  let tokenSource: 'flag' | 'env' | undefined;
  let explicitToken: string | undefined;
  if (typeof parsedArgs.flags['--token'] === 'string') {
    explicitToken = parsedArgs.flags['--token'];
    tokenSource = 'flag';
  } else if (!IS_LOCAL_SCHEDULES_COMMAND && process.env.VERCEL_TOKEN) {
    explicitToken = process.env.VERCEL_TOKEN;
    tokenSource = 'env';
  }

  let authConfig: AuthConfig;
  if (IS_LOCAL_SCHEDULES_COMMAND || tokenSource) {
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
            VERCEL_AUTH_CONFIG_PATH
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    }
  }

  const telemetryEventStore = new TelemetryEventStore({
    isDebug: process.env.VERCEL_TELEMETRY_DEBUG === '1',
    config: config.telemetry,
    globalConfigDir: VERCEL_DIR,
    cliDevice: isTelemetryFlushCommand
      ? undefined
      : {
          filePath: join(VERCEL_DIR, 'telemetry-device.json'),
        },
    cliSession: isTelemetryFlushCommand
      ? undefined
      : {
          filePath: join(VERCEL_DIR, 'telemetry-session.json'),
        },
  });

  checkTelemetryStatus({
    config,
  });

  if (process.env.FF_GUIDANCE_MODE) {
    checkGuidanceStatus({
      config,
    });
  }

  const telemetry = new RootTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const { isAgent, agent: detectedAgent } = await determineAgent();
  // Agents read output as text, where a spinner is only noise.
  if (isAgent) {
    output.initialize({ hideSpinners: true });
  }
  telemetry.trackInvocationId(telemetryEventStore.currentInvocationId);
  telemetry.trackDeviceId(telemetryEventStore.currentDeviceId);
  const vercelPluginMarker = readVercelPluginActiveSessionMarker();
  if (vercelPluginMarker) {
    telemetry.trackVercelPluginActiveSession();
    telemetry.trackVercelPluginVersion(vercelPluginMarker.pluginVersion);
  }
  telemetry.trackAgenticUse(detectedAgent?.name);
  telemetry.trackCPUs();
  telemetry.trackPlatform();
  telemetry.trackArch();
  telemetry.trackLibc(telemetryEventStore.currentLibc);
  telemetry.trackCliLaunch();
  telemetry.trackCIVendorName();
  telemetry.trackStdinIsTTY(process.stdin?.isTTY === true);
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

  // A thrown error is what ended the command, so it replaces anything printed
  // earlier. These sent their message before printed errors were recorded.
  const trackAgenticErrorTelemetry = (err: unknown) => {
    recordCliError(cliErrorFromUnknown(err, { includeMessage: true }), {
      override: true,
    });
  };

  const runTelemetry = createRunTelemetry({
    isAgent,
    telemetry,
    store: telemetryEventStore,
    getClient: () => client,
    getConfigIdentity: () => ({
      teamId: config.currentTeam,
      userId: authConfig.userId,
    }),
    getProjectId: () =>
      getPlatformEnv('PROJECT_ID') ??
      getLinkedProjectIdSync(
        getVercelDirectory(
          client?.cwd ||
            (typeof parsedArgs.flags['--cwd'] === 'string'
              ? parsedArgs.flags['--cwd']
              : process.cwd())
        )
      ),
  });

  const saveTelemetry = async () => {
    if (runTelemetry.saveStarted) {
      return;
    }

    const postCommandSpan = rootSpan.child('vc.postCommand');

    // `vercel telemetry disable` replaces `client.config` during the run
    if (client) telemetryEventStore.updateConfig(client.config.telemetry);
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
      const envProjectId = getPlatformEnv('PROJECT_ID');
      if (envProjectId) {
        telemetryEventStore.updateProjectId(envProjectId);
      } else {
        const cwdForProjectId =
          client?.cwd ||
          (typeof parsedArgs.flags['--cwd'] === 'string'
            ? parsedArgs.flags['--cwd']
            : process.cwd());
        const link = await getLinkFromDir(getVercelDirectory(cwdForProjectId));
        if (link) {
          telemetryEventStore.updateProjectId(link.projectId);
        }
      }
    } catch {
      // best-effort for telemetry — project may not be linked
    }
    telemetry.trackProjectId(telemetryEventStore.currentProjectId);
    telemetry.trackCliDeprecatedShorthands(getUsedDeprecatedShorthands());

    runTelemetry.markSaveStarted();
    await telemetryEventStore.save();
    postCommandSpan.stop();
  };

  // Set while the command runs, so `process.exit()` mid-command can stop it
  let runningCommandSpan: Span | undefined;
  let startupDurationMs: number | undefined;
  let commandErrorSource: 'caught' | undefined;

  const queueCommandTrace = (
    exitCode: number,
    completion: 'completed' | 'process_exit'
  ) => {
    if (isTelemetryFlushCommand || !resolvedCommandForUpdate) return;
    const event = traceReporter.events.find(e => e.name === 'vc.cli.command');
    if (!event) return;
    telemetryEventStore.setCommandTrace(
      toCommandTrace(event, {
        command: resolvedCommandForUpdate,
        invocationId: telemetryEventStore.currentInvocationId,
        cliVersion: pkg.version,
        releaseChannel: String(semver.prerelease(pkg.version)?.[0] ?? 'stable'),
        isAgent,
        agentName: detectedAgent?.name,
        exitCode,
        completion,
        startupDurationMs,
        errorSource: commandErrorSource,
      }),
      BUILD_LABEL
    );
  };

  const finishWithExitCode = async (code: number) => {
    // Before `trackRunEnd()`, which consumes the recorded error
    queueCommandTrace(code, 'completed');
    runTelemetry.trackRunEnd(code);
    await saveTelemetry();
    return code;
  };

  // `outputAgentError()` and other helpers call `process.exit()` mid-command,
  // which skips `saveTelemetry()` and would drop the whole invocation
  process.once('exit', code => {
    if (!runTelemetry.saveStarted) {
      attempt(() => runningCommandSpan?.stop());
      attempt(() => queueCommandTrace(code, 'process_exit'));
    }
    runTelemetry.flushOnExit(code);
  });

  if (isAgent) {
    // Agents read errors from JSON payloads on stdout, and many commands write
    // those directly instead of through `outputAgentError()`
    captureStdoutErrors(process.stdout);

    // Observes crashes without changing how Node reports them. An error the
    // command already reported wins over a later crash.
    process.on('uncaughtExceptionMonitor', err => {
      recordCliError(cliErrorFromUnknown(err));
    });
  }

  if (
    !IS_LOCAL_SCHEDULES_COMMAND &&
    typeof parsedArgs.flags['--api'] === 'string'
  ) {
    apiUrl = parsedArgs.flags['--api'];
  } else if (!IS_LOCAL_SCHEDULES_COMMAND && config && config.api) {
    apiUrl = config.api;
  }

  try {
    new URL(apiUrl);
  } catch (_err: unknown) {
    output.error(`Please provide a valid URL instead of ${highlight(apiUrl)}.`);
    return finishWithExitCode(1);
  }

  // Shared API `Client` instance for all sub-commands to utilize.
  // Non-interactive when: --non-interactive is set, or agent is detected (and no TTY). Explicit --non-interactive=false or --no-non-interactive overrides agent detection.
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

  // Only load proxy support if proxy env vars are configured (saves startup time).
  if (!IS_LOCAL_SCHEDULES_COMMAND && hasProxyConfig()) {
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
    // `resolve` keeps an absolute path, such as `vercel /abs/dir`, as is.
    const targetPath = resolve(cwd, targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      commands.has(targetOrSubcommand);

    if (
      targetPathExists &&
      subcommandExists &&
      !parsedArgs.flags['--cwd'] &&
      !process.env.NOW_BUILDER &&
      !wantsMachineReadableOutput(targetOrSubcommand, process.argv) &&
      !(await hasLocalProjectLink(client, cwd))
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
        process.env.VERCEL_AUTO_API &&
        (await matchesCliApiTag(targetOrSubcommand))
      ) {
        output.debug(
          `first token "${targetOrSubcommand}" matches an OpenAPI tag; routing to api`
        );
        const tag = targetOrSubcommand;
        const { tryOpenApiFallback } = await import('./util/openapi');
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

  // Set by `vercel help <command>`, whose command token is not argv[2].
  let helpCommandTarget: string | undefined;
  if (subcommand === 'help') {
    telemetry.trackCliCommandHelp('help');
    // `vercel help <dir>` asks about deploying that directory.
    const isDeployPath =
      subSubCommand !== undefined &&
      !commands.has(subSubCommand) &&
      existsSync(resolve(cwd, subSubCommand));
    helpCommandTarget = isDeployPath ? undefined : subSubCommand;
    subcommand = isDeployPath ? 'deploy' : subSubCommand || 'deploy';
    // Rewrite `vercel help <command> ...` as `vercel <command> ... -h`, so a
    // command that renders its own help sees the same argv either way.
    const helpTokenIndex = client.argv.indexOf('help', 2);
    if (helpTokenIndex !== -1) {
      client.argv.splice(helpTokenIndex, 1);
    }
    client.argv.push('-h');
  }

  // Every built-in command answers `--help` the same way: its help page on
  // stdout and exit code 0, or a usage error with exit code 2 when the path
  // names a subcommand that does not exist.
  const helpRequested =
    parsedArgs.args[2] === 'help' || parsedArgs.flags['--help'] === true;
  if (helpRequested) {
    const helpExitCode = printCommandHelp(
      client,
      subcommand,
      tokensAfterCommand(client.argv)
    );
    if (helpExitCode !== undefined) {
      return finishWithExitCode(helpExitCode);
    }
  } else if (
    parsedArgs.flags['--version'] &&
    asksForVersion(
      // An unknown option before any command, as in `vercel --prod`, deploys
      // when deploy takes it.
      subcommand ??
        (targetOrSubcommand?.startsWith('-') &&
        deployAcceptsOptions(client.argv)
          ? 'deploy'
          : undefined),
      client.argv
    )
  ) {
    // `--version` at any depth prints only the version, without running the
    // command.
    client.stdout.write(
      wantsMachineReadableOutput(undefined, client.argv)
        ? `${JSON.stringify({ version: pkg.version })}\n`
        : `${pkg.version}\n`
    );
    return finishWithExitCode(0);
  } else {
    // A group run without a subcommand, such as `vercel env`, shows its help.
    const groupHelpExitCode = printGroupHelp(
      client,
      subcommand,
      tokensAfterCommand(client.argv)
    );
    if (groupHelpExitCode !== undefined) {
      return finishWithExitCode(groupHelpExitCode);
    }
  }

  // The parser reads `--prod=false` as `--prod`, so it turns the option on.
  // Say so before the command runs.
  const commandPathOptions = getCommandPathOptions(
    subcommand,
    tokensAfterCommand(client.argv)
  );
  if (
    commandPathOptions &&
    !wantsMachineReadableOutput(undefined, client.argv)
  ) {
    for (const warning of getFalseValueWarnings(client.argv.slice(2), [
      ...globalCommandOptions,
      ...commandPathOptions,
    ])) {
      output.warning(warning);
    }
  }

  const subcommandsWithoutToken: string[] = [...SUBCOMMANDS_WITHOUT_TOKEN];
  const isPublicDomainsCommand =
    typeof subcommand === 'string' &&
    commands.get(subcommand) === 'domains' &&
    ['check', 'price', 'search'].includes(subSubCommand);

  if (subcommand && isPublicDomainsCommand) {
    subcommandsWithoutToken.push(subcommand);
  }

  if (process.env.FF_GUIDANCE_MODE) {
    subcommandsWithoutToken.push('guidance');
  }

  if (
    subcommand === 'dev' &&
    (client.argv.includes('--local') || client.argv.includes('-L'))
  ) {
    subcommandsWithoutToken.push('dev');
  }

  // An SDK key authenticates the datafile request on its own.
  const isSdkKeyFlagsDatafile =
    subcommand === 'flags' &&
    subSubCommand === 'datafile' &&
    client.argv.some(
      arg => arg === '--sdk-key' || arg.startsWith('--sdk-key=')
    );

  if (
    subcommand === 'flags' &&
    (subSubCommand === 'prepare' || isSdkKeyFlagsDatafile)
  ) {
    subcommandsWithoutToken.push('flags');
  }

  // Writing the bundled agent skill is local and needs no account.
  if (subcommand === 'setup' && subSubCommand === 'skills') {
    subcommandsWithoutToken.push('setup');
  }

  // Apply VERCEL_TOKEN after telemetry so env-provided tokens are not reported
  // as if the user supplied `--token` on the command line.
  if (tokenSource === 'env' && explicitToken) {
    parsedArgs.flags['--token'] = explicitToken;
  }

  // Prompt for login if there is no current token
  // Login prompts wait on the user; keep that time out of startup telemetry.
  let credentialsPromptMs = 0;
  if (
    !IS_LOCAL_SCHEDULES_COMMAND &&
    (!authConfig || !authConfig.token) &&
    !client.argv.includes('-h') &&
    !client.argv.includes('--help') &&
    typeof parsedArgs.flags['--token'] !== 'string' &&
    subcommand &&
    !subcommandsWithoutToken.includes(subcommand)
  ) {
    const { default: promptMissingCredentials } = await import(
      './util/login/prompt-missing-credentials'
    );
    const promptStartedAt = performance.now();
    const result = await promptMissingCredentials(
      client,
      trackAgenticErrorTelemetry
    );
    credentialsPromptMs = performance.now() - promptStartedAt;
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

    return finishWithExitCode(2);
  }

  if (typeof parsedArgs.flags['--token'] === 'string') {
    const token: string = parsedArgs.flags['--token'];

    if (token.length === 0) {
      output.prettyError({
        message: `You defined ${param('--token')}, but it's missing a value`,
        link: 'https://err.sh/vercel/missing-token-value',
      });

      return finishWithExitCode(2);
    }

    const invalid = token.match(/(\W)/g);
    if (invalid) {
      const notContain = Array.from(new Set(invalid)).sort();
      // `-t` is always `--token`, even where it was once the command's own
      // letter, like `--content-type` in `blob put`.
      const hiddenOption = findHiddenShorthandOption(
        commandsStructs,
        client.argv,
        '-t',
        2
      );
      output.prettyError({
        message: `You defined ${param(
          '--token'
        )}, but its contents are invalid. Must not contain: ${notContain
          .map(c => JSON.stringify(c))
          .join(', ')}${
          hiddenOption
            ? `\nTo set the ${hiddenOption.name.replace(/-/g, ' ')}, use ${param(
                `--${hiddenOption.name}`
              )}.`
            : ''
        }`,
        link: 'https://err.sh/vercel/invalid-token-value',
      });

      return finishWithExitCode(2);
    }

    client.authConfig = { token, skipWrite: true, tokenSource };

    // Don't use team from config if `--token` was set
    if (client.config && client.config.currentTeam) {
      delete client.config.currentTeam;
    }
  }

  if (parsedArgs.flags['--team']) {
    warnDeprecatedInput(client, '--team', '--scope');
  }

  let targetCommand =
    typeof subcommand === 'string' ? commands.get(subcommand) : undefined;
  const scope =
    parsedArgs.flags['--scope'] ||
    parsedArgs.flags['--team'] ||
    localConfig?.scope;
  const separatorIndex = client.argv.indexOf('--');
  const cliArgs =
    separatorIndex === -1 ? client.argv : client.argv.slice(0, separatorIndex);
  const buildNeedsRemoteProjectScope =
    targetCommand === 'build' &&
    cliArgs.some(
      arg =>
        arg === '--project' ||
        arg.startsWith('--project=') ||
        getShortFlagLongName(arg) === '--project'
    );

  if (
    !IS_LOCAL_SCHEDULES_COMMAND &&
    typeof scope === 'string' &&
    (!isPublicDomainsCommand || client.authConfig.token) &&
    (!isSdkKeyFlagsDatafile || client.authConfig.token) &&
    targetCommand !== 'login' &&
    targetCommand !== 'signup' &&
    // Feedback uses locally known context without resolving an authenticated team.
    targetCommand !== 'feedback' &&
    // Health reads the public status page and must work when auth is broken.
    targetCommand !== 'health' &&
    (targetCommand !== 'build' || buildNeedsRemoteProjectScope) &&
    targetCommand !== 'sandbox' &&
    // `whoami --cached` prints the saved username, which the scope doesn't
    // change, so it answers without resolving the scope over the network.
    !(
      targetCommand === 'whoami' &&
      getWhoamiCachedAnswer(cliArgs, client.authConfig)
    )
  ) {
    // The team on disk before this invocation's scope is applied; the cache
    // write below must not persist the per-invocation override.
    const persistedTeamId = client.config.currentTeam;

    // This scope string previously resolved to a team on this machine. Team
    // ids are immutable and access is enforced server-side, so reuse the
    // cached resolution instead of the user/teams lookups.
    const cachedTeamId = getCachedScopeTeamId(client.config, scope);

    if (cachedTeamId) {
      client.config.currentTeam = cachedTeamId;
    } else {
      let user = null;

      try {
        user = await getUser(client);
        telemetryEventStore.updateUserId(user.id);
      } catch (err: unknown) {
        if (err instanceof Error) {
          output.debug(err.stack || err.toString());
        }

        // App tokens cannot fetch the user; resolve the scope against the
        // token's own team instead.
        const appTokenScopeResolved =
          isErrnoException(err) &&
          err.code === 'NOT_AUTHORIZED' &&
          isAppPrincipalEnabled() &&
          (await resolveAppTokenScope(client, scope));

        if (!appTokenScopeResolved) {
          if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
            output.prettyError({
              message: `You do not have access to the specified account`,
              link: 'https://err.sh/vercel/scope-not-accessible',
            });

            trackAgenticErrorTelemetry(err);
            return finishWithExitCode(1);
          }

          output.error(
            `Not able to load user because of unexpected error: ${errorToString(err)}`
          );
          trackAgenticErrorTelemetry(err);
          return finishWithExitCode(1);
        }
      }

      if (user) {
        const scopeMatchesUserIdentity =
          user.id === scope || user.email === scope || user.username === scope;

        // A scope string can be ambiguous: a Northstar user's username may
        // also be the slug of a team they own (the team backing their default
        // scope). In that case the team must win. Otherwise the user could
        // not target the team by name because the personal account check
        // would reject it. Resolve the scope directly first: `GET
        // /teams/:idOrSlug` covers both direct and virtual memberships, so a
        // hit is decisive and skips the full team-list fetch.
        let related: Team | undefined;

        try {
          related = await getTeamByIdOrSlug(client, scope, {
            useCurrentTeam: false,
          });
        } catch (err: unknown) {
          output.debug(
            `Direct team lookup for scope "${scope}" failed: ${errorToString(err)}`
          );
        }

        if (!related) {
          let teams: Team[] = [];

          try {
            teams = await getTeams(client);
          } catch (err: unknown) {
            // If the scope clearly refers to the user's own identity we don't
            // need the teams list to resolve it, so swallow any failure and
            // fall through to personal-account handling. Otherwise the teams
            // list is required, so surface the error.
            if (scopeMatchesUserIdentity) {
              output.debug(
                `Ignoring failure to load teams; scope matches the current user's identity`
              );
            } else if (isErrnoException(err) && err.code === 'not_authorized') {
              output.prettyError({
                message: `You do not have access to the specified team`,
                link: 'https://err.sh/vercel/scope-not-accessible',
              });

              trackAgenticErrorTelemetry(err);
              return finishWithExitCode(1);
            } else if (isErrnoException(err) && err.code === 'rate_limited') {
              output.prettyError({
                message:
                  'Rate limited. Too many requests to the same endpoint: /teams',
              });

              trackAgenticErrorTelemetry(err);
              return finishWithExitCode(1);
            } else {
              output.error('Not able to load teams');
              trackAgenticErrorTelemetry(err);
              return finishWithExitCode(1);
            }
          }

          related = teams.find(
            team => team.id === scope || team.slug === scope
          );
        }

        if (related) {
          client.config.currentTeam = related.id;
          setCachedScopeTeamId(client, scope, related.id, persistedTeamId);
        } else if (scopeMatchesUserIdentity) {
          if (user.version === 'northstar') {
            output.error('You cannot set your Personal Account as the scope.');
            return finishWithExitCode(1);
          }

          delete client.config.currentTeam;
        } else {
          output.prettyError({
            message: 'The specified scope does not exist',
            link: 'https://err.sh/vercel/scope-not-existent',
          });

          return finishWithExitCode(1);
        }
      }
    }
  }

  // Agents that can't prompt never use the team saved for the human by
  // `vc switch` or login. Without `--scope`, the team comes from
  // `VERCEL_ORG_ID`, a link, or the credential's only team (see
  // `Client.chooseTeam`). Public domain lookups send no team at all.
  if (
    client.ignoresSavedTeam &&
    typeof scope !== 'string' &&
    targetCommand !== 'login' &&
    targetCommand !== 'logout' &&
    targetCommand !== 'signup'
  ) {
    client.config.currentTeam = isPublicDomainsCommand
      ? undefined
      : TEAM_NOT_CHOSEN;
  }

  let exitCode;

  try {
    if (!targetCommand) {
      // Set this for the metrics to record it at the end
      targetCommand = helpCommandTarget ?? parsedArgs.args[2];

      // Try to execute as an extension
      try {
        const { execExtension } = await import('./util/extension/exec');
        // An extension gets a `--no-x` typed after its name, such as
        // `--no-debug`, as typed, though the CLI reads it as a negation.
        const typedArgs = parseInitialArgs({ keepNegations: true }).args;
        const commandIndex = typedArgs.indexOf(
          targetCommand,
          helpCommandTarget ? 3 : 2
        );
        const extensionArgs =
          commandIndex === -1
            ? parsedArgs.args.slice(helpCommandTarget ? 4 : 3)
            : typedArgs.slice(commandIndex + 1);
        exitCode = await execExtension(
          client,
          targetCommand,
          helpCommandTarget ? [...extensionArgs, '--help'] : extensionArgs,
          cwd
        );
        telemetry.trackCliExtension();
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === 'ENOENT') {
          // Check if the user made a typo before falling back to deploy
          if (
            handleCommandTypo({
              client,
              command: targetCommand,
              availableCommands: commandsStructs,
            })
          ) {
            return finishWithExitCode(2);
          }
          // Help for something that is neither a command, an extension, nor
          // a directory to deploy.
          if (helpRequested) {
            printUnknownCommand(client, targetCommand);
            return finishWithExitCode(2);
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
        case 'project':
          telemetry.trackCliCommandProject(userSuppliedSubCommand);
          func = (await import('./commands/project/index.js')).default;
          break;

        // Non-priority commands - loaded from command groups (see
        // COMMAND_GROUPS in scripts/build.mjs)
        case 'agent':
          telemetry.trackCliCommandAgent(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).agent;
          break;
        case 'agent-runs':
          telemetry.trackCliCommandAgentRuns(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).agentRuns;
          break;
        case 'ai-gateway':
          telemetry.trackCliCommandAiGateway(userSuppliedSubCommand);
          func = (await import('./commands-ai.js')).aiGateway;
          break;
        case 'token-pass':
          telemetry.trackCliCommandTokenPass(userSuppliedSubCommand);
          func = (await import('./commands-ai.js')).tokenPass;
          break;
        case 'alias':
          telemetry.trackCliCommandAlias(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).alias;
          break;
        case 'activity':
          telemetry.trackCliCommandActivity(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).activity;
          break;
        case 'alerts':
          telemetry.trackCliCommandAlerts(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).alerts;
          break;
        case 'api':
          telemetry.trackCliCommandApi(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).api;
          break;
        case 'bisect':
          telemetry.trackCliCommandBisect(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).bisect;
          break;
        case 'blob':
          telemetry.trackCliCommandBlob(userSuppliedSubCommand);
          func = (await import('./commands-blob.js')).blob;
          break;
        case 'budgets':
          telemetry.trackCliCommandBudgets(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).budget;
          break;
        case 'builders':
          func = (await import('./commands-core.js')).builders;
          break;
        case 'buy':
          telemetry.trackCliCommandBuy(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).buy;
          break;
        case 'init':
          telemetry.trackCliCommandInit(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).init;
          break;
        case 'cache':
          telemetry.trackCliCommandCache(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).cache;
          break;
        case 'connect':
          telemetry.trackCliCommandConnex(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js')).connex;
          break;
        case 'contract':
          telemetry.trackCliCommandContract(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).contract;
          break;
        case 'certs':
          telemetry.trackCliCommandCerts(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).certs;
          break;
        case 'ci':
          telemetry.trackCliCommandCi(userSuppliedSubCommand);
          func = (await import('./commands-observability.js')).ci;
          break;
        case 'changelog':
          telemetry.trackCliCommandChangelog(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).changelog;
          break;
        case 'comments':
          telemetry.trackCliCommandComments(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).comments;
          break;
        case 'crons':
        case 'cron':
          telemetry.trackCliCommandCrons(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).crons;
          break;
        case 'curl':
          telemetry.trackCliCommandCurl(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).curl;
          break;
        case 'daemons':
          telemetry.trackCliCommandDaemons(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).daemons;
          break;
        case 'dns':
          telemetry.trackCliCommandDns(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).dns;
          break;
        case 'deploy-hooks':
        case 'deploy-hook':
          telemetry.trackCliCommandDeployHooks(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).deployHooks;
          break;
        case 'global-config':
          telemetry.trackCliCommandGlobalConfig(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).globalConfig;
          break;
        case 'domains':
          telemetry.trackCliCommandDomains(userSuppliedSubCommand);
          func = (await import('./commands-ai.js')).domains;
          break;
        case 'drains':
          telemetry.trackCliCommandDrains(userSuppliedSubCommand);
          func = (await import('./commands-observability.js')).drains;
          break;
        case 'experiments':
          telemetry.trackCliCommandExperiments(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).experiments;
          break;
        case 'feedback':
          telemetry.trackCliCommandFeedback(userSuppliedSubCommand);
          func = (await import('./commands-flags.js')).feedback;
          break;
        case 'firewall':
          telemetry.trackCliCommandFirewall(userSuppliedSubCommand);
          func = (await import('./commands-flags.js')).firewall;
          break;
        case 'flags':
          telemetry.trackCliCommandFlags(userSuppliedSubCommand);
          func = (await import('./commands-flags.js')).flags;
          break;
        case 'git':
          telemetry.trackCliCommandGit(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).git;
          break;
        case 'guidance':
          if (process.env.FF_GUIDANCE_MODE) {
            telemetry.trackCliCommandGuidance(userSuppliedSubCommand);
            func = (await import('./commands-core.js')).guidance;
            break;
          } else {
            func = null;
            break;
          }
        case 'health':
          telemetry.trackCliCommandHealth(userSuppliedSubCommand);
          func = (await import('./commands-observability.js')).health;
          break;
        case 'httpstat':
          telemetry.trackCliCommandHttpstat(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).httpstat;
          break;
        case 'install':
          telemetry.trackCliCommandInstall(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js')).install;
          break;
        case 'integration':
          telemetry.trackCliCommandIntegration(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js')).integration;
          break;
        case 'integration-resource':
          telemetry.trackCliCommandIntegrationResource(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js'))
            .integrationResource;
          break;
        case 'kms':
          telemetry.trackCliCommandKms(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).kms;
          break;
        case 'mcp':
          func = (await import('./commands-core.js')).mcp;
          break;
        case 'logout':
          telemetry.trackCliCommandLogout(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).logout;
          break;
        case 'login':
          telemetry.trackCliCommandLogin(userSuppliedSubCommand);
          func = (c: Client) =>
            import('./commands-core.js').then(m =>
              m.login(c, { shouldParseArgs: true })
            );
          break;
        case 'inspect':
          telemetry.trackCliCommandInspect(userSuppliedSubCommand);
          func = (await import('./commands-deployments.js')).inspect;
          break;
        case 'logs':
          telemetry.trackCliCommandLogs(userSuppliedSubCommand);
          func = (await import('./commands-deployments.js')).logs;
          break;
        case 'metrics':
          telemetry.trackCliCommandMetrics(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).metrics;
          break;
        case 'microfrontends':
          telemetry.trackCliCommandMicrofrontends(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).microfrontends;
          break;
        case 'monitors':
          telemetry.trackCliCommandMonitors(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).monitors;
          break;
        case 'open':
          telemetry.trackCliCommandOpen(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).open;
          break;
        case 'organizations':
          telemetry.trackCliCommandOrganizations(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).organizations;
          break;
        case 'pricing':
          telemetry.trackCliCommandPricing(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).pricing;
          break;
        case 'promote':
          telemetry.trackCliCommandPromote(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).promote;
          break;
        case 'pull':
          telemetry.trackCliCommandPull(userSuppliedSubCommand);
          func = (await import('./commands-observability.js')).pull;
          break;
        case 'redeploy':
          telemetry.trackCliCommandRedeploy(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).redeploy;
          break;
        case 'redirects':
          telemetry.trackCliCommandRedirects(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).redirects;
          break;
        case 'routes':
          telemetry.trackCliCommandRoutes(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).routes;
          break;
        case 'remove':
          telemetry.trackCliCommandRemove(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).remove;
          break;
        case 'rollback':
          telemetry.trackCliCommandRollback(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).rollback;
          break;
        case 'rr':
        case 'release':
        case 'rolling-release':
          telemetry.trackCliCommandRollingRelease(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).rollingRelease;
          break;
        case 'sandbox':
          telemetry.trackCliCommandSandbox(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).sandbox;
          break;
        case 'schedules':
          telemetry.trackCliCommandSchedules(userSuppliedSubCommand);
          func = (await import('./commands-routing.js')).schedules;
          break;
        case 'security':
          telemetry.trackCliCommandSecurity(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).security;
          break;
        case 'signup':
          telemetry.trackCliCommandSignup(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).signup;
          break;
        case 'skills':
          telemetry.trackCliCommandSkills(userSuppliedSubCommand);
          func = (await import('./commands-blob.js')).skills;
          break;
        case 'setup':
          telemetry.trackCliCommandSetup(userSuppliedSubCommand);
          func = (await import('./commands-ai.js')).setup;
          break;
        case 'storage':
          telemetry.trackCliCommandStorage(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js')).storage;
          break;
        case 'environments':
          telemetry.trackCliCommandEnvironments(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).target;
          break;
        case 'teams':
          telemetry.trackCliCommandTeams(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).teams;
          break;
        case 'tokens':
          telemetry.trackCliCommandTokens(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).tokens;
          break;
        case 'telemetry':
          telemetry.trackCliCommandTelemetry(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).telemetry;
          break;
        case 'traces':
          telemetry.trackCliCommandTraces(userSuppliedSubCommand);
          func = (await import('./commands-observability.js')).traces;
          break;
        case 'upgrade':
          telemetry.trackCliCommandUpgrade(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).upgrade;
          break;
        case 'version':
          telemetry.trackCliCommandVersion(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).version;
          break;
        case 'webhooks':
          telemetry.trackCliCommandWebhooks(userSuppliedSubCommand);
          func = (await import('./commands-account.js')).webhooks;
          break;
        case 'usage':
          telemetry.trackCliCommandUsage(userSuppliedSubCommand);
          func = (await import('./commands-integrations.js')).usage;
          break;
        case 'vcr':
          telemetry.trackCliCommandVcr(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).vcr;
          break;
        case 'whoami':
          telemetry.trackCliCommandWhoami(userSuppliedSubCommand);
          func = (await import('./commands-core.js')).whoami;
          break;
        default:
          func = null;
          break;
      }

      if (!func || !targetCommand) {
        if (
          !handleCommandTypo({
            client,
            command: subcommand,
            availableCommands: commandsStructs,
          })
        ) {
          output.error(`The ${param(subcommand)} subcommand does not exist`);
        }
        return finishWithExitCode(2);
      }

      if (func.default) {
        func = func.default;
      }

      if (
        !IS_LOCAL_SCHEDULES_COMMAND &&
        // Feedback and health must remain usable when the caller's credentials
        // are broken.
        targetCommand !== 'feedback' &&
        targetCommand !== 'health' &&
        shouldStartUserLookupForTelemetry({
          authConfig: client.authConfig,
          hasTelemetryUserId: telemetryEventStore.hasUserId,
        })
      ) {
        earlyGetUserPromise = getUser(client).catch(() => undefined);
      }

      resolvedCommandForUpdate = targetCommand;
      startupDurationMs = getStartupDurationMs(credentialsPromptMs);
      runningCommandSpan = rootSpan.child('vc.cli.command', {
        command: subcommand || 'deploy',
      });
      try {
        exitCode = await runningCommandSpan.trace(() => func(client));
      } finally {
        runningCommandSpan = undefined;
      }
    }
  } catch (err: unknown) {
    commandErrorSource = 'caught';
    trackAgenticErrorTelemetry(err);

    // A refused request may mean access to the current team was lost. Drop
    // its saved display name so the next run looks the team up again.
    if (
      err instanceof APIError &&
      err.status === 403 &&
      client.config.currentTeam
    ) {
      forgetCachedTeamSlug(client, client.config.currentTeam);
    }

    // An unknown option, an option missing its value, or an option given
    // together with its `--no-` form is a usage error.
    const isUsageError =
      isError(err) &&
      'code' in err &&
      (err.code === 'ARG_UNKNOWN_OPTION' ||
        err.code === 'ARG_MISSING_REQUIRED_LONGARG' ||
        err.code === 'ARG_MISSING_REQUIRED_SHORTARG' ||
        err.code === 'ARG_CONFLICTING_OPTIONS');

    if (
      shouldEmitNonInteractiveCommandError(client) &&
      ((isError(err) && 'status' in err) || isUsageError)
    ) {
      printError(err, client);
      return finishWithExitCode(isUsageError ? 2 : 1);
    }

    if (isUsageError) {
      printError(err, client);
      return finishWithExitCode(2);
    }

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
      await reportError(await getSentry(), client, err);

      // Otherwise it is an unexpected error and we should show the trace
      // and an unexpected error message
      output.error(`An unexpected error occurred in ${subcommand}: ${err}`);
    }

    return finishWithExitCode(1);
  }

  await finishWithExitCode(exitCode ?? 0);

  rootSpan.stop();

  // Flush trace events to disk. Only `vc build` sets traceDiagnosticsPath,
  // so traces are not written for other commands (deploy, env, etc.).
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
};

// Start the CLI update check early so the fresh registry lookup runs in
// parallel with the command, avoiding any perceived delay when the
// command finishes and the update prompt needs to appear.
//
// The notification is NOT consumed here so that if the command crashes, the
// notification cycle is preserved for the next run.
let cachedLatest: string | undefined;
let freshLookupPromise: Promise<string | undefined> | undefined;

if (SHOULD_CHECK_FOR_UPDATES && !isNativeBinaryInstall()) {
  cachedLatest = getLatestVersion({ pkg, consumeNotification: false });
  if (cachedLatest) {
    output.debug('Update may be available, fetching fresh version...');
    freshLookupPromise = fetchLatestVersion({
      name: pkg.name,
      timeout: 3000,
    }).catch(() => undefined);
  }
}

/**
 * Prompts the user to upgrade now and, if they accept, runs the upgrade
 * and optionally asks about enabling automatic updates.
 *
 * @returns The upgrade exit code if the user accepted, otherwise `undefined`.
 */
async function promptAndUpgrade(
  client: Client,
  targetVersion?: string
): Promise<number | undefined> {
  try {
    const shouldUpgrade = await client.input.confirm(
      'Would you like to upgrade now?',
      true
    );

    if (!shouldUpgrade) return;

    const upgradeExitCode = await executeUpgrade(targetVersion, client);
    if (upgradeExitCode === 0 && !hasAutoUpdatePreference(client.config)) {
      const enableAutoUpdates = await client.input.confirm(
        'Enable automatic CLI updates for future releases?',
        false
      );
      setAutoUpdate(client, enableAutoUpdates);
    }
    return upgradeExitCode;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('User force closed the prompt')
    ) {
      // User pressed Ctrl+C to dismiss the prompt
      return;
    }
    throw err;
  }
}

async function runPostCommandUpdates(exitCode: number | undefined) {
  const originalExitCode = typeof exitCode === 'number' ? exitCode : 0;
  if (
    SHOULD_CHECK_FOR_UPDATES &&
    isNativeBinaryInstall() &&
    resolvedCommandForUpdate !== 'version'
  ) {
    scheduleNativeAutoUpdate(client, originalExitCode);
  }

  // Skip the Node.js update notification after `vc upgrade`: the process still
  // has the pre-upgrade version in memory, so it would prompt the user to
  // upgrade again right after the upgrade completed.
  if (cachedLatest && resolvedCommandForUpdate !== 'upgrade') {
    // Await the fresh registry lookup to verify the exact version before
    // presenting it. This is needed for both the auto-update and interactive paths.
    const fresh = freshLookupPromise ? await freshLookupPromise : undefined;
    output.debug(`Fresh lookup result: ${fresh ?? 'failed'}`);

    let latest: string | undefined;
    let userUpToDate = false;

    if (fresh) {
      updateLatestVersionCache({ name: pkg.name, version: fresh });

      if (semver.lt(pkg.version, fresh)) {
        latest = fresh;
      } else {
        // Cache was stale, user is already on the latest version
        userUpToDate = true;
      }
    }

    // Consume the notification cycle now that the command has completed
    // and we've determined the update status. If the command had crashed,
    // this code never runs and the notification is preserved for next time.
    getLatestVersion({ pkg });

    if (
      !userUpToDate &&
      (await canAutoUpdate(client, originalExitCode, resolvedCommandForUpdate))
    ) {
      const upgradeExitCode = await executeAutomaticUpgrade(client);
      if (upgradeExitCode !== 0) {
        output.log(
          `Automatic update failed. Continuing with original exit code ${originalExitCode}.`
        );
      }
      return originalExitCode;
    }

    if (latest) {
      const changelog = getReleaseNotesUrl(latest);

      if (isTTY) {
        // Interactive mode: prompt user to update now
        const errorMsg =
          exitCode && exitCode !== 2
            ? chalk.magenta(
                ` The latest update ${chalk.italic(
                  'may'
                )} fix any errors that occurred.`
              )
            : '';

        output.print(
          `\nUpdate available for Vercel CLI (${chalk.gray(
            `v${pkg.version}`
          )} → ${chalk.green(`v${latest}`)})${errorMsg}\n`
        );
        output.print(
          `Changelog: ${output.link(changelog, changelog, { fallback: false })}\n`
        );

        const upgradeExitCode = await promptAndUpgrade(client, latest);
        if (upgradeExitCode !== undefined) {
          return upgradeExitCode;
        }
      } else {
        const errorMsg =
          exitCode && exitCode !== 2
            ? chalk.magenta(
                `\n\nThe latest update ${chalk.italic(
                  'may'
                )} fix any errors that occurred.`
              )
            : '';
        output.print(
          box(
            `Update available! ${chalk.gray(`v${pkg.version}`)} ≫ ${chalk.green(
              `v${latest}`
            )}
Changelog: ${output.link(changelog, changelog, { fallback: false })}
Run ${chalk.cyan(cmd(await getUpdateCommand()))} to update.${errorMsg}`
          )
        );
        output.print('\n');
      }
      // If the fresh lookup failed we don't show the exact version.
    } else if (!fresh) {
      // Fresh lookup failed — show a generic update message without
      // naming a specific version, since the cached version may be stale.
      if (isTTY) {
        output.print('\nA newer version of Vercel CLI may be available.\n');

        const upgradeExitCode = await promptAndUpgrade(client);
        if (upgradeExitCode !== undefined) {
          return upgradeExitCode;
        }
      } else {
        output.print(
          box(
            `A newer version of Vercel CLI may be available.
Run ${chalk.cyan(cmd(await getUpdateCommand()))} to update.`
          )
        );
        output.print('\n');
      }
    }
    // else: userUpToDate — skip notification silently
  }

  return exitCode;
}

async function runFirstRunPluginOffer(exitCode: number | undefined) {
  // Only a config created for a first-time user has `usedBefore: false`, so
  // every other run skips this without loading the offer.
  if (client?.config.usedBefore !== false) {
    return;
  }
  try {
    const { offerVercelPluginToNewUser } = await import(
      './util/agent/plugin-offer.js'
    );
    await offerVercelPluginToNewUser(
      client,
      exitCode,
      resolvedCommandForUpdate
    );
  } catch (err: unknown) {
    output.stopSpinner();
    output.debug(`Vercel plugin offer failed: ${errorToString(err)}`);
  }
}

export const cliPromise = main()
  .then(async exitCode => {
    await runFirstRunPluginOffer(exitCode);
    const finalExitCode = await runUpdateMaintenance(exitCode, () =>
      runPostCommandUpdates(exitCode)
    );
    process.exitCode = finalExitCode;
    return finalExitCode;
  })
  .catch(async error => {
    recordCliError(cliErrorFromUnknown(error));
    await handleUnexpectedError(client, error);
    await exitWithUnexpectedError(error);
  });
