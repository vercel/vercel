import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { ExperimentMetricsTelemetryClient } from '../../util/telemetry/commands/experiment/metrics';
import {
  experimentCommand,
  experimentMetricsSubcommand,
  experimentMetricsAddSubcommand,
  experimentMetricsListSubcommand,
} from './command';
import metricsAdd from './metrics-add';
import metricsLs from './metrics-ls';

const COMMAND_CONFIG = {
  add: getCommandAliases(experimentMetricsAddSubcommand),
  list: getCommandAliases(experimentMetricsListSubcommand),
};

export default async function metricsIndex(client: Client): Promise<number> {
  const telemetry = new ExperimentMetricsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    experimentMetricsSubcommand.options
  );
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(0);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = client.argv.includes('--help') || client.argv.includes('-h');

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('experiment metrics');
    output.print(
      help(experimentMetricsSubcommand, {
        parent: experimentCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: experimentMetricsSubcommand,
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
    output.print(
      help(experimentMetricsSubcommand, {
        parent: experimentCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment metrics', subcommandOriginal);
        printHelp(experimentMetricsAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return metricsAdd(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('experiment metrics', subcommandOriginal);
        printHelp(experimentMetricsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return metricsLs(client, args);
    default:
      output.print(
        help(experimentMetricsSubcommand, {
          parent: experimentCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
