import {
  getFlagAttributeType,
  isTimestampAttributeType,
} from './attribute-types';
import type {
  FlagCondition,
  FlagSettings,
  SegmentCondition,
  SegmentData,
  SegmentOperation,
  SegmentRule,
} from './types';

const EPOCH_MS_PATTERN = /^\d+$/;

// Requires a full date and a time with at least minutes, matching the
// precision the dashboard Timestamp editor enforces. The timezone is
// optional; without one, Date.parse applies this machine's timezone.
const ISO_TIMESTAMP_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?$/;

// 2001-09-09T01:46:40Z. Bare years ("2026") and epoch seconds both fall
// below this, and both silently target ~1970 when read as epoch ms.
// ISO input can still express earlier instants explicitly.
const MIN_EPOCH_MS = 1e12;
// Maximum value representable by a JS Date.
const MAX_EPOCH_MS = 8640000000000000;

const TIMESTAMP_FORMAT_HELP =
  'Use an ISO 8601 date and time (for example 2026-04-16T09:00:00Z) or epoch milliseconds.';

const TIMESTAMP_COMPARATOR_HELP =
  'Use after, before, on-or-after, on-or-before, eq, or ex. after and before are exclusive; use on-or-after or on-or-before for inclusive boundaries.';

const UNSUPPORTED_TIMESTAMP_COMPARATORS = new Set([
  'startsWith',
  'endsWith',
  'contains',
  '!contains',
  'containsAllOf',
  'containsAnyOf',
  'containsNoneOf',
]);

export function parseTimestampInput(value: string): number {
  const trimmed = value.trim();

  if (EPOCH_MS_PATTERN.test(trimmed)) {
    return validateTimestampEpochMs(Number(trimmed));
  }

  const isoMatch = ISO_TIMESTAMP_PATTERN.exec(trimmed);
  if (isoMatch?.groups) {
    assertValidIsoTimestampParts(trimmed, isoMatch.groups);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return acceptTimestampEpochMs(parsed);
    }
  }

  throw new Error(`Invalid timestamp "${value}". ${TIMESTAMP_FORMAT_HELP}`);
}

/**
 * Rejects calendar/time overflows that Date.parse would otherwise roll
 * forward (for example 2026-02-29 → March 1). Conversion still uses
 * Date.parse so timezone rules stay unchanged: no offset/Z → local time,
 * offset or Z → the given zone.
 */
function assertValidIsoTimestampParts(
  value: string,
  parts: Record<string, string>
): void {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = parts.second === undefined ? 0 : Number(parts.second);

  const utcProbe = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second)
  );
  if (
    utcProbe.getUTCFullYear() !== year ||
    utcProbe.getUTCMonth() !== month - 1 ||
    utcProbe.getUTCDate() !== day ||
    utcProbe.getUTCHours() !== hour ||
    utcProbe.getUTCMinutes() !== minute ||
    utcProbe.getUTCSeconds() !== second
  ) {
    throw new Error(`Invalid timestamp "${value}". ${TIMESTAMP_FORMAT_HELP}`);
  }
}

/**
 * Digit-string user input. Requires a millisecond floor so bare years and
 * epoch seconds fail closed instead of silently targeting ~1970.
 */
export function validateTimestampEpochMs(value: number): number {
  if (
    Number.isSafeInteger(value) &&
    value >= MIN_EPOCH_MS &&
    value <= MAX_EPOCH_MS
  ) {
    return value;
  }

  throw new Error(
    `Invalid timestamp "${value}". Epoch values must be milliseconds, not seconds or years. ${TIMESTAMP_FORMAT_HELP}`
  );
}

/**
 * Already-parsed ISO results or stored numeric RHS values. Allows pre-2001
 * instants that digit-string input rejects, so re-coercion during segment
 * updates does not throw on historically valid timestamps.
 */
export function acceptTimestampEpochMs(value: number): number {
  if (
    Number.isSafeInteger(value) &&
    value >= -MAX_EPOCH_MS &&
    value <= MAX_EPOCH_MS &&
    !Number.isNaN(new Date(value).getTime())
  ) {
    return value;
  }

  throw new Error(`Invalid timestamp "${value}". ${TIMESTAMP_FORMAT_HELP}`);
}

