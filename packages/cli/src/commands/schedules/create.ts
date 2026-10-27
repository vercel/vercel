import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import type { Schedule } from '../../util/schedules/types';
import { SchedulesCreateTelemetryClient } from '../../util/telemetry/commands/schedules/create';
import output from '../../output-manager';
import { createSubcommand } from './command';
import { handleSchedulesApiError } from './errors';
import {
  invalidScheduleArguments,
  parseScheduleOutput,
  resolveSchedulesClient,
  scheduleTrackArgs,
  validateLocalScheduleFlags,
  validateScheduleNameAndNamespace,
  writeScheduleMutationResult,
} from './shared';
import {
  parseCreateJitter,
  parseScheduleExpression,
  parseSchedulePayload,
  validateScheduleQueueTopic,
  validateScheduleTimezone,
} from './validation';

const USAGE = 'schedules create <name> --cron <expression> --topic <topic>';

export default async function create(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new SchedulesCreateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(createSubcommand.options)
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
  telemetry.trackCliOptionCron(flags['--cron']);
  telemetry.trackCliOptionAt(flags['--at']);
  telemetry.trackCliOptionTimezone(flags['--timezone']);
  telemetry.trackCliOptionJitter(flags['--jitter']);
  telemetry.trackCliOptionTopic(flags['--topic']);
  telemetry.trackCliOptionPayload(flags['--payload']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const identifier = validateScheduleNameAndNamespace(
    client,
    args,
    flags['--namespace'],
    USAGE
  );
  if (!identifier.valid) return identifier.exitCode;

  const expression = parseScheduleExpression(
    flags['--cron'],
    flags['--at'],
    true
  );
  if (!expression.valid) {
    return invalidScheduleArguments(client, USAGE, expression.error);
  }

  const topic = flags['--topic'];
  if (!topic?.trim()) {
    return invalidScheduleArguments(
      client,
      USAGE,
      'A target queue topic is required. Use `--topic`.'
    );
  }
  const topicError = validateScheduleQueueTopic(topic);
  if (topicError) {
    return invalidScheduleArguments(client, USAGE, topicError);
  }

  const jitter = parseCreateJitter(flags['--jitter']);
  if (!jitter.valid) {
    return invalidScheduleArguments(client, USAGE, jitter.error);
  }
  const timezoneError = validateScheduleTimezone(flags['--timezone']);
  if (timezoneError) {
    return invalidScheduleArguments(client, USAGE, timezoneError);
  }
  const payload = parseSchedulePayload(flags['--payload']);
  if (!payload.valid) {
    return invalidScheduleArguments(client, USAGE, payload.error);
  }
  const outputMode = parseScheduleOutput(client, USAGE, flags);
  if (!outputMode.valid) return outputMode.exitCode;

  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;

  if (!outputMode.json) output.spinner('Creating schedule…');
  let schedule: Schedule;
  try {
    schedule = await schedules.create({
      name: identifier.name,
      namespace: identifier.namespace,
      expression: expression.value!,
      target: { topic },
      ...(flags['--timezone'] !== undefined && {
        timezone: flags['--timezone'],
      }),
      ...(jitter.value !== undefined && { jitter: jitter.value }),
      ...(flags['--payload'] !== undefined && { payload: payload.value }),
    });
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'create',
      local: flags['--local'],
      name: identifier.name,
      namespace: identifier.namespace,
      trackArgs: scheduleTrackArgs(flags),
    });
  }
  output.stopSpinner();

  return writeScheduleMutationResult(
    client,
    schedule,
    `Created schedule ${identifier.namespace}/${identifier.name}.`,
    outputMode.json
  );
}
