import { CronExpressionParser } from 'cron-parser';
import { DateTime } from 'luxon';
import { ScheduleBrokerError, type ScheduleExpression } from './types';

function invalid(
  message: string,
  code: ScheduleBrokerError['code'] = 'invalid_request'
): never {
  throw new ScheduleBrokerError(code, message);
}

/** A single-fire time this far in the past is still accepted and fires immediately. */
export const SINGLE_AT_PAST_GRACE_MS = 15_000;

/**
 * Floor on how long past its jitter window a cron occurrence may still fire,
 * matching subscriber-dispatch-schedules MIN_DISPATCH_GRACE_MINUTES.
 */
const MIN_DISPATCH_GRACE_MINUTES = 10;

export function validateTimezone(timezone: string): void {
  if (timezone.length > 50 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(timezone)) {
    invalid('Expected a valid IANA timezone');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    invalid('Expected a valid IANA timezone');
  }
}

function parseCron(cron: string, timezone: string, after: number) {
  const fields = cron.split(' ');
  if (
    fields.length !== 5 ||
    fields.some(field => !/^[\d*,/-]+$/.test(field)) ||
    (fields[2] !== '*' && fields[4] !== '*') ||
    fields[4].split(/\D+/).some(value => Number(value) > 6)
  ) {
    invalid(
      'Expected a numeric five-field cron; one of day-of-month/day-of-week must be *, Sunday is 0',
      'invalid_cron_expression'
    );
  }
  try {
    return CronExpressionParser.parse(`0 ${cron}`, {
      currentDate: after,
      tz: timezone,
      strict: true,
    });
  } catch (error) {
    invalid(
      `Invalid cron: ${error instanceof Error ? error.message : String(error)}`,
      'invalid_cron_expression'
    );
  }
}

/**
 * Match @api/schedules getMinimumCronCadenceMinutes: compare gaps between cron
 * wall-clock slots, without applying UTC-offset changes. For example, a daily
 * slot has a 1440-minute cadence even on a 23-hour day. Timezone still determines
 * actual firing times in nextCronOccurrence; this is only jitter validation.
 */
export function minimumCronCadenceMinutes(
  cron: string,
  timezone: string
): number {
  const { fields } = parseCron(cron, timezone, 0);
  const times = fields.hour.values.flatMap(hour =>
    fields.minute.values.map(minute => hour * 60 + minute)
  );
  let dayCycle = 1440;
  const [, , dayOfMonth, month, dayOfWeek] = cron.split(' ');
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = fields.dayOfWeek.values.map(Number);
    let gap = 7 - days[days.length - 1] + days[0];
    for (let i = 1; i < days.length; i++)
      gap = Math.min(gap, days[i] - days[i - 1]);
    dayCycle *= gap;
  }
  let cadence = dayCycle - times[times.length - 1] + times[0];
  for (let i = 1; i < times.length; i++)
    cadence = Math.min(cadence, times[i] - times[i - 1]);
  return cadence;
}

export function validateCronJitter(
  cron: string,
  timezone: string,
  jitter: number
): void {
  if (jitter > minimumCronCadenceMinutes(cron, timezone)) {
    invalid('Jitter exceeds the cron cadence', 'jitter_exceeds_cadence');
  }
}

/**
 * Latest time a scheduled occurrence may still be dispatched, or undefined when
 * it never expires. Matches subscriber-dispatch-schedules
 * computeDispatchDeadlineMs: a cron occurrence expires once its jitter window
 * (one minute when unset) plus the cron's cadence, at least ten minutes, has
 * passed. Single-fire occurrences and calendar-pinned crons never expire.
 */
export function dispatchDeadline(
  expression: ScheduleExpression,
  timezone: string,
  jitter: number | undefined,
  scheduledAt: number
): number | undefined {
  if (expression.type !== 'cron') return undefined;
  const [, , dayOfMonth, month] = expression.cron.split(' ');
  if (dayOfMonth !== '*' || month !== '*') return undefined;
  const grace = Math.max(
    MIN_DISPATCH_GRACE_MINUTES,
    minimumCronCadenceMinutes(expression.cron, timezone)
  );
  return scheduledAt + ((jitter ?? 1) + grace) * 60_000;
}

/** Skip nonexistent wall times and execute repeated wall times only once. */
export function nextCronOccurrence(
  cron: string,
  timezone: string,
  after: number
): number {
  const iterator = parseCron(cron, timezone, after);
  // A DST transition can skip candidates, but cannot cause an unbounded scan.
  for (let attempt = 0; attempt < 1500; attempt++) {
    let timestamp: number;
    try {
      timestamp = iterator.next().getTime();
    } catch {
      invalid('Cron has no calculable next occurrence');
    }
    const local = DateTime.fromMillis(timestamp, { zone: timezone });
    const fields = iterator.fields;
    if (
      !fields.hour.values.some(hour => hour === local.hour) ||
      !fields.minute.values.some(minute => minute === local.minute)
    ) {
      continue; // cron-parser shifts a nonexistent local hour forward.
    }
    const first = Math.min(
      ...local.getPossibleOffsets().map(date => date.toMillis())
    );
    if (timestamp === first) return timestamp;
  }
  invalid('Could not resolve cron across timezone transitions');
}

/** Match @api/schedules scheduleSingleAtSchema: minute precision, stored with :00 seconds. */
export function normalizeSingleAt(at: string): string {
  if (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) {
    return `${at}:00`;
  }
  if (
    typeof at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(at)
  ) {
    invalid(
      'Expected YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:00 without a timezone suffix'
    );
  }
  return at;
}

export function singleOccurrence(at: string, timezone: string): number {
  at = normalizeSingleAt(at);
  const local = DateTime.fromISO(at, { zone: timezone });
  if (!local.isValid || local.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== at) {
    invalid('One-shot time is invalid or nonexistent in its timezone');
  }
  // Production does not yet resolve these explicitly; reject rather than guess.
  if (local.getPossibleOffsets().length !== 1) {
    invalid('Ambiguous one-shot time in its timezone');
  }
  return local.toMillis();
}

export function nextOccurrence(
  expression: ScheduleExpression,
  timezone: string,
  after: number
): number | undefined {
  if (expression.type === 'cron') {
    return nextCronOccurrence(expression.cron, timezone, after);
  }
  if (expression.type !== 'single') invalid('Unknown schedule expression type');
  const at = singleOccurrence(expression.at, timezone);
  return at >= after ? at : undefined;
}
