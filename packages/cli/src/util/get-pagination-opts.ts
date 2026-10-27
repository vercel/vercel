export interface PaginationOptions {
  '--next'?: string;
  '--limit'?: number;
}

/** The error for a `--next` value that isn't a cursor the CLI printed. */
export const INVALID_NEXT_MESSAGE =
  '--next must be the cursor printed with the previous page.';

/** A usage error: callers exit `2` for it. */
export class InvalidNextError extends Error {
  constructor() {
    super(INVALID_NEXT_MESSAGE);
    this.name = 'InvalidNextError';
  }
}

/**
 * Reads `--next` for lists whose cursor is a timestamp or a page number. The
 * cursor is opaque to users, but these APIs take it as a number, so it's read
 * with `Number()`, the same as when `--next` was parsed as a number.
 */
export function parseNumericCursor(next: string | undefined) {
  return next === undefined ? undefined : Number(next);
}

export function getPaginationOpts(opts: PaginationOptions) {
  const { '--limit': limit } = opts;
  const nextTimestamp = parseNumericCursor(opts['--next']);

  if (nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    throw new InvalidNextError();
  }

  if (
    typeof limit === 'number' &&
    (!Number.isInteger(limit) || limit > 100 || limit < 1)
  ) {
    throw new Error(
      'Please provide an integer from 1 to 100 for option --limit'
    );
  }

  return [nextTimestamp, limit];
}
