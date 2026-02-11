import { isErrnoException, isError, errorToString } from '@vercel/error-utils';

try {
  // Test to see if cwd has been deleted before
  // importing 3rd party packages that might need cwd.
  process.cwd();
} catch (err: unknown) {
  if (isError(err) && err.message.includes('uv_cwd')) {
    // eslint-disable-next-line no-console
    console.error('Error: The current working directory does not exist.');
    process.exit(1);
  }
}

{
  const SILENCED_ERRORS = [
    'DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.',
  ];

  // eslint-disable-next-line no-console
  const originalError = console.error;
  // eslint-disable-next-line no-console
  console.error = (msg: unknown) => {
    const isSilencedError = SILENCED_ERRORS.some(
      error => typeof msg === 'string' && msg.includes(error)
    );
    if (isSilencedError) {
      return;
    }
    originalError(msg);
  };
}

import { join } from 'path';
import { existsSync } from 'fs';
import { mkdirp } from 'fs-extra';
import chalk from 'chalk';
import epipebomb from 'epipebomb';
import getLatestVersion from './util/get-latest-version';
import { URL } from 'url';
import { getSentry } from './util/get-sentry';
import hp from './util/humanize-path';
import { commands, commandNames } from './commands';
import { handleCommandTypo } from './util/handle-command-typo';
import pkg from './util/pkg';
import cmd from './util/output/cmd';
import param from './util/output/param';
import highlight from './util/output/highlight';
import { parseArguments } from './util/get-args';
import getUser from './util/get-user';
import getTeams from './util/teams/get-teams';
import Client from './util/client';
import { printError } from './util/error';
import reportError from './util/report-error';
import getConfig from './util/get-config';
import * as configFiles from './util/config/files';
import getGlobalPathConfig from './util/config/global-path';
import {
  defaultAuthConfig,
  defaultGlobalConfig,
} from './util/config/get-default';
import * as ERRORS from './util/errors-ts';
import { APIError } from './util/errors-ts';
import getUpdateCommand from './util/get-update-command';
import { executeUpgrade } from './util/upgrade';
import { getCommandName, getTitleName } from './util/pkg-name';
import login from './commands/login';
import type { AuthConfig, GlobalConfig } from '@vercel-internals/types';
import type { VercelConfig } from '@vercel/client';
import { Agent as HttpsAgent } from 'https';
import box from './util/output/box';
import { execExtension } from './util/extension/exec';
import { TelemetryEventStore } from './util/telemetry';
import { RootTelemetryClient } from './util/telemetry/root';
import { help } from './args';
import { checkTelemetryStatus } from './util/telemetry/check-status';
import output from './output-manager';
import { checkGuidanceStatus } from './util/guidance/check-status';
import { determineAgent } from '@vercel/detect-agent';

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

/*
  By default, node throws EPIPE errors if process.stdout is being written to
  and a user runs it through a pipe that gets closed while the process is still outputting
  (eg, the simple case of piping a node app through head).

  This suppresses those errors.
*/
epipebomb();

let client: Client;

// Register global error handlers early to catch errors during initialization.
// Sentry is lazily initialized only when an error actually occurs.
const handleRejection = async (err: any) => {
  if (err) {
    if (err instanceof Error) {
      await handleUnexpected(err);
    } else {
      output.error(`An unexpected rejection occurred\n  ${err}`);
      await reportError(getSentry(), client, err);
    }
  } else {
    output.error('An unexpected empty rejection occurred');
  }

  process.exit(1);
};

const handleUnexpected = async (err: Error) => {
  const { message } = err;

  // We do not want to render errors about Sentry not being reachable
  if (message.includes('sentry') && message.includes('ENOTFOUND')) {
    output.debug(`Sentry is not reachable: ${err}`);
    return;
  }

  output.error(`An unexpected error occurred!\n${err.stack}`);
  await reportError(getSentry(), client, err);

  process.exit(1);
};

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

let { isTTY } = process.stdout;

let apiUrl = 'https://api.vercel.com';

