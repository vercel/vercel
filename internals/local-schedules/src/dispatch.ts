import type { Schedule, ScheduleDispatch } from './types';

// Sent on path targets, like legacy Cron Jobs, so existing cron routes keep working.
const CRON_USER_AGENT = 'vercel-cron/1.0';

function expressionOf(schedule: Schedule): string {
  return schedule.expression.type === 'cron'
    ? schedule.expression.cron
    : schedule.expression.at;
}

function cloudEventHeaders(
  schedule: Schedule,
  occurrenceId: string,
  scheduledAt: string
): Record<string, string> {
  return {
    'ce-specversion': '1.0',
    'ce-type': 'com.vercel.schedule.v1beta',
    'ce-source': `/schedule/${encodeURIComponent(schedule.namespace)}/${encodeURIComponent(schedule.name)}`,
    'ce-id': occurrenceId,
    'ce-vssscheduleid': schedule.scheduleId,
    'ce-vssscheduledat': scheduledAt,
    'ce-vssschedulename': schedule.name,
    'ce-vssnamespace': schedule.namespace,
    'ce-vssschedulesource': schedule.source,
    'ce-vssexpression': expressionOf(schedule),
  };
}

export function createDispatch(
  schedule: Schedule,
  payload: string | undefined,
  scheduledAtMs: number,
  occurrenceId: string,
  invokeSource: ScheduleDispatch['invokeSource'],
  signal: AbortSignal
): ScheduleDispatch {
  const scheduledAt = new Date(scheduledAtMs).toISOString();
  const common = { schedule, occurrenceId, scheduledAt, invokeSource, signal };
  if (schedule.target.type === 'queue') {
    return {
      ...common,
      delivery: {
        type: 'queue',
        topic: schedule.target.topic,
        message: {
          scheduleId: schedule.scheduleId,
          executionId: occurrenceId,
          name: schedule.name,
          namespace: schedule.namespace,
          scheduledAt,
          expression: expressionOf(schedule),
          source: schedule.source,
          ...(payload === undefined ? {} : { payload: JSON.parse(payload) }),
        },
      },
    };
  }
  if (schedule.target.type === 'path') {
    return {
      ...common,
      delivery: {
        type: 'path',
        path: schedule.target.path,
        requestMethod: schedule.target.requestMethod ?? 'POST',
        headers: {
          'user-agent': CRON_USER_AGENT,
          ...(schedule.expression.type === 'cron'
            ? { 'x-vercel-cron-schedule': schedule.expression.cron }
            : {}),
          ...cloudEventHeaders(schedule, occurrenceId, scheduledAt),
        },
      },
    };
  }
  return {
    ...common,
    delivery: {
      type: 'function',
      function: schedule.target.function,
      headers: cloudEventHeaders(schedule, occurrenceId, scheduledAt),
    },
  };
}
