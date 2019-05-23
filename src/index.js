import 'core-js/modules/es7.symbol.async-iterator';
import { join } from 'path';
import { existsSync } from 'fs';
import sourceMap from '@zeit/source-map-support';
import mkdirp from 'mkdirp-promise';
import chalk from 'chalk';
import epipebomb from 'epipebomb';
import checkForUpdate from 'update-check';
import ms from 'ms';
import * as Sentry from '@sentry/node';
import error from './util/output/error';
import param from './util/output/param.ts';
import info from './util/output/info';
import getNowDir from './util/config/global-path';
import {
  getDefaultConfig,
  getDefaultAuthConfig
} from './util/config/get-default';
import hp from './util/humanize-path';
import commands from './commands';
import * as configFiles from './util/config/files';
import pkg from './util/pkg.ts';
import createOutput from './util/output';
import getArgs from './util/get-args';
import getUser from './util/get-user.ts';
import Client from './util/client.ts';
import NowTeams from './util/teams';
import highlight from './util/output/highlight';
import { handleError } from './util/error';
import reportError from './util/report-error';
import getConfig from './util/get-config';
import * as ERRORS from './util/errors-ts';
import { NowError } from './util/now-error';
import metrics from './util/metrics';
import { GA_TRACKING_ID, SENTRY_DSN } from './util/constants';

const NOW_DIR = getNowDir();
const NOW_CONFIG_PATH = configFiles.getConfigFilePath();
const NOW_AUTH_CONFIG_PATH = configFiles.getAuthConfigFilePath();

const GLOBAL_COMMANDS = new Set(['help']);
const insidePkg = process.pkg;

epipebomb();

// we only enable source maps while developing, since
// they have a small performance hit. for this, we
// look for `pkg`, which is only present in the final bin
if (!insidePkg) {
  sourceMap.install();
}

// Configure the error reporting system
Sentry.init({
  dsn: SENTRY_DSN,
  release: `now-cli@${pkg.version}`,
  environment: pkg.version.includes('canary') ? 'canary' : 'stable'
});

let debug = () => {};
let apiUrl = 'https://api.zeit.co';

