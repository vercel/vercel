import path from 'path';
import chalk from 'chalk';
import type { PackageJson } from '@vercel/build-utils';

import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import type Client from '../../util/client';
import { NowError } from '../../util/now-error';
import { printError } from '../../util/error';
import highlight from '../../util/output/highlight';
import dev from './dev';
import {
  dev as devDiagnostics,
  DevCommandExitError,
  ServiceStartError,
} from '../../util/dev/diagnostics';
import { createErrorReporter } from '../../util/dev/report-error';
import readConfig from '../../util/config/read-config';
import readJSONFile from '../../util/read-json-file';
import { getCommandName } from '../../util/pkg-name';
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
  const { telemetryEventStore } = client;
  const telemetry = new DevTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  const reportError = createErrorReporter(code => telemetry.trackError(code));

  if (process.env.__VERCEL_DEV_RUNNING) {
    reportError(devDiagnostics.DEV_RECURSIVE_INVOCATION());
    return 1;
  } else {
    process.env.__VERCEL_DEV_RUNNING = '1';
  }

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
  telemetry.trackCliFlagLocal(parsedArgs.flags['--local']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionPort(parsedArgs.flags['--port']);
  telemetry.trackCliOptionListen(parsedArgs.flags['--listen']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

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

  if (vercelConfig instanceof Error) {
    reportError(vercelConfig);
    return 1;
  }

  const hasBuilds =
    vercelConfig &&
    'builds' in vercelConfig &&
    vercelConfig.builds &&
    vercelConfig.builds.length > 0;

  if (!vercelConfig || !hasBuilds) {
    const pkg = await readJSONFile<PackageJson>(path.join(dir, 'package.json'));

    if (pkg instanceof CantParseJSONFile) {
      reportError(pkg);
      return 1;
    }

    if (/\b(now|vercel)\b\W+\bdev\b/.test(pkg?.scripts?.dev || '')) {
      reportError(devDiagnostics.DEV_RECURSIVE_INVOCATION());
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
    if (
      err instanceof DevCommandExitError ||
      err instanceof ServiceStartError
    ) {
      reportError(err);
      process.exit(err instanceof DevCommandExitError ? err.exitCode : 1);
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
      } else {
        reportError(err);
      }
      if (typeof err.stack === 'string') {
        output.debug(err.stack);
      }
      return 1;
    }
    reportError(err);
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
