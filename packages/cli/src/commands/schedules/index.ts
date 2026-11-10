import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { getCommandAliases } from '..';
import { type Command, help } from '../help';
import output from '../../output-manager';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { SchedulesTelemetryClient } from '../../util/telemetry/commands/schedules';
import {
  createSubcommand,
  deleteSubcommand,
  disableSubcommand,
  enableSubcommand,
  executionsSubcommand,
  getSubcommand as getSubcommandDefinition,
  invokeSubcommand,
  listSubcommand as listSubcommandDefinition,
  schedulesCommand,
  updateSubcommand,
} from './command';
import runScheduleAction from './action';
import create from './create';
import deleteSchedule from './delete';
import executions from './executions';
import get from './get';
import list from './list';
import update from './update';
import {
  invalidScheduleArguments,
  takeScheduleCommand,
  validateLocalScheduleFlags,
} from './shared';

const COMMAND_CONFIG = {
  create: getCommandAliases(createSubcommand),
  delete: getCommandAliases(deleteSubcommand),
  disable: getCommandAliases(disableSubcommand),
  enable: getCommandAliases(enableSubcommand),
  executions: getCommandAliases(executionsSubcommand),
  inspect: getCommandAliases(getSubcommandDefinition),
  invoke: getCommandAliases(invokeSubcommand),
  list: getCommandAliases(listSubcommandDefinition),
  update: getCommandAliases(updateSubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  let commandArgs: ReturnType<typeof takeScheduleCommand>;
  let selectedCommand;
  try {
    const group = takeScheduleCommand(client.argv.slice(2));
    commandArgs = takeScheduleCommand(group.args);
    selectedCommand = schedulesCommand.subcommands.find(command =>
      getCommandAliases(command).includes(commandArgs.command)
    );
    parsedArgs = parseArguments(
      commandArgs.args,
      getFlagsSpecification(
        selectedCommand?.options ?? schedulesCommand.options
      ),
      // The subcommand parses its flags again and prints any warnings.
      {
        permissive: selectedCommand?.name === 'executions',
        warnDeprecated: false,
      }
    );
  } catch (error) {
    if (client.nonInteractive) {
      return invalidScheduleArguments(
        client,
        'schedules',
        error instanceof Error ? error.message : String(error)
      );
    }
    printError(error);
    return 2;
  }

  const telemetry = new SchedulesTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, subcommandOriginal } = getSubcommand(
    commandArgs.command ? [commandArgs.command] : [],
    COMMAND_CONFIG
  );
  const args = commandArgs.args;
  const needHelp = parsedArgs.flags['--help'];
  if (!subcommand || needHelp || subcommand === 'executions') {
    telemetry.trackCliFlagLocal(parsedArgs.flags['--local']);
  }
  const conflict = validateLocalScheduleFlags(
    client,
    parsedArgs.flags,
    'schedules'
  );
  if (conflict !== undefined) return conflict;

  function printHelp(command: Command, parent?: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent:
          parent ??
          (command === schedulesCommand ? undefined : schedulesCommand),
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (!subcommand) {
    if (commandArgs.command) {
      output.fatal(getInvalidSubcommand(COMMAND_CONFIG));
    }
    if (needHelp) {
      telemetry.trackCliFlagHelp('schedules');
    }
    return printHelp(schedulesCommand);
  }

  if (needHelp && subcommand !== 'executions') {
    telemetry.trackCliFlagHelp('schedules', subcommandOriginal);
    if (subcommand === 'create') return printHelp(createSubcommand);
    if (subcommand === 'delete') return printHelp(deleteSubcommand);
    if (subcommand === 'disable') return printHelp(disableSubcommand);
    if (subcommand === 'enable') return printHelp(enableSubcommand);
    if (subcommand === 'inspect') return printHelp(getSubcommandDefinition);
    if (subcommand === 'invoke') return printHelp(invokeSubcommand);
    if (subcommand === 'update') return printHelp(updateSubcommand);
    return printHelp(listSubcommandDefinition);
  }

  if (subcommand === 'inspect') {
    telemetry.trackCliSubcommandInspect(subcommandOriginal);
    if (subcommandOriginal === 'get') {
      warnDeprecatedSubcommand(client, 'schedules get', 'schedules inspect');
    }
    return get(client, args);
  }
  if (subcommand === 'list') {
    telemetry.trackCliSubcommandList(subcommandOriginal);
    return list(client, args);
  }
  if (subcommand === 'executions') {
    telemetry.trackCliSubcommandExecutions(subcommandOriginal);
    return executions(client, args, telemetry);
  }
  if (subcommand === 'create') {
    telemetry.trackCliSubcommandCreate(subcommandOriginal);
    return create(client, args);
  }
  if (subcommand === 'delete') {
    telemetry.trackCliSubcommandDelete(subcommandOriginal);
    return deleteSchedule(client, args);
  }
  if (subcommand === 'update') {
    telemetry.trackCliSubcommandUpdate(subcommandOriginal);
    return update(client, args);
  }
  if (subcommand === 'enable') {
    telemetry.trackCliSubcommandEnable(subcommandOriginal);
    return runScheduleAction(client, args, 'enable');
  }
  if (subcommand === 'disable') {
    telemetry.trackCliSubcommandDisable(subcommandOriginal);
    return runScheduleAction(client, args, 'disable');
  }

  telemetry.trackCliSubcommandInvoke(subcommandOriginal);
  return runScheduleAction(client, args, 'invoke');
}
