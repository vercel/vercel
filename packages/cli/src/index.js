#!/usr/bin/env node

try {
  // Test to see if cwd has been deleted before
  // importing 3rd party packages that might need cwd.
  process.cwd();
} catch (e) {
  if (e && e.message && e.message.includes('uv_cwd')) {
    console.error('Error! The current working directory does not exist.');
    process.exit(1);
  }
}

import { join } from 'path';
import { existsSync, lstatSync } from 'fs';
import sourceMap from '@zeit/source-map-support';
import { mkdirp } from 'fs-extra';
import chalk from 'chalk';
import epipebomb from 'epipebomb';
import updateNotifier from 'update-notifier';
import { URL } from 'url';
import * as Sentry from '@sentry/node';
import { NowBuildError } from '@vercel/build-utils';
import hp from './util/humanize-path';
import commands from './commands/index.ts';
import pkg from './util/pkg.ts';
import createOutput from './util/output';
import cmd from './util/output/cmd';
import info from './util/output/info';
import error from './util/output/error';
import param from './util/output/param';
import highlight from './util/output/highlight';
import getArgs from './util/get-args';
import getUser from './util/get-user.ts';
import Client from './util/client.ts';
import NowTeams from './util/teams';
import { handleError } from './util/error';
import reportError from './util/report-error';
import getConfig from './util/get-config';
import * as configFiles from './util/config/files';
import getGlobalPathConfig from './util/config/global-path';
import {
  getDefaultConfig,
  getDefaultAuthConfig,
} from './util/config/get-default';
import * as ERRORS from './util/errors-ts';
import { NowError } from './util/now-error';
import { APIError } from './util/errors-ts.ts';
import { SENTRY_DSN } from './util/constants.ts';
import getUpdateCommand from './util/get-update-command';
import { metrics, shouldCollectMetrics } from './util/metrics.ts';
import { getCommandName, getTitleName } from './util/pkg-name.ts';

const isCanary = pkg.version.includes('canary');

// Checks for available update and returns an instance
const notifier = updateNotifier({
  pkg,
  distTag: isCanary ? 'canary' : 'latest',
});

const VERCEL_DIR = getGlobalPathConfig();
const VERCEL_CONFIG_PATH = configFiles.getConfigFilePath();
const VERCEL_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath();

const GLOBAL_COMMANDS = new Set(['help']);

epipebomb();

sourceMap.install();

// Configure the error reporting system
Sentry.init({
  dsn: SENTRY_DSN,
  release: `vercel-cli@${pkg.version}`,
  environment: isCanary ? 'canary' : 'stable',
});

let client;
let debug = () => {};
let apiUrl = 'https://api.vercel.com';

