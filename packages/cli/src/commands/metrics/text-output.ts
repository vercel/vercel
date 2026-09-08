import chalk from 'chalk';
import table from '../../util/output/table';
import indent from '../../util/output/indent';
import elapsed from '../../util/output/elapsed';
import { formatGranularity } from '../../util/output/format-granularity';
import { ellipsizeMiddle } from '../../util/output/truncate';
import { getResolvedOrderMetadata, getRollupColumnName } from './output';
import { toGranularityMsFromDuration } from './time-utils';
import { normalizeMetricUnit } from './metric-units';
import type {
  Aggregation,
  Granularity,
  MetricsDataRow,
  MetricsQueryResponse,
  OrderBy,
  OrderDirection,
  Scope,
} from './types';

export interface TimeSeriesPoint {
  timestamp: string;
  value: number | null;
}

export interface GroupStats {
  total: number;
  avg: number;
  min: { value: number; timestamp: string };
  max: { value: number; timestamp: string };
  count: number;
  allMissing: boolean;
}

export interface ExtractGroupedSeriesResult {
  groups: string[];
  series: Map<string, TimeSeriesPoint[]>;
  groupValues: Map<string, string[]>;
}

interface SummaryTableRow {
  groupValues: string[];
  stats: GroupStats;
}

interface SummaryTableOptions {
  rows: SummaryTableRow[];
  groupByFields: string[];
  aggregation: Aggregation;
  periodStart: Date;
  periodEnd: Date;
  formatValue: MetricValueFormatter;
  ansiAwareGroupValues?: boolean;
}

interface MetadataHeaderOptions {
  metric: string;
  aggregation: Aggregation;
  periodStart: string;
  periodEnd: string;
  granularity: Granularity;
  periodUnique?: number;
  bucketTimezone?: string;
  filter?: string;
  orderBy?: OrderBy;
  orderDirection?: OrderDirection;
  scope: Scope;
  projectName?: string;
  teamName?: string;
  groupCount?: number;
  compact?: boolean;
}

export interface TextOutputPresentation {
  compact?: boolean;
  formatGroupValue?: (field: string, value: string) => string;
}

export interface FormatTextOptions {
  metric: string;
  metricUnit?: string;
  aggregation: Aggregation;
  groupBy: string[];
  filter?: string;
  scope: Scope;
  projectName?: string;
  teamName?: string;
  periodStart: string;
  periodEnd: string;
  granularity: Granularity;
  bucketTimezone?: string;
  orderBy?: OrderBy;
  orderDirection?: OrderDirection;
  presentation?: TextOutputPresentation;
}

// Use a non-printable delimiter so group keys remain stable without colliding
// with user-visible values (which can contain common separators like "|" or ",").
const GROUP_KEY_DELIMITER = '\u001f';
const MAX_SPARKLINE_LENGTH = 120;

type TableAlignment = 'l' | 'c' | 'r';
type StatColumn = 'total' | 'avg' | 'min' | 'max';
type MetricValueFormatter = (
  value: number,
  opts?: { preserveFractionalCount?: boolean }
) => string;

const DURATION_SCALE_MS: Readonly<Record<string, number>> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};
const BYTE_SCALE: Readonly<Record<string, number>> = {
  bytes: 1,
  kilobytes: 1_000,
  megabytes: 1_000_000,
  gigabytes: 1_000_000_000,
  terabytes: 1_000_000_000_000,
  petabytes: 1_000_000_000_000_000,
};
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
});
const TWO_FRACTION_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const TWO_SIGNIFICANT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumSignificantDigits: 2,
  maximumSignificantDigits: 2,
  maximumFractionDigits: 2,
});
const PERCENTAGE_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'unit',
  unit: 'percent',
  unitDisplay: 'narrow',
  maximumFractionDigits: 1,
});
const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
export const MISSING_CHAR = '·';

/**
 * An aggregation may carry a dimension qualifier (e.g. `unique/visitor_id`),
 * where the part before the `/` is the aggregation and the rest is the
 * dimension it operates over.
 */
function isAggregationWithDimension(aggregation: Aggregation): boolean {
  const [, dimension] = aggregation.split('/');
  return Boolean(dimension);
}

