import type Client from '../../util/client';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { quoteArg } from '../../util/flags/quote-arg';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { SchedulesDeleteTelemetryClient } from '../../util/telemetry/commands/schedules/delete';
import output from '../../output-manager';
import { deleteSubcommand } from './command';
import { handleSchedulesApiError } from './errors';
import {
  invalidScheduleArguments,
  parseScheduleOutput,
  resolveSchedulesClient,
  scheduleTrackArgs,
  scheduleCommandWithGlobalFlags,
  validateLocalScheduleFlags,
  validateScheduleNameAndNamespace,
} from './shared';

const USAGE = 'schedules delete <name> --yes';

export default async function deleteSchedule(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new SchedulesDeleteTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(deleteSubcommand.options)
    );
  } catch (error) {
    return invalidScheduleArguments(
      client,
      USAGE,
      error instanceof Error ? error.message : String(error)
    );
  }

  const { args, flags } = parsedArgs;
  telemetry.trackCliFlagLocal(flags['--local']);
  const conflict = validateLocalScheduleFlags(client, flags, USAGE);
  if (conflict !== undefined) return conflict;
  telemetry.trackCliArgumentName(args[0]);
  telemetry.trackCliOptionNamespace(flags['--namespace']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliFlagYes(flags['--yes']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const identifier = validateScheduleNameAndNamespace(
    client,
    args,
    flags['--namespace'],
    USAGE
  );
  if (!identifier.valid) return identifier.exitCode;
  const outputMode = parseScheduleOutput(client, USAGE, flags);
  if (!outputMode.valid) return outputMode.exitCode;

  const skipConfirmation = flags['--yes'] ?? false;
  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: flags['--local']
          ? 'Deleting a local schedule requires confirmation. Re-run with `--yes`.'
          : 'Deleting a schedule requires confirmation. Re-run with `--yes`.',
        next: [
          {
            command: flags['--local']
              ? scheduleCommandWithGlobalFlags(
                  client,
                  `schedules delete ${quoteArg(identifier.name)} --namespace ${quoteArg(identifier.namespace)} --yes`
                )
              : buildCommandWithYes(client.argv),
          },
        ],
      },
      1
    );
    return 1;
  }

  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;
  const target = flags['--local'] ? 'local schedule' : 'schedule';

  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Delete ${target} ${identifier.namespace}/${identifier.name}? This cannot be undone.`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  if (!outputMode.json) output.spinner('Deleting schedule…');
  let deletedScheduleId: string;
  try {
    const deleted = await schedules.delete(identifier);
    deletedScheduleId = deleted.scheduleId;
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'delete',
      local: flags['--local'],
      name: identifier.name,
      namespace: identifier.namespace,
      trackArgs: scheduleTrackArgs(flags),
    });
  }
  output.stopSpinner();

  const message = `Deleted ${target} ${identifier.namespace}/${identifier.name}.`;
  if (outputMode.json) {
    const deleted = {
      name: identifier.name,
      namespace: identifier.namespace,
      scheduleId: deletedScheduleId,
    };
    const result = client.nonInteractive
      ? { status: AGENT_STATUS.OK, deleted, message }
      : { deleted: true, ...deleted };
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    output.success(message);
  }
  return 0;
}
