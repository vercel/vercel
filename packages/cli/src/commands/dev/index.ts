import path from 'path';
import chalk from 'chalk';
import { PackageJson } from '@vercel/build-utils';

import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import Client from '../../util/client';
import { NowError } from '../../util/now-error';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import cmd from '../../util/output/cmd';
import highlight from '../../util/output/highlight';
import dev from './dev';
import readConfig from '../../util/config/read-config';
import readJSONFile from '../../util/read-json-file';
import { getPkgName, getCommandName } from '../../util/pkg-name';
import { CantParseJSONFile } from '../../util/errors-ts';
import { isErrnoException } from '../../util/is-error';

const COMMAND_CONFIG = {
  dev: ['dev'],
};

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} dev`)} [options] <dir>

  Starts the \`${getPkgName()} dev\` server.

  ${chalk.dim('Options:')}

    -h, --help             Output usage information
    -d, --debug            Debug mode [off]
    -l, --listen  [uri]    Specify a URI endpoint on which to listen [0.0.0.0:3000]
    -t, --token   [token]  Specify an Authorization Token
    -y, --yes              Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Start the \`${getPkgName()} dev\` server on port 8080

      ${chalk.cyan(`$ ${getPkgName()} dev --listen 8080`)}

  ${chalk.gray(
    '–'
  )} Make the \`vercel dev\` server bind to localhost on port 5000

      ${chalk.cyan(`$ ${getPkgName()} dev --listen 127.0.0.1:5000`)}
  `);
};

export default async function main(client: Client) {
  if (process.env.__VERCEL_DEV_RUNNING) {
    client.output.error(
      `${cmd(
        `${getPkgName()} dev`
      )} must not recursively invoke itself. Check the Development Command in the Project Settings or the ${cmd(
        'dev'
      )} script in ${cmd('package.json')}`
    );
    client.output.error(
      `Learn More: https://vercel.link/recursive-invocation-of-commands`
    );
    return 1;
  } else {
    process.env.__VERCEL_DEV_RUNNING = '1';
  }

  let argv;
  let args;
  const { output } = client;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--listen': String,
      '-l': '--listen',
      '--yes': Boolean,
      '-y': '--yes',

      // Deprecated
      '--port': Number,
      '-p': '--port',
      '--confirm': Boolean,
      '-c': '--confirm',
    });
    args = getSubcommand(argv._.slice(1), COMMAND_CONFIG).args;

    if ('--confirm' in argv) {
      output.warn('`--confirm` is deprecated, please use `--yes` instead');
      argv['--yes'] = argv['--confirm'];
    }

    if ('--port' in argv) {
      output.warn('`--port` is deprecated, please use `--listen` instead');
      argv['--listen'] = String(argv['--port']);
    }
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const [dir = '.'] = args;

  const vercelConfig = await readConfig(dir);

  const hasBuilds =
    vercelConfig &&
    'builds' in vercelConfig &&
    vercelConfig.builds &&
    vercelConfig.builds.length > 0;

  if (!vercelConfig || !hasBuilds) {
    const pkg = await readJSONFile<PackageJson>(path.join(dir, 'package.json'));

    if (pkg instanceof CantParseJSONFile) {
      client.output.error('Could not parse package.json');
      return 1;
    }

    if (/\b(now|vercel)\b\W+\bdev\b/.test(pkg?.scripts?.dev || '')) {
      client.output.error(
        `${cmd(
          `${getPkgName()} dev`
        )} must not recursively invoke itself. Check the Development Command in the Project Settings or the ${cmd(
          'dev'
        )} script in ${cmd('package.json')}`
      );
      client.output.error(
        `Learn More: https://vercel.link/recursive-invocation-of-commands`
      );
      return 1;
    }
  }

  if (argv._.length > 2) {
    output.error(`${getCommandName(`dev [dir]`)} accepts at most one argument`);
    return 1;
  }

  try {
    return await dev(client, argv, args);
  } catch (err) {
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
    output.prettyError(err);
    output.debug(stringifyError(err));
    return 1;
  }
}

// stringify error details for inspecting
function stringifyError(err: any) {
  if (err instanceof NowError) {
    const errMeta = JSON.stringify(err.meta, null, 2).replace(/\\n/g, '\n');
    return `${chalk.red(err.code)} ${err.message}\n${errMeta}`;
  }
  return err.stack;
}
