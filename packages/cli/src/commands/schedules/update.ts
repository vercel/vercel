import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import type { Schedule } from '../../util/schedules/types';
import { SchedulesUpdateTelemetryClient } from '../../util/telemetry/commands/schedules/update';
import output from '../../output-manager';
import { updateSubcommand } from './command';
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
  parseScheduleExpression,
  parseSchedulePayload,
  parseUpdateJitter,
  validateScheduleQueueTopic,
  validateScheduleTimezone,
} from './validation';

const USAGE = 'schedules update <name> [options]';

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new SchedulesUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(updateSubcommand.options)
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
    false
  );
  if (!expression.valid) {
    return invalidScheduleArguments(client, USAGE, expression.error);
  }
  const jitter = parseUpdateJitter(flags['--jitter']);
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

  const hasUpdate =
    expression.value !== undefined ||
    flags['--timezone'] !== undefined ||
    flags['--jitter'] !== undefined ||
    flags['--topic'] !== undefined ||
    flags['--payload'] !== undefined;
  if (!hasUpdate) {
    return invalidScheduleArguments(
      client,
      USAGE,
      'At least one update option is required.'
    );
  }
  if (flags['--topic'] !== undefined && !flags['--topic'].trim()) {
    return invalidScheduleArguments(
      client,
      USAGE,
      '`--topic` cannot be empty.'
    );
  }
  if (flags['--topic'] !== undefined) {
    const topicError = validateScheduleQueueTopic(flags['--topic']);
    if (topicError) {
      return invalidScheduleArguments(client, USAGE, topicError);
    }
  }

  const outputMode = parseScheduleOutput(client, USAGE, flags);
  if (!outputMode.valid) return outputMode.exitCode;
  const schedules = await resolveSchedulesClient(client, flags);
  if (typeof schedules === 'number') return schedules;

  if (!outputMode.json) output.spinner('Updating schedule…');
  let schedule: Schedule;
  try {
    schedule = await schedules.update({
      name: identifier.name,
      namespace: identifier.namespace,
      ...(expression.value !== undefined && { expression: expression.value }),
      ...(flags['--timezone'] !== undefined && {
        timezone: flags['--timezone'],
      }),
      ...(flags['--jitter'] !== undefined && { jitter: jitter.value }),
      ...(flags['--topic'] !== undefined && {
        target: { topic: flags['--topic'] },
      }),
      ...(flags['--payload'] !== undefined && { payload: payload.value }),
    });
  } catch (error) {
    output.stopSpinner();
    return handleSchedulesApiError(client, error, {
      action: 'update',
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
    `Updated schedule ${identifier.namespace}/${identifier.name}.`,
    outputMode.json
  );
}
