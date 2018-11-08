#!/usr/bin/env node
//@flow

// This should be automatically included by @babel/preset-env but it's
// not being load right now. We have to remove it once it's fixed
require('core-js/modules/es7.symbol.async-iterator');

// we only enable source maps while developing, since
// they have a small performance hit. for this, we
// look for `pkg`, which is only present in the final bin
// $FlowFixMe
if (!process.pkg) {
  require('@zeit/source-map-support').install();
}

// fix for EPIPE when piping to a truncated pipe
require('epipebomb')();

// Native
const { join } = require('path');

// Packages
const debug = require('debug')('now:main');
const { existsSync } = require('fs');
const mkdirp = require('mkdirp-promise');
const chalk = require('chalk');
const checkForUpdate = require('update-check');
const ms = require('ms');

// Utilities
const error = require('./util/output/error');
const param = require('./util/output/param');
const info = require('./util/output/info');
const getNowDir = require('./util/config/global-path');
const { getDefaultConfig,  getDefaultAuthConfig } = require('./util/config/get-default');
const hp = require('./util/humanize-path');
const commands = require('./commands');
const configFiles = require('./util/config/files');
const pkg = require('./util/pkg');
const getUser = require('./util/get-user');
const NowTeams = require('./util/teams');

import { Output } from './util/types';
import createOutput from './util/output';
import getArgs from './util/get-args';

const NOW_DIR = getNowDir();
const NOW_CONFIG_PATH = configFiles.getConfigFilePath();
const NOW_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath();

const GLOBAL_COMMANDS = new Set(['help']);

