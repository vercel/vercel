import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { type Command, help } from '../help';
import { ExperimentTelemetryClient } from '../../util/telemetry/commands/experiment';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import {
  experimentCommand,
  experimentAnalyseSubcommand,
  experimentCreateSubcommand,
  experimentListSubcommand,
  experimentStartSubcommand,
  experimentStopSubcommand,
} from './command';
import analyse from './analyse';
import experimentCreate from './create';
import experimentList from './list';
import experimentStart from './start';
import experimentStop from './stop';
import metricsIndex from './metrics-index';

const COMMAND_CONFIG = {
  create: getCommandAliases(experimentCreateSubcommand),
  list: getCommandAliases(experimentListSubcommand),
  start: getCommandAliases(experimentStartSubcommand),
  stop: getCommandAliases(experimentStopSubcommand),
  analyse: getCommandAliases(experimentAnalyseSubcommand),
  metrics: ['metrics'],
};

export default async function main(client: Client): Promise<number> {
  const telemetry = new ExperimentTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(experimentCommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('experiment');
    output.print(help(experimentCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: experimentCommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (!subcommand) {
    if (subArgs.length > 0) {
      output.error(
        `Invalid subcommand "${subArgs[0]}". ${getInvalidSubcommand(COMMAND_CONFIG)}`
      );
      return 1;
    }
    output.print(help(experimentCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment', subcommandOriginal);
        printHelp(experimentCreateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return experimentCreate(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment', subcommandOriginal);
        printHelp(experimentListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return experimentList(client, args);
    case 'start':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment', subcommandOriginal);
        printHelp(experimentStartSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandStart(subcommandOriginal);
      return experimentStart(client, args);
    case 'stop':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment', subcommandOriginal);
        printHelp(experimentStopSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandStop(subcommandOriginal);
      return experimentStop(client, args);
    case 'analyse':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment', subcommandOriginal);
        printHelp(experimentAnalyseSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAnalyse(subcommandOriginal);
      return analyse(client, args);
    case 'metrics':
      telemetry.trackCliSubcommandMetrics(subcommandOriginal);
      return metricsIndex(client);
    default:
      output.print(help(experimentCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
