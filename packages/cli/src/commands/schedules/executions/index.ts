import type Client from '../../../util/client';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import getInvalidSubcommand from '../../../util/get-invalid-subcommand';
import getSubcommand from '../../../util/get-subcommand';
import { printError } from '../../../util/error';
import { getCommandAliases } from '../..';
import { type Command, help } from '../../help';
import output from '../../../output-manager';
import type { SchedulesTelemetryClient } from '../../../util/telemetry/commands/schedules';
import {
  executionsListSubcommand,
  executionsSubcommand,
  schedulesCommand,
} from '../command';
import list from './list';
import {
  invalidScheduleArguments,
  takeScheduleCommand,
  unsupportedLocalExecutions,
  validateLocalScheduleFlags,
} from '../shared';

const COMMAND_CONFIG = {
  list: getCommandAliases(executionsListSubcommand),
};

export default async function executions(
  client: Client,
  args: string[],
  telemetry: SchedulesTelemetryClient
) {
  let parsedArgs;
  let commandArgs;
  try {
    commandArgs = takeScheduleCommand(args);
    // `executions list` parses its flags again and prints any warnings.
    parsedArgs = parseArguments(
      commandArgs.args,
      getFlagsSpecification(executionsListSubcommand.options),
      { warnDeprecated: false }
    );
  } catch (error) {
    if (client.nonInteractive) {
      return invalidScheduleArguments(
        client,
        'schedules executions',
        error instanceof Error ? error.message : String(error)
      );
    }
    printError(error);
    return 2;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    commandArgs.command ? [commandArgs.command] : [],
    COMMAND_CONFIG
  );
  const subArgs = commandArgs.args;
  const needHelp = parsedArgs.flags['--help'];
  const conflict = validateLocalScheduleFlags(
    client,
    parsedArgs.flags,
    'schedules executions'
  );
  if (conflict !== undefined) return conflict;
  if (parsedArgs.flags['--local'] && !needHelp) {
    return unsupportedLocalExecutions(client);
  }

  function printHelp(command: Command, nested: boolean) {
    output.print(
      help(command, {
        stream: client.stderr,
        // `help` takes a single parent, so a nested group borrows the parent
        // command with its own path as the name.
        parent: nested
          ? { ...schedulesCommand, name: 'schedules executions' }
          : schedulesCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (!subcommand) {
    if (needHelp) {
      telemetry.trackCliFlagHelp('schedules', 'executions');
      output.print(
        help(executionsSubcommand, {
          stream: client.stderr,
          parent: schedulesCommand,
          columns: client.stderr.columns,
        })
      );
      return 0;
    }
    output.error(getInvalidSubcommand(COMMAND_CONFIG));
    output.print(
      help(executionsSubcommand, {
        stream: client.stderr,
        parent: schedulesCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (subcommand === 'list') {
    if (needHelp) {
      telemetry.trackCliFlagHelp(
        'schedules',
        `executions:${subcommandOriginal}`
      );
      return printHelp(executionsListSubcommand, true);
    }
    telemetry.trackCliSubcommandExecutionsList(subcommandOriginal);
    return list(client, subArgs);
  }

  output.error(getInvalidSubcommand(COMMAND_CONFIG));
  return printHelp(executionsSubcommand, false);
}
