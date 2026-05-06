import ms from 'ms';
import chalk from 'chalk';
import table from '../output/table';
import { humanReadableColumnLabel } from './column-label';
import { VERCEL_CLI_ROOT_DISPLAY_KEY } from './constants';
import type { VercelCliTableDisplay } from './types';

/** Dot-path read for table cells (e.g. `softBlock.blockedAt`). */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

const TIMESTAMP_FIELD_PATTERN =
  /(?:^|\.)(created|updated|deleted|expired|blocked|completed|started|finished|modified|verified|published|cancelled|revoked|invited|accepted|accessed|deployed)(?:At|_at|On|_on)?$/i;

const MIN_TIMESTAMP_MS = 1_000_000_000_000; // Sep 2001
const MAX_TIMESTAMP_MS = 4_102_444_800_000; // Jan 2100

function isTimestampValue(value: unknown, columnPath: string): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < MIN_TIMESTAMP_MS || value > MAX_TIMESTAMP_MS) return false;
  return TIMESTAMP_FIELD_PATTERN.test(columnPath);
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 0) return 'just now';
  return chalk.gray(ms(diff));
}

function stringifyCell(value: unknown, columnPath?: string): string {
  if (value === undefined || value === null) {
    return chalk.gray('--');
  }
  if (columnPath && isTimestampValue(value, columnPath)) {
    return formatRelativeTime(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function styleColumnKey(plainLabel: string): string {
  return chalk.gray(plainLabel);
}

function columnsForRow(
  r: Record<string, unknown>,
  display: VercelCliTableDisplay
): string[] {
  const limited = r['limited'] === true;
  return limited && display.columnsWhenLimited?.length
    ? display.columnsWhenLimited
    : display.columnsDefault;
}

/**
 * Key / value card: label left, value right (two columns, no header row).
 */
export function formatAsCard(
  r: Record<string, unknown>,
  display: VercelCliTableDisplay
): string | null {
  const columns = columnsForRow(r, display);
  if (!columns.length) {
    return null;
  }
  const rows: string[][] = columns.map(colPath => [
    styleColumnKey(humanReadableColumnLabel(colPath)),
    stringifyCell(getByPath(r, colPath), colPath),
  ]);
  return table(rows, { align: ['l', 'l'], hsep: 2 });
}

/**
 * Multi-row table when `displayProperty` resolves to an array of objects.
 */
export function formatAsDataTable(
  items: unknown[],
  display: VercelCliTableDisplay
): string | null {
  if (items.length === 0) {
    return '(empty)';
  }
  const first = items[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    const headers = [
      styleColumnKey(humanReadableColumnLabel('#')),
      styleColumnKey(humanReadableColumnLabel('value')),
    ];
    const rows: string[][] = items.map((v, i) => [
      String(i),
      stringifyCell(v, 'value'),
    ]);
    return table([headers, ...rows]);
  }
  const columns = columnsForRow(first as Record<string, unknown>, display);
  if (!columns.length) {
    return null;
  }
  const headers = columns.map(p => styleColumnKey(humanReadableColumnLabel(p)));
  const dataRows = items.map(item => {
    const row =
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    return columns.map(colPath =>
      stringifyCell(getByPath(row, colPath), colPath)
    );
  });
  return table([headers, ...dataRows]);
}

/**
 * Format a JSON response using `x-vercel-cli` metadata.
 * - If `displayProperty` is an **array** of objects: tabular rows (header + one row per item).
 * - If it is a **single object**: two-column card (field label | value).
 * Returns `null` if the body shape does not match or columns are empty.
 */
export function formatVercelCliTable(
  body: unknown,
  display: VercelCliTableDisplay
): string | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const root = body as Record<string, unknown>;
  const value =
    display.displayProperty === VERCEL_CLI_ROOT_DISPLAY_KEY
      ? root
      : root[display.displayProperty];
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return formatAsDataTable(value, display);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return formatAsCard(value as Record<string, unknown>, display);
  }
  return null;
}