const main = async argv_ => {
  // $FlowFixMe
  const { isTTY } = process.stdout;

  const argv = getArgs(
    argv_,
    {
      '--version': Boolean,
      '-v': '--version',
      '--debug': Boolean,
      '-d': '--debug'
    },
    { permissive: true }
  );

  const isDebugging = argv['--debug'];
  const output: Output = createOutput({ debug: isDebugging });

  let update = null;

  try {
    update = await checkForUpdate(pkg, {
      interval: ms('1d'),
      distTag: pkg.version.includes('canary') ? 'canary' : 'latest'
    });
  } catch (err) {
    console.error(
      error(`Checking for updates failed${isDebugging ? ':' : ''}`)
    );

    if (isDebugging) {
      console.error(err);
    }
  }

  if (update && isTTY) {
    console.log(
      info(
        `${chalk.bgRed(
          'UPDATE AVAILABLE'
        )} The latest version of Now CLI is ${update.latest}`
      )
    );
    console.log(
      info(`Read more about how to update here: https://zeit.co/update-cli`)
    );
    console.log(
      info(
        `Changelog: https://github.com/zeit/now-cli/releases/tag/${update.latest}`
      )
    );
  }

  // the second argument to the command can be a path
  // (as in: `now path/`) or a subcommand / provider
  // (as in: `now ls`)
  let targetOrSubcommand: ?string = argv._[2];

  // we want to handle version or help directly only
  if (!targetOrSubcommand) {
    if (argv['--version']) {
      console.log(
        require('../package').version +
          `${// $FlowFixMe
          process.pkg ? '' : chalk.magenta(' (dev)')}`
      );
      return 0;
    }
  }

  let nowDirExists;

  try {
    nowDirExists = existsSync(NOW_DIR);
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          'now global directory: ' +
          err.message
      )
    );

    return 1;
  }

  if (!nowDirExists) {
    try {
      await mkdirp(NOW_DIR);
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to create the ' +
            `now global directory "${hp(NOW_DIR)}" ` +
            err.message
        )
      );
    }
  }

  let migrated = false;
  let configExists;

  try {
    configExists = existsSync(NOW_CONFIG_PATH);
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          `now config file "${hp(NOW_CONFIG_PATH)}" ` +
          err.message
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
          'An unexpected error occurred while trying to read the ' +
            `now config in "${hp(NOW_CONFIG_PATH)}" ` +
            err.message
        )
      );

      return 1;
    }

    // This is from when Now CLI supported
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
          'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(NOW_CONFIG_PATH)}" ` +
            err.message
        )
      );

      return 1;
    }
  }

  let authConfigExists;

  try {
    authConfigExists = existsSync(NOW_AUTH_CONFIG_PATH);
  } catch (err) {
    console.error(
      error(
        'An unexpected error occurred while trying to find the ' +
          `now auth file "${hp(NOW_AUTH_CONFIG_PATH)}" ` +
          err.message
      )
    );

    return 1;
  }

  let authConfig = null;

  if (authConfigExists) {
    try {
      authConfig = configFiles.readAuthConfigFile();
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to read the ' +
            `now auth config in "${hp(NOW_AUTH_CONFIG_PATH)}" ` +
            err.message
        )
      );

      return 1;
    }

    const subcommandsWithoutToken = ['config', 'login', 'help'];

    // This is from when Now CLI supported
    // multiple providers. In that case, we really
    // need to migrate.
    if (authConfig.credentials) {
      authConfigExists = false;
    } else if (
      !authConfig.token &&
      !subcommandsWithoutToken.includes(targetOrSubcommand) &&
      !argv['--help'] &&
      !argv['--token']
    ) {
      console.error(
        error(
          `The content of "${hp(NOW_AUTH_CONFIG_PATH)}" is invalid. ` +
            'No `token` property found inside'
        )
      );
      return 1;
    }
  }

  if (!authConfigExists) {
    const results = await getDefaultAuthConfig(authConfig);

    authConfig = results.config;
    migrated = results.migrated;

    try {
      configFiles.writeToAuthConfigFile(authConfig);
    } catch (err) {
      console.error(
        error(
          'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(NOW_AUTH_CONFIG_PATH)}" ` +
            err.message
        )
      );
      return 1;
    }
  }

  // Let the user know we migrated the config
  if (migrated) {
    const directory = param(hp(NOW_DIR));
    debug(`The credentials and configuration within the ${directory} directory were upgraded`);
  }

  // the context object to supply to the providers or the commands
  const ctx: Object = {
    config,
    authConfig,
    argv: argv_
  };

  let subcommand;

  // we check if we are deploying something
  if (targetOrSubcommand) {
    const targetPath = join(process.cwd(), targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) ||
      commands.subcommands.has(targetOrSubcommand);

    if (targetPathExists && subcommandExists) {
      console.error(
        error(
          `The supplied argument ${param(targetOrSubcommand)} is ambiguous. ` +
            'Both a directory and a subcommand are known'
        )
      );
      return 1;
    }

    if (subcommandExists) {
      debug('user supplied known subcommand', targetOrSubcommand);
      subcommand = targetOrSubcommand;
    } else {
      debug('user supplied a possible target for deployment');
      // our default command is deployment
      // at this point we're
      subcommand = 'deploy';
    }
  } else {
    debug('user supplied no target, defaulting to deploy');
    subcommand = 'deploy';
  }

  if (subcommand === 'help') {
    subcommand = argv._[3] || 'deploy';
    ctx.argv.push('-h');
  }

  ctx.apiUrl = 'https://api.zeit.co';

  if (argv['--api'] && typeof argv['--api'] === 'string') {
    ctx.apiUrl = argv['--api'];
  } else if (ctx.config && ctx.config.api) {
    ctx.apiUrl = ctx.config.api;
  }

  // If no credentials are set at all, prompt for
  // login to the .sh provider
  if (
    (!authConfig || !authConfig.token) &&
    !ctx.argv.includes('-h') &&
    !ctx.argv.includes('--help') &&
    !argv['--token'] &&
    subcommand !== 'login'
  ) {
    if (isTTY) {
      console.log(info(`No existing credentials found. Please log in:`));

      subcommand = 'login';
      ctx.argv[2] = 'login';

      // Ensure that subcommands lead to login as well, if
      // no credentials are defined
      ctx.argv = ctx.argv.splice(0, 3);
    } else {
      console.error(
        error({
          message:
            'No existing credentials found. Please run ' +
            `${param('now login')} or pass ${param('--token')}`,
          slug: 'no-credentials-found'
        })
      );

      return 1;
    }
  }

  if (typeof argv['--token'] === 'string' && subcommand === 'switch') {
    console.error(
      error({
        message: `This command doesn't work with ${param(
          '--token'
        )}. Please use ${param('--team')}.`,
        slug: 'no-token-allowed'
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
          slug: 'missing-token-value'
        })
      );

      return 1;
    }

    ctx.authConfig.token = token;

    // Don't use team from config if `--token` was set
    if (ctx.config && ctx.config.currentTeam) {
      delete ctx.config.currentTeam;
    }
  }

  if (typeof argv['--team'] === 'string' && subcommand !== 'login') {
    const team = argv['--team'];

    if (team.length === 0) {
      console.error(
        error({
          message: `You defined ${param('--team')}, but it's missing a value`,
          slug: 'missing-team-value'
        })
      );

      return 1;
    }

    const { apiUrl, authConfig: { token } } = ctx;

    let user = null;

    try {
      user = await getUser({ apiUrl, token });
    } catch (err) {
      if (err.code === 'not_authorized') {
        console.error(
          error({
            message: `You do not have access to the specified team`,
            slug: 'team-not-accessible'
          })
        );

        return 1;
      }

      console.error(error('Not able to load user'));
      return 1;
    }

    if (user.uid === team || user.email === team || user.username === team) {
      delete ctx.config.currentTeam;
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
              slug: 'team-not-accessible'
            })
          );

          return 1;
        }

        console.error(error('Not able to load teams'));
        return 1;
      }

      const related = list.find(item => item.id === team || item.slug == team);

      if (!related) {
        console.error(
          error({
            message: "The specified team does not exist",
            slug: 'team-not-existent'
          })
        );

        return 1;
      }

      ctx.config.currentTeam = related.id;
    }
  }

  const runner = await commands[subcommand];

  if (typeof runner !== 'function') {
    const cmd = param(subcommand);
    console.error(error(`The ${cmd} subcommand does not exist`));
    return 1;
  }

  let exitCode;

  try {
    exitCode = await commands[subcommand](ctx);
  } catch (err) {
    // If there is a code we should not consider the error unexpected
    // but instead show the message
    if (err.code) {
      output.debug(err.stack);
      output.error(err.message);
      return 1;
    }

    // Otherwise it is an unexpected error and we should show the trace
    // and an unexpected error message
    console.error(
      error(`An unexpected error occurred in ${subcommand}: ${err.stack}`)
    );

    return 1;
  }

  return exitCode;
};

debug('start');

const handleRejection = err => {
  debug('handling rejection');

  if (err) {
    if (err instanceof Error) {
      handleUnexpected(err);
    } else {
      console.error(error(`An unexpected rejection occurred\n  ${err}`));
    }
  } else {
    console.error(error('An unexpected empty rejection occurred'));
  }

  process.exit(1);
};

const handleUnexpected = err => {
  debug('handling unexpected error');

  console.error(
    error(`An unexpected error occurred!\n  ${err.stack} ${err.stack}`)
  );

  process.exit(1);
};

process.on('unhandledRejection', handleRejection);
process.on('uncaughtException', handleUnexpected);

// Don't use `.then` here. We need to shutdown gracefully, otherwise
// subcommands waiting for further data won't work (like `logs` and `logout`)!
main(process.argv)
  .then(exitCode => {
    process.emit('nowExit');
    process.on('beforeExit', () => {
      process.exit(exitCode);
    });
  })
  .catch(handleUnexpected);