/** Builds an internal map key from grouped dimension values. */
function toGroupKey(groupValues: string[]): string {
  if (groupValues.length === 0) {
    return '';
  }
  return groupValues.join(GROUP_KEY_DELIMITER);
}

/** Left-pads a number to two digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Left-pads a number to four digits. */
function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Formats a UTC date as YYYY-MM-DD HH:MM. */
function formatHumanMinute(date: Date): string {
  return `${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

/** Formats a period bound string for metadata, preserving invalid input as-is. */
function formatPeriodBound(input: string): string {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    return input;
  }
  // Keep metadata period compact and deterministic at minute precision.
  return formatHumanMinute(date);
}

/** Formats the elapsed time between valid period bounds. */
function formatPeriodSpan(startInput: string, endInput: string): string | null {
  const start = Date.parse(startInput);
  const end = Date.parse(endInput);
  const durationMs = end - start;

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return elapsed(durationMs);
}

/** Chooses summary statistic columns based on aggregation. */
function getStatColumns(aggregation: Aggregation): StatColumn[] {
  if (aggregation === 'sum' || aggregation === 'count') {
    return ['total', 'avg', 'min', 'max'];
  }
  return ['avg', 'min', 'max'];
}

/** Parses API cell values into finite numbers or null for missing/invalid. */
function toNumericValue(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNonNullNumber(value: number | null): value is number {
  return value !== null;
}

function isPointWithValue(
  point: TimeSeriesPoint
): point is { timestamp: string; value: number } {
  return point.value !== null;
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = make();
  map.set(key, created);
  return created;
}

function getGroupFieldValue(row: MetricsDataRow, field: string): string {
  const value = row[field];
  return value == null || value === '' ? '(not set)' : String(value);
}

/**
 * Canonicalizes API timestamps to ISO strings with millisecond precision.
 * We build expected buckets via `toISOString()` (e.g. `...00.000Z`), while API
 * rows may use equivalent forms like `...00Z`. Normalizing avoids false
 * "missing" buckets caused by string-format differences.
 */
function normalizeTimestampToIso(timestamp: string): string | null {
  const parsed = Date.parse(timestamp);
  if (isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

/** Formats one summary statistic cell, including min/max timestamps. */
function formatStatCell(
  column: StatColumn,
  stats: GroupStats,
  periodStart: Date,
  periodEnd: Date,
  formatValue: MetricValueFormatter
): string {
  switch (column) {
    case 'total':
      return formatValue(stats.total);
    case 'avg':
      return formatValue(stats.avg, {
        preserveFractionalCount: true,
      });
    case 'min': {
      const ts = formatMinMaxTimestamp(
        new Date(stats.min.timestamp),
        periodStart,
        periodEnd
      );
      return `${formatValue(stats.min.value)} at ${ts}`;
    }
    case 'max': {
      const ts = formatMinMaxTimestamp(
        new Date(stats.max.timestamp),
        periodStart,
        periodEnd
      );
      return `${formatValue(stats.max.value)} at ${ts}`;
    }
  }
}

/** Builds expected timestamp buckets from period and granularity. */
function buildExpectedTimestamps(
  periodStart: string,
  periodEnd: string,
  granularityMs: number
): string[] {
  const start = Date.parse(periodStart);
  const end = Date.parse(periodEnd);
  if (isNaN(start) || isNaN(end) || granularityMs <= 0 || end <= start) {
    return [];
  }
  const timestamps: string[] = [];
  // Query output uses half-open bucket semantics: [start, end).
  // Meaning:
  // - include `start`
  // - exclude `end`
  //
  // Example with 5m granularity:
  // - start: 2026-02-19T10:00:00Z
  // - end:   2026-02-19T10:15:00Z
  // Buckets are: 10:00, 10:05, 10:10 (10:15 is not included).
  //
  // This avoids end-boundary off-by-one buckets and keeps adjacent ranges
  // non-overlapping (the next query can start exactly at the previous end).
  for (let current = start; current < end; current += granularityMs) {
    timestamps.push(new Date(current).toISOString());
  }
  return timestamps;
}

function buildObservedTimestamps(
  observedTimestamps: Set<string>,
  granularityMs: number
): string[] {
  const timestamps = [...observedTimestamps]
    .map(timestamp => Date.parse(timestamp))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (timestamps.length === 0 || granularityMs <= 0) {
    return [];
  }

  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1] + granularityMs;
  return buildExpectedTimestamps(
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    granularityMs
  );
}

function buildSeriesTimestamps(
  periodStart: string,
  periodEnd: string,
  granularityMs: number,
  observedTimestamps: Set<string>
): string[] {
  const expectedTimestamps = buildExpectedTimestamps(
    periodStart,
    periodEnd,
    granularityMs
  );

  if (
    observedTimestamps.size === 0 ||
    expectedTimestamps.some(timestamp => observedTimestamps.has(timestamp))
  ) {
    return expectedTimestamps;
  }

  return buildObservedTimestamps(observedTimestamps, granularityMs);
}

/**
 * Formats count-like values as rounded integers with `en-US` separators.
 * Example: `17880.2 -> "17,880"`.
 */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Formats decimal values with explicit, stable rules:
 * - `0` (or `-0`) -> `"0"`
 * - `abs(n) >= 1` -> one decimal place (e.g. `42 -> "42.0"`)
 * - `0 < abs(n) < 1` -> enough decimals to keep at least 2 significant digits
 *   without trailing zero noise (e.g. `0.042 -> "0.042"`).
 */
export function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) {
    return String(n);
  }
  if (n === 0 || Object.is(n, -0)) {
    return '0';
  }

  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  // Human-readable fixed precision for values >= 1.
  if (abs >= 1) {
    return `${sign}${abs.toFixed(1)}`;
  }

  // For fractional values, increase decimals until we have >=2 significant digits.
  const exponent = Math.floor(Math.log10(abs));
  const decimals = Math.min(20, Math.max(2, -exponent + 1));
  const fixed = abs.toFixed(decimals);
  const trimmed = fixed
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '')
    .replace(/\.$/, '');

  return `${sign}${trimmed}`;
}

function formatDuration(durationMs: number): string {
  const durationSeconds = durationMs / 1_000;
  if (durationMs < 1_000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  if (durationMs < 5_000) {
    return `${Math.round(durationSeconds * 100) / 100}s`;
  }
  if (durationSeconds < 60) {
    return `${durationSeconds.toFixed(0)}s`;
  }
  if (durationSeconds < 3_600) {
    return `${(durationSeconds / 60).toFixed(0)}m`;
  }
  return `${(durationSeconds / 3_600).toFixed(0)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  const absoluteBytes = Math.abs(bytes);
  let unitIndex = Math.min(
    units.length - 1,
    Math.max(0, Math.floor(Math.log(absoluteBytes) / Math.log(1_000)))
  );
  let value = bytes / 1_000 ** unitIndex;

  if (unitIndex === 1 || unitIndex === 2) {
    value = Math.round(value);
    if (Math.abs(value) === 1_000 && unitIndex < units.length - 1) {
      value /= 1_000;
      unitIndex += 1;
    }
  }

  return `${TWO_FRACTION_NUMBER_FORMATTER.format(value)} ${units[unitIndex]}`;
}

/** Formats metric values with the same unit semantics as the dashboard query builder. */
export function formatMetricValue(
  value: number,
  baseUnit: string | undefined,
  aggregation: Aggregation,
  opts?: { preserveFractionalCount?: boolean }
): string {
  const formatCountValue = () =>
    opts?.preserveFractionalCount && !Number.isInteger(value)
      ? formatDecimal(value)
      : formatCount(value);

  if (isAggregationWithDimension(aggregation) || aggregation === 'count') {
    return formatCountValue();
  }

  const unit = normalizeMetricUnit(baseUnit ?? 'units');
  if (aggregation === 'percent' || unit === 'percent') {
    return PERCENTAGE_FORMATTER.format(value);
  }
  if (aggregation === 'unique') {
    return COMPACT_NUMBER_FORMATTER.format(value);
  }

  const withRateSuffix = (formatted: string) =>
    aggregation === 'persecond' ? `${formatted}/s` : formatted;

  if (unit === 'milliseconds') {
    return withRateSuffix(formatDuration(value));
  }

  const durationScale = DURATION_SCALE_MS[unit];
  if (durationScale) {
    return withRateSuffix(formatDuration(value * durationScale));
  }

  if (unit === 'nanoseconds' || unit === 'microseconds') {
    const suffix = unit === 'nanoseconds' ? ' ns' : ' µs';
    const formatted = TWO_FRACTION_NUMBER_FORMATTER.format(value);
    return withRateSuffix(`${formatted}${suffix}`);
  }

  const byteScale = BYTE_SCALE[unit];
  if (byteScale) {
    return withRateSuffix(formatBytes(value * byteScale));
  }

  if (unit === 'gigabyte hour' || unit === 'gigabyte hours') {
    const formatted = TWO_SIGNIFICANT_NUMBER_FORMATTER.format(value);
    return withRateSuffix(`${formatted} GB-hrs`);
  }

  if (unit === 'usd' || unit === 'us dollars' || unit === 'dollars') {
    return withRateSuffix(USD_FORMATTER.format(value));
  }

  if (unit === 'count' && aggregation === 'sum') {
    return formatCountValue();
  }

  const formatted = COMPACT_NUMBER_FORMATTER.format(value);
  const unitLabel = baseUnit?.trim();
  if (!unitLabel || unit === 'units' || unit === 'count' || unit === 'ratio') {
    return withRateSuffix(formatted);
  }

  return withRateSuffix(`${formatted} ${unitLabel}`);
}

/**
 * Formats min/max timestamps based on queried period span (UTC):
 * - same day: `HH:MM`
 * - same year, different day: `MM-DD HH:MM`
 * - cross-year: `YYYY-MM-DD HH:MM`
 */
export function formatMinMaxTimestamp(
  date: Date,
  periodStart: Date,
  periodEnd: Date
): string {
  const sameDay =
    periodStart.getUTCFullYear() === periodEnd.getUTCFullYear() &&
    periodStart.getUTCMonth() === periodEnd.getUTCMonth() &&
    periodStart.getUTCDate() === periodEnd.getUTCDate();

  if (sameDay) {
    return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }

  const sameYear = periodStart.getUTCFullYear() === periodEnd.getUTCFullYear();
  if (sameYear) {
    return `${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }

  return `${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

/** Pivots flat API rows into complete per-group time series with null fills. */
export function extractGroupedSeries(
  data: MetricsDataRow[],
  groupBy: string[],
  rollupColumn: string,
  periodStart: string,
  periodEnd: string,
  granularityMs: number
): ExtractGroupedSeriesResult {
  const groups: string[] = [];
  const groupValues = new Map<string, string[]>();
  const valueByGroup = new Map<string, Map<string, number | null>>();
  const observedTimestamps = new Set<string>();

  for (const row of data) {
    const values = groupBy.map(field => getGroupFieldValue(row, field));
    const key = toGroupKey(values);
    if (!groupValues.has(key)) {
      // Preserve first-seen ordering from API response so output order is stable.
      groups.push(key);
      groupValues.set(key, values);
    }
    const groupMap = getOrCreate(valueByGroup, key, () => new Map());
    const rawTimestamp = row.timestamp;
    if (rawTimestamp.length === 0) {
      continue;
    }
    const timestamp = normalizeTimestampToIso(rawTimestamp);
    if (!timestamp) {
      continue;
    }

    observedTimestamps.add(timestamp);
    const numeric = toNumericValue(row[rollupColumn]);
    groupMap.set(timestamp, numeric);
  }

  const expectedTimestamps = buildSeriesTimestamps(
    periodStart,
    periodEnd,
    granularityMs,
    observedTimestamps
  );

  const series = new Map<string, TimeSeriesPoint[]>();
  for (const key of groups) {
    const byTimestamp = valueByGroup.get(key);
    if (!byTimestamp) {
      continue;
    }
    // Expand sparse API rows into complete series so every group aligns on time.
    const points = expectedTimestamps.map(timestamp => ({
      timestamp,
      value: byTimestamp.has(timestamp)
        ? (byTimestamp.get(timestamp) ?? null)
        : null,
    }));
    series.set(key, points);
  }

  return { groups, series, groupValues };
}

/**
 * Computes summary stats from one group's series.
 * Null points are treated as missing and excluded from total/avg/min/max.
 * If all points are missing, returns `allMissing=true` and zero placeholders.
 */
export function computeGroupStats(points: TimeSeriesPoint[]): GroupStats {
  const present = points.filter(isPointWithValue);

  if (present.length === 0) {
    return {
      total: 0,
      avg: 0,
      min: { value: 0, timestamp: '' },
      max: { value: 0, timestamp: '' },
      count: 0,
      allMissing: true,
    };
  }

  let total = 0;
  let min = present[0];
  let max = present[0];

  for (const point of present) {
    total += point.value;
    if (point.value < min.value) {
      min = point;
    }
    if (point.value > max.value) {
      max = point;
    }
  }

  return {
    total,
    avg: total / present.length,
    min: { value: min.value, timestamp: min.timestamp },
    max: { value: max.value, timestamp: max.timestamp },
    count: present.length,
    allMissing: false,
  };
}

/** Maximum display length for group values before ellipsizing. */
const MAX_GROUP_VALUE_LENGTH = 60;

/**
 * Reduces long series to `maxLen` buckets.
 * Bucket rules:
 * - all null -> null
 * - more than 50% null -> null
 * - otherwise -> average of present values
 */
export function downsample(
  values: (number | null)[],
  maxLen: number
): (number | null)[] {
  if (maxLen <= 0) {
    return [];
  }
  if (values.length <= maxLen) {
    return [...values];
  }

  const result: (number | null)[] = [];
  for (let i = 0; i < maxLen; i++) {
    const start = Math.floor((i * values.length) / maxLen);
    const end = Math.floor(((i + 1) * values.length) / maxLen);
    const bucket = values.slice(start, Math.max(start + 1, end));
    const nullCount = bucket.filter(value => value === null).length;

    // If missing dominates a bucket, keep it missing so gaps remain visible.
    if (nullCount === bucket.length || nullCount > bucket.length / 2) {
      result.push(null);
      continue;
    }

    const present = bucket.filter(isNonNullNumber);
    const avg = present.reduce((sum, value) => sum + value, 0) / present.length;
    result.push(avg);
  }

  return result;
}

/**
 * Encodes a series as sparkline characters:
 * - scales each series independently from its own min/max
 * - null values become `·`
 * - constant nonzero becomes `█`, constant zero becomes `▁`
 */
export function generateSparkline(values: (number | null)[]): string {
  const sampled = downsample(values, MAX_SPARKLINE_LENGTH);
  if (sampled.length === 0) {
    return '';
  }

  const present = sampled.filter(isNonNullNumber);
  if (present.length === 0) {
    // Entire series missing: keep positional placeholders instead of empty output.
    return sampled.map(() => MISSING_CHAR).join('');
  }

  const min = Math.min(...present);
  const max = Math.max(...present);

  if (min === max) {
    // Constant series still conveys presence instead of shape:
    // - [5, 5, 5] -> "███"
    // - [0, 0, 0] -> "▁▁▁"
    // - [5, null, 5] -> "█·█"
    const block = min === 0 ? BLOCKS[0] : BLOCKS[BLOCKS.length - 1];
    return sampled
      .map(value => (value === null ? MISSING_CHAR : block))
      .join('');
  }

  const range = max - min;
  return sampled
    .map(value => {
      if (value === null) {
        return MISSING_CHAR;
      }
      const ratio = (value - min) / range;
      const index = Math.max(
        0,
        Math.min(BLOCKS.length - 1, Math.round(ratio * (BLOCKS.length - 1)))
      );
      return BLOCKS[index];
    })
    .join('');
}

/** Builds aligned metadata header lines shown above results. */
export function formatMetadataHeader(opts: MetadataHeaderOptions): string {
  const periodSpan = opts.compact
    ? formatPeriodSpan(opts.periodStart, opts.periodEnd)
    : null;
  const rows: Array<{ key: string; value: string }> = [];

  if (!opts.compact) {
    rows.push({
      key: 'Metric',
      value: `${opts.metric} ${opts.aggregation}`,
    });
  }

  rows.push(
    {
      // Period bounds are always UTC; annotate them so the boundary is
      // unambiguous when the Interval below reports a different
      // --bucket-timezone.
      key: 'Period',
      value: `${formatPeriodBound(opts.periodStart)} to ${formatPeriodBound(opts.periodEnd)} (UTC)${periodSpan ? ` ${periodSpan}` : ''}`,
    },
    {
      // Period bounds are always UTC; the timezone only controls calendar
      // bucket alignment, which is a no-op below 1d granularity. Annotate the
      // interval (instead of a standalone Timezone row) to avoid implying the
      // period itself is zone-local.
      key: 'Interval',
      value:
        'days' in opts.granularity
          ? `${formatGranularity(opts.granularity)} (${opts.bucketTimezone ?? 'UTC'})`
          : formatGranularity(opts.granularity),
    }
  );

  // Whole-period deduplicated count from the API summary. Per-bucket uniques
  // cannot be summed, so this is the only correct period total for `unique`.
  if (typeof opts.periodUnique === 'number') {
    rows.push({
      key: 'Unique (period)',
      value: formatCount(opts.periodUnique),
    });
  }

  if (!opts.compact && opts.filter) {
    rows.push({ key: 'Filter', value: opts.filter });
  }

  if (!opts.compact && opts.orderBy && opts.orderDirection) {
    rows.push({
      key: 'Order By',
      value: `${opts.orderBy} ${opts.orderDirection}${
        opts.orderBy === 'count' ? ' (default)' : ''
      }`,
    });
  }

  if (opts.scope.type === 'project') {
    rows.push({
      key: 'Project',
      value: `${opts.projectName ?? opts.scope.projectIds[0]} (${opts.teamName ?? opts.scope.ownerId})`,
    });
  } else {
    rows.push({
      key: 'Team',
      value: `${opts.teamName ?? opts.scope.ownerId} (all projects)`,
    });
  }

  if (!opts.compact && typeof opts.groupCount === 'number') {
    rows.push({ key: 'Groups', value: String(opts.groupCount) });
  }

  // Match the usage command's metadata style with `>`-prefixed lines.
  return rows
    .map(row => `> ${chalk.gray(`${row.key}:`)} ${row.value}`)
    .join('\n');
}

/** Renders the summary table section. */
export function formatSummaryTable(opts: SummaryTableOptions): string {
  const statColumns = getStatColumns(opts.aggregation);
  const header = [...opts.groupByFields, ...statColumns];
  const rows: string[][] = [header.map(name => chalk.bold(chalk.cyan(name)))];

  for (const row of opts.rows) {
    const nextRow: string[] = row.groupValues.map(v =>
      ellipsizeMiddle(v, MAX_GROUP_VALUE_LENGTH, opts.ansiAwareGroupValues)
    );

    if (row.stats.allMissing) {
      nextRow.push(...statColumns.map(() => '--'));
      rows.push(nextRow);
      continue;
    }

    nextRow.push(
      ...statColumns.map(column =>
        formatStatCell(
          column,
          row.stats,
          opts.periodStart,
          opts.periodEnd,
          opts.formatValue
        )
      )
    );
    rows.push(nextRow);
  }

  const centeredColumns = new Set(['min', 'max']);
  const align: TableAlignment[] = header.map(col =>
    centeredColumns.has(col) ? 'c' : 'r'
  );
  return indent(
    table(rows, {
      align,
      hsep: 2,
    }),
    2
  );
}

/** Renders the `sparklines:` section for grouped or ungrouped output. */
export function formatSparklineSection(
  groupRows: string[][],
  sparklines: string[],
  groupByFields: string[],
  compact: boolean = false
): string {
  if (groupRows.length === 0) {
    const sparkline = sparklines[0];
    const chart = sparkline ? indent(sparkline, 2) : '';
    return compact ? chart : ['sparklines:', chart].filter(Boolean).join('\n');
  }

  const header = [...groupByFields, compact ? '' : 'sparkline'];
  const rows = [
    header.map(name => chalk.bold(chalk.cyan(name))),
    ...groupRows.map((groupValues, index) => [
      ...groupValues.map(v =>
        ellipsizeMiddle(v, MAX_GROUP_VALUE_LENGTH, compact)
      ),
      sparklines[index] ?? '',
    ]),
  ];
  const align: TableAlignment[] = groupByFields.map(() => 'r');
  align.push('l');
  const chart = indent(
    table(rows, {
      align,
      hsep: 2,
    }),
    2
  );
  return compact ? chart : `sparklines:\n${chart}`;
}

/**
 * Composes final text output:
 * metadata + summary table + sparklines.
 * If there is no data, returns metadata and a deterministic `No data` line.
 */
export function formatText(
  response: MetricsQueryResponse,
  opts: FormatTextOptions
): string {
  const rollupColumn = getRollupColumnName(opts.metric, opts.aggregation);
  const formatValue: MetricValueFormatter = (value, formatOptions) =>
    formatMetricValue(value, opts.metricUnit, opts.aggregation, formatOptions);
  const granularityMs = toGranularityMsFromDuration(opts.granularity);
  const orderMetadata = getResolvedOrderMetadata(opts, response);

  const { groups, series, groupValues } = extractGroupedSeries(
    response.data ?? [],
    opts.groupBy,
    rollupColumn,
    opts.periodStart,
    opts.periodEnd,
    granularityMs
  );

  // Surface the whole-period deduplicated count for ungrouped unique queries.
  // With --group-by the summary holds one row per group, which a single header
  // line cannot represent.
  let periodUnique: number | undefined;
  if (
    isAggregationWithDimension(opts.aggregation) &&
    opts.groupBy.length === 0
  ) {
    const summaryValue = toNumericValue(response.summary?.[0]?.[rollupColumn]);
    if (summaryValue !== null) {
      periodUnique = summaryValue;
    }
  }

  const metadata = formatMetadataHeader({
    metric: opts.metric,
    aggregation: opts.aggregation,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    granularity: opts.granularity,
    periodUnique,
    bucketTimezone: opts.bucketTimezone,
    filter: opts.filter,
    ...(opts.groupBy.length > 0 ? orderMetadata : {}),
    scope: opts.scope,
    projectName: opts.projectName,
    teamName: opts.teamName,
    groupCount: opts.groupBy.length > 0 ? groups.length : undefined,
    compact: opts.presentation?.compact,
  });

  if (groups.length === 0) {
    // Keep a minimal deterministic output when query returns no rows.
    return `${metadata}\n\nNo data found for this period.\n`;
  }

  const summaryRows: SummaryTableRow[] = [];
  const groupRows: string[][] = [];
  const sparklineRows: string[] = [];

  for (const key of groups) {
    const points = series.get(key) ?? [];
    const values = points.map(point => point.value);
    const currentGroupValues = groupValues.get(key) ?? [];
    const displayGroupValues = currentGroupValues.map((value, index) => {
      const field = opts.groupBy[index];
      return opts.presentation?.formatGroupValue?.(field, value) ?? value;
    });

    summaryRows.push({
      groupValues: displayGroupValues,
      stats: computeGroupStats(points),
    });
    groupRows.push(displayGroupValues);
    sparklineRows.push(generateSparkline(values));
  }

  const summaryTable = formatSummaryTable({
    rows: summaryRows,
    groupByFields: opts.groupBy,
    aggregation: opts.aggregation,
    periodStart: new Date(opts.periodStart),
    periodEnd: new Date(opts.periodEnd),
    formatValue,
    ansiAwareGroupValues: opts.presentation?.compact,
  });

  const groupedOutput = opts.groupBy.length > 0;
  const sparklineSection = formatSparklineSection(
    groupedOutput ? groupRows : [],
    sparklineRows,
    opts.groupBy,
    opts.presentation?.compact
  );

  const sections = [metadata, summaryTable, sparklineSection];

  return `${sections.join('\n\n')}\n`;
}
