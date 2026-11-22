import chalk from 'chalk';
import type Client from './client';
import output from '../output-manager';
import { packageName } from './pkg-name';
import { normalizeFlagName, stripSensitiveAuthArgs } from './redact-args';

/** One page of a cursor-paginated list. `next` is null on the last page. */
export interface Page<T> {
  items: T[];
  next: string | null;
}

export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/**
 * Validates `--limit` for list commands. Returns the default when unset and
 * throws with a user-facing message when the value is out of range.
 */
export function parseListLimit(
  value: number | undefined,
  {
    defaultLimit = DEFAULT_LIST_LIMIT,
    maxLimit = MAX_LIST_LIMIT,
  }: { defaultLimit?: number; maxLimit?: number } = {}
): number {
  if (value === undefined) {
    return defaultLimit;
  }
  if (!Number.isInteger(value) || value < 1 || value > maxLimit) {
    throw new Error(
      `The --limit option must be an integer from 1 to ${maxLimit}.`
    );
  }
  return value;
}

export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaginationError';
  }
}

/**
 * Follows `next` cursors until the last page and returns every item, for
 * internal lookups that must see the whole set (resolving a name to an id).
 * List commands return one page and leave fetching every page to the caller,
 * who can loop on `pagination.next`. Throws
 * instead of returning a partial list when a page fails, a cursor repeats, or
 * the page cap is hit, so callers never report a truncated list as complete.
 *
 * Pages are fetched back to back with no delay. Rate limits are left to
 * `client.fetch`, which retries 429s after `Retry-After`. A `fetchPage` that
 * passes `bailOn429` gives that up and fails on the first 429.
 *
 * Use this instead of a hand-written cursor loop. The routers list should
 * adopt it once its endpoint returns a cursor.
 */
export async function fetchAllPages<T>(
  fetchPage: (next: string | undefined) => Promise<Page<T>>,
  { maxPages = 1000 }: { maxPages?: number } = {}
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let next: string | undefined;
  for (let pages = 0; pages < maxPages; pages++) {
    const page = await fetchPage(next);
    items.push(...page.items);
    if (!page.next) {
      return items;
    }
    if (seen.has(page.next)) {
      throw new PaginationError(
        'Pagination returned a cursor it already returned. The list is incomplete.'
      );
    }
    seen.add(page.next);
    next = page.next;
  }
  throw new PaginationError(
    `Stopped after ${maxPages} pages. The list is incomplete. Use --limit and --next to page through it manually.`
  );
}

const CURSOR_FLAGS = new Set(['--next', '-N']);

export function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./@:,=+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Builds the command that fetches the next page: the current invocation with
 * its filters and global flags, minus auth tokens and any previous cursor, plus
 * `--next=<cursor>`. Works from raw argv so repeatable flags round-trip. The
 * cursor is attached with `=` because an opaque cursor can start with `-`,
 * which the parser would read as a flag if passed as a separate argument.
 * `dropFlags` names other value-taking flags to leave out, such as a hidden
 * old name for `--next`. The cursor goes before `--`, where the parser reads
 * it as `--next`; everything after `--` belongs to a child command and is
 * kept as it is.
 */
export function getNextPageCommand(
  argv: string[],
  next: string,
  dropFlags: readonly string[] = []
): string {
  const args = stripSensitiveAuthArgs(argv.slice(2));
  const delimiter = args.indexOf('--');
  const own = delimiter === -1 ? args : args.slice(0, delimiter);
  const passthrough = delimiter === -1 ? [] : args.slice(delimiter);
  const kept: string[] = [];
  for (let i = 0; i < own.length; i++) {
    const arg = own[i];
    const name = normalizeFlagName(arg);
    if (CURSOR_FLAGS.has(name) || dropFlags.includes(name)) {
      if (!arg.includes('=') && i + 1 < own.length) {
        i++;
      }
      continue;
    }
    // A grouped `-N`, as in `-dN <cursor>`, keeps its other flags.
    if (/^-[A-Za-z]{2,}$/.test(arg) && arg.includes('N')) {
      kept.push(arg.replace(/N/g, ''));
      if (i + 1 < own.length) {
        i++;
      }
      continue;
    }
    kept.push(arg);
  }
  kept.push(`--next=${next}`, ...passthrough);
  return `${packageName} ${kept.map(quoteShellArg).join(' ')}`;
}

/**
 * Prints the command for the next page to stderr, in the layout every list
 * uses:
 *
 *   Next page:
 *     vercel dns list --next <CURSOR>
 *
 * `command` is the whole command, starting with `vercel`. The caller prints
 * the blank line that separates it from the output above.
 */
export function printNextPageCommand(
  command: string,
  label = 'Next page'
): void {
  output.print(`  ${label}:\n    ${chalk.cyan(command)}\n`);
}

/**
 * Prints the next-page command to stderr when another page exists.
 * `dropFlags` is passed to `getNextPageCommand`.
 */
export function printNextPageHint(
  client: Client,
  next: string | null,
  dropFlags: readonly string[] = []
): void {
  if (!next) {
    return;
  }
  output.print('\n');
  printNextPageCommand(getNextPageCommand(client.argv, next, dropFlags));
}
