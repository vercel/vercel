import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { CiTelemetryClient } from '../../util/telemetry/commands/ci';
import output from '../../output-manager';
import { type Command, help } from '../help';
import { getCommandAliases } from '..';
import {
  ciCommand,
  enableSubcommand,
  grepSubcommand,
  inspectSubcommand,
  listSubcommand,
  logsSubcommand,
  rerunSubcommand,
} from './command';
import enable from './enable';
import grep from './grep';
import inspect from './inspect';
import logs from './logs';
import rerun from './rerun';
import ls from './ls';

const COMMAND_CONFIG = {
  enable: getCommandAliases(enableSubcommand),
  ls: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  logs: getCommandAliases(logsSubcommand),
  grep: getCommandAliases(grepSubcommand),
  rerun: getCommandAliases(rerunSubcommand),
};

export default async function main(client: Client): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(ciCommand.options),
      { permissive: true }
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }

  const telemetry = new CiTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: ciCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'enable':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(enableSubcommand);
      }
      telemetry.trackCliSubcommandEnable(subcommandOriginal);
      return enable(client, args);
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'logs':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(logsSubcommand);
      }
      telemetry.trackCliSubcommandLogs(subcommandOriginal);
      return logs(client, args);
    case 'grep':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(grepSubcommand);
      }
      telemetry.trackCliSubcommandGrep(subcommandOriginal);
      return grep(client, args);
    case 'rerun':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci', subcommandOriginal);
        return printHelp(rerunSubcommand);
      }
      telemetry.trackCliSubcommandRerun(subcommandOriginal);
      return rerun(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('ci');
      }
      output.print(
        help(ciCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return needHelp ? 0 : 2;
  }
}