export function formatTimestampValue(value: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

/**
 * Where a timestamp value came from.
 * - `input`: CLI/JSON the user just typed. Digit strings may already have been
 *   promoted to numbers by `parseConditionValue`, so numeric RHS must still
 *   use the strict millisecond floor (reject years / epoch seconds).
 * - `stored`: values already persisted (or merged from the API). Allow
 *   pre-2001 epoch ms so re-coercion during segment updates does not throw.
 */
export type TimestampCoercionSource = 'input' | 'stored';

export function coerceTimestampSegmentData(
  data: SegmentData,
  settings: FlagSettings,
  source: TimestampCoercionSource = 'stored'
): SegmentData {
  return {
    ...data,
    rules: data.rules?.map(rule => coerceTimestampRule(rule, settings, source)),
  };
}

export function coerceTimestampOperations(
  operations: SegmentOperation[],
  settings: FlagSettings,
  source: TimestampCoercionSource = 'input'
): SegmentOperation[] {
  return operations.map(operation => {
    if (operation.field !== 'rule' || !operation.rule) {
      return operation;
    }

    return {
      ...operation,
      rule: coerceTimestampRule(operation.rule, settings, source),
    };
  });
}

function coerceTimestampRule(
  rule: SegmentRule,
  settings: FlagSettings,
  source: TimestampCoercionSource
): SegmentRule {
  return {
    ...rule,
    conditions: rule.conditions.map(condition =>
      coerceTimestampCondition(condition, settings, source)
    ),
  };
}

export function coerceTimestampCondition<
  T extends FlagCondition | SegmentCondition,
>(
  condition: T,
  settings: FlagSettings | undefined,
  source: TimestampCoercionSource = 'stored'
): T {
  if (condition.lhs.type !== 'entity') {
    return condition;
  }

  const attributeType = getFlagAttributeType(
    settings,
    condition.lhs.kind,
    condition.lhs.attribute
  );
  if (!isTimestampAttributeType(attributeType)) {
    return condition;
  }

  if (UNSUPPORTED_TIMESTAMP_COMPARATORS.has(condition.cmp)) {
    throw new Error(
      `Operator "${condition.cmp}" is not valid for Timestamp attribute ${condition.lhs.kind}.${condition.lhs.attribute}. ${TIMESTAMP_COMPARATOR_HELP}`
    );
  }

  if (typeof condition.rhs === 'string') {
    return {
      ...condition,
      rhs: parseTimestampInput(condition.rhs),
    };
  }

  if (typeof condition.rhs === 'number') {
    return {
      ...condition,
      rhs: coerceTimestampEpochNumber(condition.rhs, source),
    };
  }

  if (isListRhs(condition.rhs)) {
    return {
      ...condition,
      rhs: {
        ...condition.rhs,
        items: condition.rhs.items.map(item => ({
          ...item,
          value: coerceTimestampListItemValue(item.value, source),
        })),
      },
    };
  }

  return condition;
}

function coerceTimestampEpochNumber(
  value: number,
  source: TimestampCoercionSource
): number {
  return source === 'input'
    ? validateTimestampEpochMs(value)
    : acceptTimestampEpochMs(value);
}

function coerceTimestampListItemValue(
  value: unknown,
  source: TimestampCoercionSource
): unknown {
  if (typeof value === 'string') {
    return parseTimestampInput(value);
  }
  if (typeof value === 'number') {
    return coerceTimestampEpochNumber(value, source);
  }
  return value;
}

function isListRhs(
  rhs: unknown
): rhs is { type: string; items: { value?: unknown }[] } {
  return (
    typeof rhs === 'object' &&
    rhs !== null &&
    'items' in rhs &&
    Array.isArray((rhs as { items?: unknown }).items)
  );
}

export function formatTimestampRhs(
  value: unknown,
  attributeType?: string
): string | undefined {
  if (typeof value !== 'number' || !isTimestampAttributeType(attributeType)) {
    return undefined;
  }

  return formatTimestampValue(value);
}
