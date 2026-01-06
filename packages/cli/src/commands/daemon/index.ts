import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { help } from '../help';
import { daemonCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import install from './install';
import uninstall from './uninstall';
import start from './start';
import stop from './stop';
import status from './status';
import logs from './logs';

const COMMAND_CONFIG = {
  install: ['install'],
  uninstall: ['uninstall'],
  start: ['start'],
  stop: ['stop'],
  status: ['status'],
  logs: ['logs'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(daemonCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    output.print(help(daemonCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'install':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![0], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return install(client, args);
    case 'uninstall':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![1], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return uninstall(client, args);
    case 'start':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![2], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return start(client, args);
    case 'stop':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![3], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return stop(client, args);
    case 'status':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![4], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return status(client, args);
    case 'logs':
      if (needHelp) {
        output.print(
          help(daemonCommand.subcommands![5], {
            parent: daemonCommand,
            columns: client.stderr.columns,
          })
        );
        return 2;
      }
      return logs(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(daemonCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
