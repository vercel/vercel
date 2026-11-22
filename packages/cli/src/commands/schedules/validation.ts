import ms from 'ms';
import type { JSONValue } from '@vercel-internals/types';
import type { ScheduleExpression } from '../../util/schedules/types';

const MAX_IDENTIFIER_LENGTH = 256;
const IDENTIFIER_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const MAX_QUEUE_TOPIC_LENGTH = 256;
const QUEUE_TOPIC_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_JITTER_MINUTES = 15;
const LOCAL_MINUTE_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const LOCAL_SECOND_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+/-]*$/;

export function validateScheduleIdentifier(
  value: string,
  label: string
): string | undefined {
  if (value.length > MAX_IDENTIFIER_LENGTH) {
    return `${label} must be at most ${MAX_IDENTIFIER_LENGTH} characters.`;
  }
  if (!IDENTIFIER_PATTERN.test(value)) {
    return `${label} must start with a letter or number and can contain only letters, numbers, periods, underscores, and hyphens.`;
  }
}

export function validateScheduleTimezone(
  value: string | undefined
): string | undefined {
  if (value === undefined) return;
  if (
    value.length === 0 ||
    value.length > 50 ||
    !TIMEZONE_PATTERN.test(value)
  ) {
    return '`--timezone` must be a valid IANA timezone.';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    return '`--timezone` must be a valid IANA timezone.';
  }
}

export function validateScheduleQueueTopic(value: string): string | undefined {
  if (
    value.length > MAX_QUEUE_TOPIC_LENGTH ||
    !QUEUE_TOPIC_PATTERN.test(value)
  ) {
    return '`--topic` must be 1–256 characters and contain only letters, numbers, underscores, and hyphens.';
  }
}

function normalizeLocalDatetime(value: string): string | undefined {
  const secondMatch = LOCAL_SECOND_DATETIME_PATTERN.exec(value);
  if (secondMatch) {
    if (secondMatch[6] !== '00') return undefined;
  } else if (LOCAL_MINUTE_DATETIME_PATTERN.test(value)) {
    value = `${value}:00`;
  }

  const match = LOCAL_SECOND_DATETIME_PATTERN.exec(value);
  if (!match) return undefined;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1] ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return undefined;
  }

  return value;
}

type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; error: string };

export function parseScheduleExpression(
  cron: string | undefined,
  at: string | undefined,
  required: boolean
): ValidationResult<ScheduleExpression | undefined> {
  if (cron !== undefined && at !== undefined) {
    return {
      valid: false,
      error: 'Use either `--cron` or `--at`, not both.',
    };
  }
  if (cron !== undefined) {
    if (!cron.trim()) {
      return { valid: false, error: '`--cron` cannot be empty.' };
    }
    return { valid: true, value: { type: 'cron', cron } };
  }
  if (at !== undefined) {
    const normalized = normalizeLocalDatetime(at);
    if (normalized === undefined) {
      return {
        valid: false,
        error:
          '`--at` must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:00 without a timezone suffix. Use `--timezone` to select the timezone.',
      };
    }
    return { valid: true, value: { type: 'single', at: normalized } };
  }
  if (required) {
    return {
      valid: false,
      error: 'A schedule expression is required. Use `--cron` or `--at`.',
    };
  }
  return { valid: true, value: undefined };
}

function validateJitter(value: number): ValidationResult<number> {
  if (!Number.isInteger(value) || value < 1 || value > MAX_JITTER_MINUTES) {
    return {
      valid: false,
      error: '`--jitter` must be an integer between 1 and 15.',
    };
  }
  return { valid: true, value };
}

export function parseCreateJitter(
  value: number | undefined
): ValidationResult<number | undefined> {
  return value === undefined
    ? { valid: true, value: undefined }
    : validateJitter(value);
}

export function parseUpdateJitter(
  value: string | undefined
): ValidationResult<number | null | undefined> {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === 'none') return { valid: true, value: null };
  return validateJitter(Number(value));
}

export function parseSchedulePayload(
  value: string | undefined
): ValidationResult<JSONValue | undefined> {
  if (value === undefined) return { valid: true, value: undefined };
  try {
    return { valid: true, value: JSON.parse(value) as JSONValue };
  } catch {
    return { valid: false, error: '`--payload` must be valid JSON.' };
  }
}

const UNIX_MILLISECONDS_PATTERN = /^\d+$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const DURATION_PATTERN = /^\d+(?:\.\d+)?\s*[a-z]+$/i;

/** Resolves `enable --until`/`--for` to the Unix ms the schedule stays enabled until. */
export function parseEnableUntil(
  until: string | undefined,
  duration: string | undefined,
  now: number = Date.now()
): ValidationResult<number | undefined> {
  if (until !== undefined && duration !== undefined) {
    return {
      valid: false,
      error: '`--until` and `--for` cannot be used together.',
    };
  }
  if (duration !== undefined) {
    const durationMs = DURATION_PATTERN.test(duration.trim())
      ? ms(duration.trim())
      : undefined;
    if (durationMs === undefined || !(durationMs > 0)) {
      return {
        valid: false,
        error: '`--for` must be a duration such as 30m, 5h, or 10s.',
      };
    }
    return { valid: true, value: now + durationMs };
  }
  if (until === undefined) return { valid: true, value: undefined };

  let untilMs: number;
  const isoDate = ISO_DATE_PATTERN.exec(until);
  if (UNIX_MILLISECONDS_PATTERN.test(until)) {
    untilMs = Number(until);
  } else if (isoDate) {
    // Date.parse rolls a day past the end of its month into the next one
    // (2027-02-29 becomes March 1), so reject days the month doesn't have.
    const [, year, month, day] = isoDate.map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    untilMs = day >= 1 && day <= daysInMonth ? Date.parse(until) : NaN;
  } else {
    return {
      valid: false,
      error: DURATION_PATTERN.test(until.trim())
        ? `\`--until\` must be a time, not a duration. Use \`--for ${until.trim()}\` instead.`
        : '`--until` must be an ISO 8601 time or Unix milliseconds.',
    };
  }
  if (!Number.isFinite(untilMs)) {
    return {
      valid: false,
      error: '`--until` must be an ISO 8601 time or Unix milliseconds.',
    };
  }
  if (untilMs <= now) {
    return { valid: false, error: '`--until` must be in the future.' };
  }
  return { valid: true, value: untilMs };
}
