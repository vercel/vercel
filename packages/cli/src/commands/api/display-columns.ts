import chalk from 'chalk';

/**
 * Resolve a dot-notation path like "user.softBlock.blockedAt" against an
 * object tree.  Returns `undefined` when any segment is missing.
 *
 * Paths may contain a `[]` marker (e.g. "teams[].name") which indicates
 * array traversal.  Only the portion *after* `[]` is resolved here — callers
 * are expected to strip the array prefix first (see `parseArrayColumns`).
 */
function getByPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const segment of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Detect whether displayColumns use `[]` array syntax and, if so, extract the
 * array from `data` and return per-row column paths.
 *
 * For example, given columns `{ name: "teams[].name", slug: "teams[].slug" }`:
 *   - Extracts `data.teams` as the row array
 *   - Returns row-level columns `{ name: "name", slug: "slug" }`
 *
 * Returns `null` when the columns don't use `[]` syntax.
 */
export function parseArrayColumns(
  data: unknown,
  columns: Record<string, string>
): { rows: unknown[]; rowColumns: Record<string, string> } | null {
  const entries = Object.entries(columns);
  const first = entries[0];
  if (!first) return null;

  const bracketIdx = first[1].indexOf('[].');
  if (bracketIdx === -1) return null;

  const arrayKey = first[1].slice(0, bracketIdx);

  const rowColumns: Record<string, string> = {};
  for (const [label, path] of entries) {
    const prefix = path.slice(0, bracketIdx);
    if (prefix !== arrayKey || !path.startsWith(prefix + '[].')) {
      return null;
    }
    rowColumns[label] = path.slice(bracketIdx + 3);
  }

  const arr = getByPath(data, arrayKey);
  if (!Array.isArray(arr)) return null;

  return { rows: arr, rowColumns };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return chalk.dim('–');
  if (typeof value === 'number') {
    if (value > 1_000_000_000_000 && value < 2_000_000_000_000) {
      return new Date(value).toISOString();
    }
    return String(value);
  }
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Render a single object as a vertical card:
 *
 *     name       Jeff See
 *     id         XPtk…
 *     email      jeff.see@vercel.com
 */
export function renderCard(
  data: unknown,
  columns: Record<string, string>
): string {
  const entries = Object.entries(columns);
  const maxLabel = Math.max(...entries.map(([label]) => label.length));

  const lines = entries.map(([label, path]) => {
    const value = getByPath(data, path);
    return `  ${chalk.gray(label.padEnd(maxLabel))}  ${formatValue(value)}`;
  });

  return lines.join('\n');
}

/**
 * Render an array of objects as a table:
 *
 *     name          id              email
 *     Jeff See      XPtk…           jeff.see@vercel.com
 */
export function renderTable(
  rows: unknown[],
  columns: Record<string, string>
): string {
  const entries = Object.entries(columns);

  const headerRow = entries.map(([label]) => label);
  const dataRows = rows.map(row =>
    entries.map(([, path]) => formatValue(getByPath(row, path)))
  );

  const widths = entries.map(([label], colIdx) => {
    const dataMax = dataRows.reduce(
      (max, row) => Math.max(max, stripAnsi(row[colIdx]).length),
      0
    );
    return Math.max(label.length, dataMax);
  });

  const header = headerRow
    .map((h, i) => chalk.bold(h.padEnd(widths[i])))
    .join('  ');

  const body = dataRows.map(row =>
    row
      .map((cell, i) => {
        const pad = widths[i] - stripAnsi(cell).length;
        return cell + ' '.repeat(Math.max(0, pad));
      })
      .join('  ')
  );

  return [header, ...body].join('\n');
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
