import chalk from 'chalk';
import table from '../../util/output/table';
import indent from '../../util/output/indent';
import { getMeasures } from './schema-data';
import { getRollupColumnName } from './output';
import { toGranularityMsFromDuration } from './time-utils';
import type {
  Granularity,
  MetricsAggregation,
  MetricsDataRow,
  MetricsQueryResponse,
  Scope,
} from './types';

export type MeasureType = 'count' | 'duration' | 'bytes' | 'ratio';

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
  measureType: MeasureType;
  aggregation: MetricsAggregation;
  periodStart: Date;
  periodEnd: Date;
}

interface MetadataHeaderOptions {
  event: string;
  measure: string;
  aggregation: MetricsAggregation;
  periodStart: string;
  periodEnd: string;
  granularity: Granularity;
  filter?: string;
  scope: Scope;
  projectName?: string;
  teamName?: string;
  unit?: string;
  groupCount?: number;
}

export interface FormatTextOptions {
  event: string;
  measure: string;
  aggregation: MetricsAggregation;
  groupBy: string[];
  filter?: string;
  scope: Scope;
  projectName?: string;
  teamName?: string;
  periodStart: string;
  periodEnd: string;
  granularity: Granularity;
}

// Use a non-printable delimiter so group keys remain stable without colliding
// with user-visible values (which can contain common separators like "|" or ",").
const GROUP_KEY_DELIMITER = '\u001f';
const MAX_SPARKLINE_LENGTH = 120;

type TableAlignment = 'l' | 'c' | 'r';
type StatColumn = 'total' | 'avg' | 'min' | 'max';

const COUNT_UNITS = new Set(['count', 'us dollars', 'dollars']);
const DURATION_UNITS = new Set(['milliseconds', 'seconds']);
const BYTES_UNITS = new Set([
  'bytes',
  'megabytes',
  'gigabyte hours',
  'gigabyte_hours',
]);
const RATIO_UNITS = new Set(['ratio', 'percent']);

export const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
export const MISSING_CHAR = '·';

/** Normalizes schema unit strings to a stable lookup key. */
function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
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

/** Renders granularity objects in short form (e.g. 5m, 1h, 1d). */
function formatGranularity(granularity: Granularity): string {
  if ('minutes' in granularity) {
    return `${granularity.minutes}m`;
  }
  if ('hours' in granularity) {
    return `${granularity.hours}h`;
  }
  return `${granularity.days}d`;
}

/** Converts verbose units to compact labels for metadata output. */
function formatUnitLabel(unit: string): string {
  switch (normalizeUnit(unit)) {
    case 'milliseconds':
      return 'ms';
    case 'seconds':
      return 's';
    case 'us dollars':
      return 'USD';
    case 'gigabyte hours':
      return 'GB-h';
    default:
      return unit;
  }
}

/**
 * Returns true only for total-count style output:
 * - `measureType=count` and `aggregation=sum` -> integer display
 * - everything else (`persecond`, `percent`, durations, ratios, bytes) -> decimal
 */
function isCountIntegerDisplay(
  measureType: MeasureType,
  aggregation: MetricsAggregation
): boolean {
  // Count + sum should read like totals (integers), while count-persecond /
  // count-percent stay decimal.
  return measureType === 'count' && aggregation === 'sum';
}

/**
 * Formats numbers by measure/aggregation with an optional override for count averages.
 * Default behavior:
 * - count+sum -> integer formatting via `formatCount()`
 * - everything else -> decimal formatting via `formatDecimal()`
 *
 * When `preserveFractionalCountSum` is true, count+sum values like `1.5`
 * stay decimal (used for `avg` only).
 */
function formatNumber(
  value: number,
  measureType: MeasureType,
  aggregation: MetricsAggregation,
  opts?: { preserveFractionalCountSum?: boolean }
): string {
  if (isCountIntegerDisplay(measureType, aggregation)) {
    if (opts?.preserveFractionalCountSum && !Number.isInteger(value)) {
      return formatDecimal(value);
    }
    return formatCount(value);
  }
  return formatDecimal(value);
}

