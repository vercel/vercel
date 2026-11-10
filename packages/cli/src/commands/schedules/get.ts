import type Client from '../../util/client';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import formatDate from '../../util/format-date';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName } from '../../util/pkg-name';
import { DEFAULT_SCHEDULE_NAMESPACE } from '../../util/schedules/client';
import { formatScheduleTargetDetail } from '../../util/schedules/format';
import type { Schedule, ScheduleExpression } from '../../util/schedules/types';
import { SchedulesGetTelemetryClient } from '../../util/telemetry/commands/schedules/get';
import output from '../../output-manager';
import { getSubcommand } from './command';
import { handleSchedulesApiError } from './errors';
import { validateScheduleIdentifier } from './validation';
import {
  resolveSchedulesClient,
  scheduleTrackArgs,
  scheduleCommandWithGlobalFlags,
  validateLocalScheduleFlags,
} from './shared';

const USAGE = 'schedules inspect <name>';

function invalidArguments(client: Client, message: string): number {
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message,
      next: [
        {
          command: scheduleCommandWithGlobalFlags(client, USAGE),
          when: 'Provide a valid schedule name',
        },
      ],
    });
    return 2;
  }

  output.fatal(message);
  return 2;
}

function formatExpression(expression: ScheduleExpression): string {
  return expression.type === 'cron' ? expression.cron : expression.at;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function printSchedule(schedule: Schedule): void {
  printAlignedLabel('Name', schedule.name);
  printAlignedLabel('Namespace', schedule.namespace);
  printAlignedLabel('State', capitalize(schedule.state));
  printAlignedLabel('Source', capitalize(schedule.source));
  printAlignedLabel('Type', capitalize(schedule.expression.type));
  printAlignedLabel('Expression', formatExpression(schedule.expression));
  printAlignedLabel('Timezone', schedule.timezone);
  if (schedule.jitter !== undefined) {
    printAlignedLabel(
      'Jitter',
      `${schedule.jitter} minute${schedule.jitter === 1 ? '' : 's'}`
    );
  }
  printAlignedLabel('Target', formatScheduleTargetDetail(schedule.target));
  printAlignedLabel('Schedule ID', schedule.scheduleId);
  printAlignedLabel('Project ID', schedule.projectId);
  printAlignedLabel('Owner ID', schedule.ownerId);
  printAlignedLabel('Created', formatDate(schedule.createdAt));
  printAlignedLabel('Updated', formatDate(schedule.updatedAt));
}

export default async function get(client: Client, argv: string[]) {
  const telemetry = new SchedulesGetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(getSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: error instanceof Error ? error.message : String(error),
      });
      return 2;
    }
    output.fatal(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const { args, flags } = parsedArgs;
  telemetry.trackCliFlagLocal(flags['--local']);
  const conflict = validateLocalScheduleFlags(client, flags, USAGE);
  if (conflict !== undefined) return conflict;
  const [name] = args;
  const namespace = flags['--namespace'] ?? DEFAULT_SCHEDULE_NAMESPACE;

  telemetry.trackCliArgumentName(name);
  telemetry.trackCliOptionNamespace(flags['--namespace']);
  telemetry.trackCliOptionEnvironment(flags['--environment']);
  telemetry.trackCliOptionGitBranch(flags['--git-branch']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (!name) {
    return invalidArguments(client, 'A schedule name is required');
  }
  if (args.length !== 1) {
    return invalidArguments(
      client,
      `Expected one schedule name. Usage: ${getCommandName(USAGE)}`
    );
  }

  const nameError = validateScheduleIdentifier(name, 'Schedule name');
  if (nameError) return invalidArguments(client, nameError);
  const namespaceError = validateScheduleIdentifier(namespace, 'Namespace');
  if (namespaceError) return invalidArguments(client, namespaceError);

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return invalidArguments(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;

  if (!asJson) {
    output.spinner('Fetching schedule…');
  }

  let schedule: Schedule;
  try {
    schedule = await schedules.get({ name, namespace });
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'get',
      local: flags['--local'],
      name,
      namespace,
      trackArgs: scheduleTrackArgs(flags),
    });
  }

  output.stopSpinner();

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          schedule,
          message: `Schedule ${namespace}/${name} found.`,
        }
      : schedule;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printSchedule(schedule);
  return 0;
}