const main = async () => {
  const { isTTY } = process.stdout;

  let argv;

  try {
    argv = getArgs(
      process.argv,
      {
        '--version': Boolean,
        '-v': '--version',
        '--debug': Boolean,
        '-d': '--debug',
      },
      { permissive: true }
    );
  } catch (err) {
    handleError(err);
    return 1;
  }

  const isDebugging = argv['--debug'];
  const output = createOutput({ debug: isDebugging });

  debug = output.debug;

  const localConfigPath = argv['--local-config'];
  const localConfig = await getConfig(output, localConfigPath);

  if (localConfigPath && localConfig instanceof ERRORS.CantFindConfig) {
    output.error(
      `Couldn't find a project configuration file at \n    ${localConfig.meta.paths.join(
        ' or\n    '
      )}`
    );
    return 1;
  }

  if (localConfig instanceof ERRORS.CantParseJSONFile) {
    output.error(`Couldn't parse JSON file ${localConfig.meta.file}.`);
    return 1;
  }

  if (
    (localConfig instanceof NowError || localConfig instanceof NowBuildError) &&
    !(localConfig instanceof ERRORS.CantFindConfig)
  ) {
    output.prettyError(localConfig);
    return 1;
  }

  // Print update information, if available
  if (notifier.update && notifier.update.latest !== pkg.version && isTTY) {
    const { latest } = notifier.update;
    console.log(
      info(
        `${chalk.black.bgCyan('UPDATE AVAILABLE')} ` +
          `Run ${cmd(
            await getUpdateCommand()
          )} to install ${getTitleName()} CLI ${latest}`
      )
    );

    console.log(
      info(
        `Changelog: https://github.com/vercel/vercel/releases/tag/vercel@${latest}`
      )
    );
  }

  // The second argument to the command can be:
  //
  //  * a path to deploy (as in: `vercel path/`)
  //  * a subcommand (as in: `vercel ls`)
  const targetOrSubcommand = argv._[2];

  output.print(
    `${chalk.grey(
      `${getTitleName()} CLI ${pkg.version}${
        targetOrSubcommand === 'dev' ? ' dev (beta)' : ''
      }${
        isCanary || targetOrSubcommand === 'dev'
          ? ' — https://vercel.com/feedback'
          : ''
      }`
    )}\n`
  );

  // Handle `--version` directly
  if (!targetOrSubcommand && argv['--version']) {
    console.log(pkg.version);
    return 0;
  }

  // Ensure that the Vercel global configuration directory exists
  try {
    await mkdirp(VERCEL_DIR);
  } catch (err) {
    console.error(
      error(
        `${
          'An unexpected error occurred while trying to create the ' +
          `global directory "${hp(VERCEL_DIR)}" `
        }${err.message}`
      )
    );
  }

  let migrated = false;
  let configExists;

  try {
    configExists = existsSync(VERCEL_CONFIG_PATH);
  } catch (err) {
    console.error(
      error(
        `${
          'An unexpected error occurred while trying to find the ' +
          `config file "${hp(VERCEL_CONFIG_PATH)}" `
        }${err.message}`
      )
    );

    return 0;
  }

  let config;

  if (configExists) {
    try {
      config = configFiles.readConfigFile();
    } catch (err) {
      console.error(
        error(
          `${
            'An unexpected error occurred while trying to read the ' +
            `config in "${hp(VERCEL_CONFIG_PATH)}" `
          }${err.message}`
        )
      );

      return 1;
    }

    // This is from when Vercel CLI supported
    // multiple providers. In that case, we really
    // need to migrate.
    if (
      config.sh ||
      config.user ||
      typeof config.user === 'object' ||
      typeof config.currentTeam === 'object'
    ) {
      configExists = false;
    }
  }

  if (!configExists) {
    const results = await getDefaultConfig(config);

    config = results.config;
    migrated = results.migrated;

    try {
      configFiles.writeToConfigFile(config);
    } catch (err) {
      console.error(
        error(
          `${
            'An unexpected error occurred while trying to write the ' +
            `default config to "${hp(VERCEL_CONFIG_PATH)}" `
          }${err.message}`
        )
      );

      return 1;
    }
  }

  let authConfigExists;

  try {
    authConfigExists = existsSync(VERCEL_AUTH_CONFIG_PATH);
  } catch (err) {
    console.error(
      error(
        `${
          'An unexpected error occurred while trying to find the ' +
          `auth file "${hp(VERCEL_AUTH_CONFIG_PATH)}" `
        }${err.message}`
      )
    );

    return 1;
  }

  let authConfig = null;

  const subcommandsWithoutToken = ['login', 'logout', 'help', 'init', 'update'];

  if (authConfigExists) {
    try {
      authConfig = configFiles.readAuthConfigFile();
    } catch (err) {
      console.error(
        error(
          `${
            'An unexpected error occurred while trying to read the ' +
            `auth config in "${hp(VERCEL_AUTH_CONFIG_PATH)}" `
          }${err.message}`
        )
      );

      return 1;
    }

    // This is from when Vercel CLI supported
    // multiple providers. In that case, we really
    // need to migrate.
    if (authConfig.credentials) {
      authConfigExists = false;
    }
  } else {
    const results = await getDefaultAuthConfig(authConfig);

    authConfig = results.config;
    migrated = results.migrated;

    try {
      configFiles.writeToAuthConfigFile(authConfig);
    } catch (err) {
      console.error(
        error(
          `${
            'An unexpected error occurred while trying to write the ' +
            `default config to "${hp(VERCEL_AUTH_CONFIG_PATH)}" `
          }${err.message}`
        )
      );
      return 1;
    }
  }

  // Let the user know we migrated the config
  if (migrated) {
    const directory = param(hp(VERCEL_DIR));
    debug(
      `The credentials and configuration within the ${directory} directory were upgraded`
    );
  }

  if (typeof argv['--api'] === 'string') {
    apiUrl = argv['--api'];
  } else if (config && config.api) {
    apiUrl = config.api;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(apiUrl);
  } catch (err) {
    output.error(`Please provide a valid URL instead of ${highlight(apiUrl)}.`);
    return 1;
  }

  // Shared API `Client` instance for all sub-commands to utilize
  client = new Client({
    apiUrl,
    output,
    config,
    authConfig,
    localConfig,
    argv: process.argv,
  });

  let subcommand;

  // Check if we are deploying something
  if (targetOrSubcommand) {
    const targetPath = join(process.cwd(), targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      commands.has(targetOrSubcommand);

    if (targetPathExists && subcommandExists) {
      const fileType = lstatSync(targetPath).isDirectory()
        ? 'subdirectory'
        : 'file';
      const plural = targetOrSubcommand + 's';
      const singular = targetOrSubcommand.endsWith('s')
        ? targetOrSubcommand.slice(0, -1)
        : '';
      let alternative = '';
      if (commands.has(plural)) {
        alternative = plural;
      } else if (commands.has(singular)) {
        alternative = singular;
      }
      console.error(
        error(
          `The supplied argument ${param(targetOrSubcommand)} is ambiguous.` +
            `\nIf you wish to deploy the ${fileType} ${param(
              targetOrSubcommand
            )}, first run "cd ${targetOrSubcommand}". ` +
            (alternative
              ? `\nIf you wish to use the subcommand ${param(
                  targetOrSubcommand
                )}, use ${param(alternative)} instead.`
              : '')
        )
      );
      return 1;
    }

    if (subcommandExists) {
      debug('user supplied known subcommand', targetOrSubcommand);
      subcommand = targetOrSubcommand;
    } else {
      debug('user supplied a possible target for deployment');
      subcommand = 'deploy';
    }
  } else {
    debug('user supplied no target, defaulting to deploy');
    subcommand = 'deploy';
  }

  if (subcommand === 'help') {
    subcommand = argv._[3] || 'deploy';
    client.argv.push('-h');
  }

  // Prompt for login if there is no current token
  if (
    (!authConfig || !authConfig.token) &&
    !client.argv.includes('-h') &&
    !client.argv.includes('--help') &&
    !argv['--token'] &&
    !subcommandsWithoutToken.includes(subcommand)
  ) {
    if (isTTY) {
      output.log(info(`No existing credentials found. Please log in:`));

      subcommand = 'login';
      client.argv[2] = 'login';

      // Ensure that subcommands lead to login as well, if
      // no credentials are defined
      client.argv = client.argv.splice(0, 3);
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

  if (typeof argv['--token'] === 'string' && subcommand === 'switch') {
    console.error(
      error({
        message: `This command doesn't work with ${param(
          '--token'
        )}. Please use ${param('--scope')}.`,
        slug: 'no-token-allowed',
      })
    );

    return 1;
  }

  if (typeof argv['--token'] === 'string') {
    const token = argv['--token'];

    if (token.length === 0) {
      console.error(
        error({
          message: `You defined ${param('--token')}, but it's missing a value`,
          slug: 'missing-token-value',
        })
      );

      return 1;
    }

    const invalid = token.match(/(\W)/g);
    if (invalid) {
      const notContain = Array.from(new Set(invalid)).sort();
      console.error(
        error({
          message: `You defined ${param(
            '--token'
          )}, but its contents are invalid. Must not contain: ${notContain
            .map(c => JSON.stringify(c))
            .join(', ')}`,
          slug: 'invalid-token-value',
        })
      );

      return 1;
    }

    client.authConfig = { token, skipWrite: true };

    // Don't use team from config if `--token` was set
    if (client.config && client.config.currentTeam) {
      delete client.config.currentTeam;
    }
  }

  if (argv['--team']) {
    output.warn(
      `The ${param('--team')} option is deprecated. Please use ${param(
        '--scope'
      )} instead.`
    );
  }

  const {
    authConfig: { token },
  } = client;

  let scope = argv['--scope'] || argv['--team'] || localConfig.scope;

  const targetCommand = commands.get(subcommand);

  if (
    typeof scope === 'string' &&
    targetCommand !== 'login' &&
    targetCommand !== 'dev' &&
    !(targetCommand === 'teams' && argv._[3] !== 'invite')
  ) {
    let user = null;

    try {
      user = await getUser(client);
    } catch (err) {
      if (err.code === 'NOT_AUTHORIZED') {
        console.error(
          error({
            message: `You do not have access to the specified account`,
            slug: 'scope-not-accessible',
          })
        );

        return 1;
      }

      console.error(error('Not able to load user'));
      return 1;
    }

    if (user.uid === scope || user.email === scope || user.username === scope) {
      delete client.config.currentTeam;
    } else {
      let list = [];

      try {
        const teams = new NowTeams({ apiUrl, token, debug: isDebugging });
        list = (await teams.ls()).teams;
      } catch (err) {
        if (err.code === 'not_authorized') {
          console.error(
            error({
              message: `You do not have access to the specified team`,
              slug: 'scope-not-accessible',
            })
          );

          return 1;
        }

        console.error(error('Not able to load teams'));
        return 1;
      }

      const related =
        list && list.find(item => item.id === scope || item.slug === scope);

      if (!related) {
        console.error(
          error({
            message: 'The specified scope does not exist',
            slug: 'scope-not-existent',
          })
        );

        return 1;
      }

      client.config.currentTeam = related.id;
    }
  }

  if (!targetCommand) {
    const sub = param(subcommand);
    console.error(error(`The ${sub} subcommand does not exist`));
    return 1;
  }

  const metric = metrics();
  let exitCode;
  const eventCategory = 'Exit Code';

  try {
    const start = new Date();
    const full = require(`./commands/${targetCommand}`).default;
    exitCode = await full(client);
    const end = new Date() - start;

    if (shouldCollectMetrics) {
      const category = 'Command Invocation';

      metric
        .timing(category, targetCommand, end, pkg.version)
        .event(category, targetCommand, pkg.version)
        .send();
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND') {
      // Error message will look like the following:
      // "request to https://api.vercel.com/www/user failed, reason: getaddrinfo ENOTFOUND api.vercel.com"
      const matches = /getaddrinfo ENOTFOUND (.*)$/.exec(err.message || '');
      if (matches && matches[1]) {
        const hostname = matches[1];
        output.error(
          `The hostname ${highlight(
            hostname
          )} could not be resolved. Please verify your internet connectivity and DNS configuration.`
        );
      }
      output.debug(err.stack);
      return 1;
    }

    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.prettyError(err);
      return 1;
    }

    if (err instanceof APIError && 400 <= err.status && err.status <= 499) {
      err.message = err.serverMessage;
      output.prettyError(err);
      return 1;
    }

    if (shouldCollectMetrics) {
      metric
        .event(eventCategory, '1', pkg.version)
        .exception(err.message)
        .send();
    }

    // If there is a code we should not consider the error unexpected
    // but instead show the message. Any error that is handled by this should
    // actually be handled in the sub command instead. Please make sure
    // that happens for anything that lands here. It should NOT bubble up to here.
    if (err.code) {
      output.debug(err.stack);
      output.prettyError(err);
    } else {
      await reportError(Sentry, client, err);

      // Otherwise it is an unexpected error and we should show the trace
      // and an unexpected error message
      output.error(
        `An unexpected error occurred in ${subcommand}: ${err.stack}`
      );
    }

    return 1;
  }

  if (shouldCollectMetrics) {
    metric.event(eventCategory, `${exitCode}`, pkg.version).send();
  }

  return exitCode;
};

const handleRejection = async err => {
  debug('handling rejection');

  if (err) {
    if (err instanceof Error) {
      await handleUnexpected(err);
    } else {
      console.error(error(`An unexpected rejection occurred\n  ${err}`));
      await reportError(Sentry, client, err);
    }
  } else {
    console.error(error('An unexpected empty rejection occurred'));
  }

  process.exit(1);
};

const handleUnexpected = async err => {
  const { message } = err;

  // We do not want to render errors about Sentry not being reachable
  if (message.includes('sentry') && message.includes('ENOTFOUND')) {
    debug(`Sentry is not reachable: ${err}`);
    return;
  }

  await reportError(Sentry, client, err);

  console.error(error(`An unexpected error occurred!\n${err.stack}`));

  process.exit(1);
};

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

main()
  .then(exitCode => {
    process.exitCode = exitCode;
    process.emit('nowExit');
  })
  .catch(handleUnexpected);
