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

function stringifyCell(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
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
function formatAsCard(
  r: Record<string, unknown>,
  display: VercelCliTableDisplay
): string | null {
  const columns = columnsForRow(r, display);
  if (!columns.length) {
    return null;
  }
  const rows: string[][] = columns.map(path => [
    styleColumnKey(humanReadableColumnLabel(path)),
    stringifyCell(getByPath(r, path)),
  ]);
  return table(rows, { align: ['l', 'l'], hsep: 2 });
}

/**
 * Multi-row table when `displayProperty` resolves to an array of objects.
 */
function formatAsDataTable(
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
    const rows: string[][] = items.map((v, i) => [String(i), stringifyCell(v)]);
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
    const cols = columnsForRow(row, display);
    return cols.map(path => stringifyCell(getByPath(row, path)));
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