const main = async argv_ => {
  const { isTTY } = process.stdout;

  let argv = null;

  try {
    argv = getArgs(
      argv_,
      {
        '--version': Boolean,
        '-v': '--version',
        '--debug': Boolean,
        '-d': '--debug'
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

  if (localConfig instanceof NowError && !(localConfig instanceof ERRORS.CantFindConfig)) {
    output.error(`Failed to load local config file: ${localConfig.message}`);
    return 1;
  }

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

  debug(`Using Now CLI ${pkg.version}`);

  // the second argument to the command can be a path
  // (as in: `now path/`) or a subcommand / provider
  // (as in: `now ls`)
  const targetOrSubcommand = argv._[2];

  // we want to handle version or help directly only
  if (!targetOrSubcommand) {
    if (argv['--version']) {
      console.log(
        `${require('../package').version}${// $FlowFixMe
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
        `${'An unexpected error occurred while trying to find the ' +
          'now global directory: '}${err.message}`
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
          `${'An unexpected error occurred while trying to create the ' +
            `now global directory "${hp(NOW_DIR)}" `}${err.message}`
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
        `${'An unexpected error occurred while trying to find the ' +
          `now config file "${hp(NOW_CONFIG_PATH)}" `}${err.message}`
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
          `${'An unexpected error occurred while trying to read the ' +
            `now config in "${hp(NOW_CONFIG_PATH)}" `}${err.message}`
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
          `${'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(NOW_CONFIG_PATH)}" `}${err.message}`
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
        `${'An unexpected error occurred while trying to find the ' +
          `now auth file "${hp(NOW_AUTH_CONFIG_PATH)}" `}${err.message}`
      )
    );

    return 1;
  }

  let authConfig = null;

  const subcommandsWithoutToken = ['login', 'help', 'init', 'dev'];

  if (authConfigExists) {
    try {
      authConfig = configFiles.readAuthConfigFile();
    } catch (err) {
      console.error(
        error(
          `${'An unexpected error occurred while trying to read the ' +
            `now auth config in "${hp(NOW_AUTH_CONFIG_PATH)}" `}${err.message}`
        )
      );

      return 1;
    }

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
            'No `token` property found inside. Run `now login` to authorize.'
        )
      );
      return 1;
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
          `${'An unexpected error occurred while trying to write the ' +
            `default now config to "${hp(
              NOW_AUTH_CONFIG_PATH
            )}" `}${err.message}`
        )
      );
      return 1;
    }
  }

  // Let the user know we migrated the config
  if (migrated) {
    const directory = param(hp(NOW_DIR));
    debug(
      `The credentials and configuration within the ${directory} directory were upgraded`
    );
  }

  // the context object to supply to the providers or the commands
  const ctx = {
    config,
    authConfig,
    localConfig,
    argv: argv_
  };

  let subcommand;

  // we check if we are deploying something
  if (targetOrSubcommand) {
    const targetPath = join(process.cwd(), targetOrSubcommand);
    const targetPathExists = existsSync(targetPath);
    const subcommandExists =
      GLOBAL_COMMANDS.has(targetOrSubcommand) || commands[targetOrSubcommand];

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

  if (argv['--api'] && typeof argv['--api'] === 'string') {
    apiUrl = argv['--api'];
  } else if (ctx.config && ctx.config.api) {
    apiUrl = ctx.config.api;
  }

  ctx.apiUrl = apiUrl;

  try {
    // eslint-disable-next-line no-new
    new URL(ctx.apiUrl);
  } catch (err) {
    console.error(
      error(`Please provide a valid URL instead of ${highlight(ctx.apiUrl)}.`)
    );
    return 1;
  }

  // If no credentials are set at all, prompt for
  // login to the .sh provider
  if (
    (!authConfig || !authConfig.token) &&
    !ctx.argv.includes('-h') &&
    !ctx.argv.includes('--help') &&
    !argv['--token'] &&
    !subcommandsWithoutToken.includes(subcommand)
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
        )}. Please use ${param('--scope')}.`,
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

  const scope = argv['--scope'] || argv['--team'] || localConfig.scope;
  const targetCommand = commands[subcommand];

  if (argv['--team']) {
    output.warn(`The ${param('--team')} flag is deprecated. Please use ${param('--scope')} instead.`);
  }

  if (typeof scope === 'string' && targetCommand !== 'login' && !(targetCommand === 'teams' && argv._[3] !== 'invite')) {
    const { authConfig: { token } } = ctx;
    const client = new Client({ apiUrl, token });

    let user = null;

    try {
      user = await getUser(client);
    } catch (err) {
      if (err.code === 'NOT_AUTHORIZED') {
        console.error(
          error({
            message: `You do not have access to the specified account`,
            slug: 'scope-not-accessible'
          })
        );

        return 1;
      }

      console.error(error('Not able to load user'));
      return 1;
    }

    if (user.uid === scope || user.email === scope || user.username === scope) {
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
              slug: 'scope-not-accessible'
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
            slug: 'scope-not-existent'
          })
        );

        return 1;
      }

      ctx.config.currentTeam = related.id;
    }
  }

  if (!targetCommand) {
    const cmd = param(subcommand);
    console.error(error(`The ${cmd} subcommand does not exist`));
    return 1;
  }

  const metric = metrics(GA_TRACKING_ID, config.token);
  let exitCode;

  try {
    const start = new Date();
    const full = require(`./commands/${targetCommand}`).default;
    exitCode = await full(ctx);
    const end = new Date() - start;

    if (config.collectMetrics === undefined || config.collectMetrics === true) {
      const category = 'Command Invocation';

      metric
        .timing(category, targetCommand, end, pkg.version)
        .event(category, targetCommand, pkg.version)
        .send();
    }
  } catch (err) {
    if (err.code === 'ENOTFOUND' && err.hostname === 'api.zeit.co') {
      output.error(
        `The hostname ${highlight(
          'api.zeit.co'
        )} could not be resolved. Please verify your internet connectivity and DNS configuration.`
      );
      output.debug(err.stack);

      return 1;
    }

    await reportError(Sentry, err, apiUrl, configFiles);

    // If there is a code we should not consider the error unexpected
    // but instead show the message. Any error that is handled by this should
    // actually be handled in the sub command instead. Please make sure
    // that happens for anything that lands here. It should NOT bubble up to here.
    if (err.code) {
      output.debug(err.stack);
      output.error(err.message);

      return 1;
    }

    // Otherwise it is an unexpected error and we should show the trace
    // and an unexpected error message
    output.error(`An unexpected error occurred in ${subcommand}: ${err.stack}`);
    return 1;
  }

  return exitCode;
};

debug('start');

const handleRejection = async err => {
  debug('handling rejection');

  if (err) {
    if (err instanceof Error) {
      await handleUnexpected(err);
    } else {
      console.error(error(`An unexpected rejection occurred\n  ${err}`));
      await reportError(Sentry, err, apiUrl, configFiles);
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

  await reportError(Sentry, err, apiUrl, configFiles);
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
