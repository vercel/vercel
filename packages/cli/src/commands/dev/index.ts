import path from 'path';
import chalk from 'chalk';
import type { PackageJson } from '@vercel/build-utils';

import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import type Client from '../../util/client';
import { NowError } from '../../util/now-error';
import { printError } from '../../util/error';
import cmd from '../../util/output/cmd';
import highlight from '../../util/output/highlight';
import dev from './dev';
import readConfig from '../../util/config/read-config';
import readJSONFile from '../../util/read-json-file';
import { packageName, getCommandName } from '../../util/pkg-name';
import { CantParseJSONFile } from '../../util/errors-ts';
import { isErrnoException } from '@vercel/error-utils';
import { help } from '../help';
import { devCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { DevTelemetryClient } from '../../util/telemetry/commands/dev';

const COMMAND_CONFIG = {
  dev: ['dev'],
};

export default async function main(client: Client) {
  if (process.env.__VERCEL_DEV_RUNNING) {
    output.error(
      `${cmd(
        `${packageName} dev`
      )} must not recursively invoke itself. Check the Development Command in the Project Settings or the ${cmd(
        'dev'
      )} script in ${cmd('package.json')}`
    );
    output.error(
      `Learn More: https://vercel.link/recursive-invocation-of-commands`
    );
    return 1;
  } else {
    process.env.__VERCEL_DEV_RUNNING = '1';
  }

  const { telemetryEventStore } = client;
  const telemetry = new DevTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(devCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionPort(parsedArgs.flags['--port']);
  telemetry.trackCliOptionListen(parsedArgs.flags['--listen']);

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('dev');
    output.print(help(devCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const args = getSubcommand(parsedArgs.args.slice(1), COMMAND_CONFIG).args;

  if ('--confirm' in parsedArgs.flags) {
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  if ('--port' in parsedArgs.flags) {
    output.warn('`--port` is deprecated, please use `--listen` instead');
    parsedArgs.flags['--listen'] = parsedArgs.flags['--port'];
  }

  const [passedDir] = args;
  telemetry.trackCliArgumentDir(passedDir);

  const dir = passedDir || process.cwd();

  const vercelConfig = await readConfig(dir);

  const hasBuilds =
    vercelConfig &&
    'builds' in vercelConfig &&
    vercelConfig.builds &&
    vercelConfig.builds.length > 0;

  if (!vercelConfig || !hasBuilds) {
    const pkg = await readJSONFile<PackageJson>(path.join(dir, 'package.json'));

    if (pkg instanceof CantParseJSONFile) {
      output.error(pkg.message);
      return 1;
    }

    if (/\b(now|vercel)\b\W+\bdev\b/.test(pkg?.scripts?.dev || '')) {
      output.error(
        `${cmd(
          `${packageName} dev`
        )} must not recursively invoke itself. Check the Development Command in the Project Settings or the ${cmd(
          'dev'
        )} script in ${cmd('package.json')}`
      );
      output.error(
        `Learn More: https://vercel.link/recursive-invocation-of-commands`
      );
      return 1;
    }
  }

  if (parsedArgs.args.length > 2) {
    output.error(`${getCommandName(`dev [dir]`)} accepts at most one argument`);
    return 1;
  }

  try {
    return await dev(client, parsedArgs.flags, args, telemetry);
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