const main = async () => {
  if (process.env.FORCE_TTY === '1') {
    isTTY = true;
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
  }

  let parsedArgs;

  try {
    parsedArgs = parseArguments(
      process.argv,
      {
        '--version': Boolean,
        '-v': '--version',
        '--non-interactive': Boolean,
      },
      { permissive: true }
    );
    const isDebugging = parsedArgs.flags['--debug'];
    const isNoColor = parsedArgs.flags['--no-color'];
    output.initialize({
      debug: isDebugging,
      noColor: isNoColor,
    });
  } catch (err: unknown) {
    printError(err);
    return 1;
  }

  const localConfigPath = parsedArgs.flags['--local-config'];
  let localConfig: VercelConfig | Error | undefined =
    await getConfig(localConfigPath);

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
  const targetOrSubcommand = parsedArgs.args[2];
  const subSubCommand = parsedArgs.args[3];

  // If empty, leave this code here for easy adding of beta commands later
  const betaCommands: string[] = ['api', 'curl', 'webhooks'];
  if (betaCommands.includes(targetOrSubcommand)) {
    output.print(
      `${chalk.grey(
        `${getTitleName()} CLI ${pkg.version} | ${chalk.bold(targetOrSubcommand)} is in beta — https://vercel.com/feedback`
      )}\n`
    );
  } else {
    output.print(`${chalk.grey(`${getTitleName()} CLI ${pkg.version}`)}\n`);
  }

  // Handle `--version` directly
  if (!targetOrSubcommand && parsedArgs.flags['--version']) {
    // eslint-disable-next-line no-console
    console.log(pkg.version);
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

  let authConfig: AuthConfig;
  try {
    authConfig = configFiles.readAuthConfigFile();
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      authConfig = defaultAuthConfig;
      try {
        configFiles.writeToAuthConfigFile(authConfig);
      } catch (err: unknown) {
        output.error(
          `An unexpected error occurred while trying to write the auth config to "${hp(
            VERCEL_AUTH_CONFIG_PATH
          )}" ${errorToString(err)}`
        );
        return 1;
      }
    } else {
      output.error(
        `An unexpected error occurred while trying to read the auth config in "${hp(
          VERCEL_AUTH_CONFIG_PATH
        )}" ${errorToString(err)}`
      );
      return 1;
    }
  }

  const telemetryEventStore = new TelemetryEventStore({
    isDebug: process.env.VERCEL_TELEMETRY_DEBUG === '1',
    config: config.telemetry,
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
  telemetry.trackAgenticUse(detectedAgent?.name);
  telemetry.trackCPUs();
  telemetry.trackPlatform();
  telemetry.trackArch();
  telemetry.trackCIVendorName();
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

  if (typeof parsedArgs.flags['--api'] === 'string') {
    apiUrl = parsedArgs.flags['--api'];
  } else if (config && config.api) {
    apiUrl = config.api;
  }

  try {
    new URL(apiUrl);
  } catch (err: unknown) {
    output.error(`Please provide a valid URL instead of ${highlight(apiUrl)}.`);
    return 1;
  }

  // Shared API `Client` instance for all sub-commands to utilize
  // When an agent is detected, --non-interactive is effectively the default
  const nonInteractive = parsedArgs.flags['--non-interactive'] ?? isAgent;

  // Only load proxy-agent if proxy env vars are configured (saves ~60ms startup)
  const agent = hasProxyConfig()
    ? new (await import('proxy-agent')).ProxyAgent({ keepAlive: true })
    : new HttpsAgent({ keepAlive: true });

  client = new Client({
    agent,
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
    const targetPath = join(cwd, targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      commands.has(targetOrSubcommand);

    if (
      targetPathExists &&
      subcommandExists &&
      !parsedArgs.flags['--cwd'] &&
      !process.env.NOW_BUILDER
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
    'telemetry',
    'upgrade',
  ];

  if (process.env.FF_GUIDANCE_MODE) {
    subcommandsWithoutToken.push('guidance');
  }

  // Prompt for login if there is no current token
  if (
    (!authConfig || !authConfig.token) &&
    !client.argv.includes('-h') &&
    !client.argv.includes('--help') &&
    !parsedArgs.flags['--token'] &&
    subcommand &&
    !subcommandsWithoutToken.includes(subcommand)
  ) {
    if (isTTY) {
      output.log(`No existing credentials found. Please log in:`);
      try {
        const result = await login(client, { shouldParseArgs: false });
        // The login function failed, so it returned an exit code
        if (result !== 0) return result;
      } catch (error) {
        printError(error);
        return 1;
      }

      output.debug(`Saved credentials in "${hp(VERCEL_DIR)}"`);
    } else {
      output.prettyError({
        message:
          'No existing credentials found. Please run ' +
          `${getCommandName('login')} or pass ${param('--token')}`,
        link: 'https://err.sh/vercel/no-credentials-found',
      });
      return 1;
    }
  }

  // Check for VERCEL_TOKEN environment variable if --token flag not provided
  if (
    typeof parsedArgs.flags['--token'] !== 'string' &&
    process.env.VERCEL_TOKEN
  ) {
    parsedArgs.flags['--token'] = process.env.VERCEL_TOKEN;
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

    return 1;
  }

  if (typeof parsedArgs.flags['--token'] === 'string') {
    const token: string = parsedArgs.flags['--token'];

    if (token.length === 0) {
      output.prettyError({
        message: `You defined ${param('--token')}, but it's missing a value`,
        link: 'https://err.sh/vercel/missing-token-value',
      });

      return 1;
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

      return 1;
    }

    client.authConfig = { token, skipWrite: true };

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

  if (
    typeof scope === 'string' &&
    targetCommand !== 'login' &&
    targetCommand !== 'build' &&
    !(targetCommand === 'teams' && subSubCommand !== 'invite')
  ) {
    let user = null;

    try {
      user = await getUser(client);
    } catch (err: unknown) {
      if (err instanceof Error) {
        output.debug(err.stack || err.toString());
      }

      if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
        output.prettyError({
          message: `You do not have access to the specified account`,
          link: 'https://err.sh/vercel/scope-not-accessible',
        });

        return 1;
      }

      output.error(
        `Not able to load user because of unexpected error: ${errorToString(err)}`
      );
      return 1;
    }

    if (user.id === scope || user.email === scope || user.username === scope) {
      if (user.version === 'northstar') {
        output.error('You cannot set your Personal Account as the scope.');
        return 1;
      }

      delete client.config.currentTeam;
    } else {
      let teams = [];

      try {
        teams = await getTeams(client);
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === 'not_authorized') {
          output.prettyError({
            message: `You do not have access to the specified team`,
            link: 'https://err.sh/vercel/scope-not-accessible',
          });

          return 1;
        }

        if (isErrnoException(err) && err.code === 'rate_limited') {
          output.prettyError({
            message:
              'Rate limited. Too many requests to the same endpoint: /teams',
          });

          return 1;
        }

        output.error('Not able to load teams');
        return 1;
      }

      const related =
        teams && teams.find(team => team.id === scope || team.slug === scope);

      if (!related) {
        output.prettyError({
          message: 'The specified scope does not exist',
          link: 'https://err.sh/vercel/scope-not-existent',
        });

        return 1;
      }

      client.config.currentTeam = related.id;
    }
  }

  let exitCode;

  try {
    if (!targetCommand) {
      // Set this for the metrics to record it at the end
      targetCommand = parsedArgs.args[2];

      // Try to execute as an extension
      try {
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
        case 'alias':
          telemetry.trackCliCommandAlias(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).alias;
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
        case 'init':
          telemetry.trackCliCommandInit(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).init;
          break;
        case 'cache':
          telemetry.trackCliCommandCache(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).cache;
          break;
        case 'certs':
          telemetry.trackCliCommandCerts(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).certs;
          break;
        case 'curl':
          telemetry.trackCliCommandCurl(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).curl;
          break;
        case 'dns':
          telemetry.trackCliCommandDns(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).dns;
          break;
        case 'domains':
          telemetry.trackCliCommandDomains(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).domains;
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
          if (process.env.FF_GUIDANCE_MODE) {
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
          telemetry.trackCliCommandIntegrationResource(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).integrationResource;
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
        case 'target':
          telemetry.trackCliCommandTarget(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).target;
          break;
        case 'teams':
          telemetry.trackCliCommandTeams(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).teams;
          break;
        case 'telemetry':
          telemetry.trackCliCommandTelemetry(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).telemetry;
          break;
        case 'upgrade':
          telemetry.trackCliCommandUpgrade(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).upgrade;
          break;
        case 'webhooks':
          telemetry.trackCliCommandWebhooks(userSuppliedSubCommand);
          func = (await import('./commands-bulk.js')).webhooks;
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

      exitCode = await func(client);
    }
  } catch (err: unknown) {
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
      return 1;
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
      return 1;
    }

    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      output.prettyError(err);
      return 1;
    }

    if (err instanceof APIError && 400 <= err.status && err.status <= 499) {
      err.message = err.serverMessage;
      output.prettyError(err);
      return 1;
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
      await reportError(getSentry(), client, err);

      // Otherwise it is an unexpected error and we should show the trace
      // and an unexpected error message
      output.error(`An unexpected error occurred in ${subcommand}: ${err}`);
    }

    return 1;
  }

  telemetryEventStore.updateTeamId(client.config.currentTeam);
  await telemetryEventStore.save();

  return exitCode;
};

main()
  .then(async exitCode => {
    const shouldCheckForUpdates =
      !process.env.NO_UPDATE_NOTIFIER && !process.env.VERCEL;

    if (shouldCheckForUpdates) {
      const latest = getLatestVersion({
        pkg,
      });
      if (latest) {
        const changelog = `https://github.com/vercel/vercel/releases/tag/vercel%40${latest}`;

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

          const shouldUpgrade = await client.input.confirm(
            'Would you like to upgrade now?',
            true
          );

          if (shouldUpgrade) {
            const upgradeExitCode = await executeUpgrade();
            process.exitCode = upgradeExitCode;
            return;
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
      }
    }

    process.exitCode = exitCode;
  })
  .catch(handleUnexpected);