/** Chooses summary statistic columns for a given measure type. */
function getStatColumns(measureType: MeasureType): StatColumn[] {
  if (measureType === 'duration' || measureType === 'ratio') {
    return ['avg', 'min', 'max'];
  }
  return ['total', 'avg', 'min', 'max'];
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
  measureType: MeasureType,
  aggregation: MetricsAggregation,
  periodStart: Date,
  periodEnd: Date
): string {
  switch (column) {
    case 'total':
      return formatNumber(stats.total, measureType, aggregation);
    case 'avg':
      return formatNumber(stats.avg, measureType, aggregation, {
        preserveFractionalCountSum: true,
      });
    case 'min': {
      const ts = formatMinMaxTimestamp(
        new Date(stats.min.timestamp),
        periodStart,
        periodEnd
      );
      return `${formatNumber(stats.min.value, measureType, aggregation)} at ${ts}`;
    }
    case 'max': {
      const ts = formatMinMaxTimestamp(
        new Date(stats.max.timestamp),
        periodStart,
        periodEnd
      );
      return `${formatNumber(stats.max.value, measureType, aggregation)} at ${ts}`;
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

/**
 * Classifies a schema unit into formatting behavior:
 * - `count`: count/USD-like values (integer totals for `sum`)
 * - `duration`: time units (ms/s)
 * - `bytes`: storage/bandwidth-like units
 * - `ratio`: percentages/ratios and unknown units (safe decimal fallback)
 */
export function getMeasureType(unit: string): MeasureType {
  const normalized = normalizeUnit(unit);
  if (COUNT_UNITS.has(normalized)) {
    return 'count';
  }
  if (DURATION_UNITS.has(normalized)) {
    return 'duration';
  }
  if (BYTES_UNITS.has(normalized)) {
    return 'bytes';
  }
  if (RATIO_UNITS.has(normalized)) {
    return 'ratio';
  }
  return 'ratio';
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
  const expectedTimestamps = buildExpectedTimestamps(
    periodStart,
    periodEnd,
    granularityMs
  );
  const groups: string[] = [];
  const groupValues = new Map<string, string[]>();
  const valueByGroup = new Map<string, Map<string, number | null>>();

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

    const numeric = toNumericValue(row[rollupColumn]);
    groupMap.set(timestamp, numeric);
  }

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
 * Ellipsizes a string by keeping equal start/end portions and replacing the
 * middle with a single `…` character.
 *
 * Example (maxLength=60):
 *   "/very/long/path/..." → "/very/long/pa…nd/of/path"
 */
export function ellipsizeMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const endLength = Math.floor((maxLength - 1) / 2);
  const startLength = maxLength - 1 - endLength;
  return `${str.slice(0, startLength)}…${str.slice(str.length - endLength)}`;
}

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
  const rows: Array<{ key: string; value: string }> = [
    {
      key: 'Metric',
      value: `${opts.event} / ${opts.measure} ${opts.aggregation}`,
    },
    {
      key: 'Period',
      value: `${formatPeriodBound(opts.periodStart)} to ${formatPeriodBound(opts.periodEnd)}`,
    },
    {
      key: 'Interval',
      value: formatGranularity(opts.granularity),
    },
  ];

  if (opts.filter) {
    rows.push({ key: 'Filter', value: opts.filter });
  }

  if (opts.scope.type === 'project-with-slug') {
    rows.push({
      key: 'Project',
      value: `${opts.projectName ?? opts.scope.projectName} (${opts.teamName ?? opts.scope.teamSlug})`,
    });
  } else {
    rows.push({
      key: 'Team',
      value: `${opts.teamName ?? opts.scope.teamSlug} (all projects)`,
    });
  }

  if (opts.unit && normalizeUnit(opts.unit) !== 'count') {
    rows.push({ key: 'Units', value: formatUnitLabel(opts.unit) });
  }

  if (typeof opts.groupCount === 'number') {
    rows.push({ key: 'Groups', value: String(opts.groupCount) });
  }

  // Match the usage command's metadata style with `>`-prefixed lines.
  return rows
    .map(row => `> ${chalk.gray(`${row.key}:`)} ${row.value}`)
    .join('\n');
}

/** Renders the summary table section. */
export function formatSummaryTable(opts: SummaryTableOptions): string {
  const statColumns = getStatColumns(opts.measureType);
  const header = [...opts.groupByFields, ...statColumns];
  const rows: string[][] = [header.map(name => chalk.bold(chalk.cyan(name)))];

  for (const row of opts.rows) {
    const nextRow: string[] = row.groupValues.map(v =>
      ellipsizeMiddle(v, MAX_GROUP_VALUE_LENGTH)
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
          opts.measureType,
          opts.aggregation,
          opts.periodStart,
          opts.periodEnd
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
  groupByFields: string[]
): string {
  const lines = ['sparklines:'];

  if (groupRows.length === 0) {
    const sparkline = sparklines[0];
    if (sparkline) {
      lines.push(indent(sparkline, 2));
    }
    return lines.join('\n');
  }

  const rowsWithSparklines = groupRows.map((groupValues, index) => ({
    groupValues,
    sparkline: sparklines[index] ?? '',
  }));

  const rows = [
    [...groupByFields, 'sparkline'].map(name => chalk.bold(chalk.cyan(name))),
    ...rowsWithSparklines.map(({ groupValues, sparkline }) => [
      ...groupValues.map(v => ellipsizeMiddle(v, MAX_GROUP_VALUE_LENGTH)),
      sparkline,
    ]),
  ];
  const align: TableAlignment[] = groupByFields.map(() => 'r');
  align.push('l');
  lines.push(
    indent(
      table(rows, {
        align,
        hsep: 2,
      }),
      2
    )
  );

  return lines.join('\n');
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
  const rollupColumn = getRollupColumnName(opts.measure, opts.aggregation);
  const measureSchema = getMeasures(opts.event).find(
    m => m.name === opts.measure
  );
  const measureUnit = measureSchema?.unit;
  const measureType = getMeasureType(measureUnit ?? 'ratio');
  const granularityMs = toGranularityMsFromDuration(opts.granularity);

  const { groups, series, groupValues } = extractGroupedSeries(
    response.data ?? [],
    opts.groupBy,
    rollupColumn,
    opts.periodStart,
    opts.periodEnd,
    granularityMs
  );

  const metadata = formatMetadataHeader({
    event: opts.event,
    measure: opts.measure,
    aggregation: opts.aggregation,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    granularity: opts.granularity,
    filter: opts.filter,
    scope: opts.scope,
    projectName: opts.projectName,
    teamName: opts.teamName,
    unit: measureUnit,
    groupCount: opts.groupBy.length > 0 ? groups.length : undefined,
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

    summaryRows.push({
      groupValues: currentGroupValues,
      stats: computeGroupStats(points),
    });
    groupRows.push(currentGroupValues);
    sparklineRows.push(generateSparkline(values));
  }

  const summaryTable = formatSummaryTable({
    rows: summaryRows,
    groupByFields: opts.groupBy,
    measureType,
    aggregation: opts.aggregation,
    periodStart: new Date(opts.periodStart),
    periodEnd: new Date(opts.periodEnd),
  });

  const groupedOutput = opts.groupBy.length > 0;
  const sparklineSection = formatSparklineSection(
    groupedOutput ? groupRows : [],
    sparklineRows,
    opts.groupBy
  );

  const sections = [metadata, summaryTable, sparklineSection];

  return `${sections.join('\n\n')}\n`;
}
