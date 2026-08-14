import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import add from './add';
import ls from './ls';
import run from './run';
import {
  cronsCommand,
  addSubcommand,
  listSubcommand,
  runSubcommand,
} from './command';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { CronsTelemetryClient } from '../../util/telemetry/commands/crons';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  add: ['add'],
  ls: ['ls', 'list'],
  run: ['run'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(cronsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new CronsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('crons');
    output.print(help(cronsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: cronsCommand, columns: client.stderr.columns })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('crons', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'run':
      if (needHelp) {
        telemetry.trackCliFlagHelp('crons', subcommandOriginal);
        return printHelp(runSubcommand);
      }
      telemetry.trackCliSubcommandRun(subcommandOriginal);
      return run(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('crons', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return ls(client, args);
  }
}
