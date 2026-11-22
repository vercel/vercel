import { z } from 'zod';
import { PaginationError } from '../pagination';

/**
 * Where the next page starts: the API cursor of the page to fetch, and how
 * many rows of that page the previous page already showed. The CLI owns this
 * cursor, because `--limit` can stop in the middle of an API page.
 */
const positionSchema = z.object({
  cursor: z.string().min(1).optional(),
  offset: z.number().int().min(0),
});

export type ListPosition = z.infer<typeof positionSchema>;

/** One page of a list, with the cursor for `--next` or null on the last page. */
export interface ListPage<T> {
  items: T[];
  next: string | null;
}

export function encodeListCursor(position: ListPosition): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url');
}

/** Returns the position a `--next` value names, or undefined when it is not one. */
export function decodeListCursor(value: string): ListPosition | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString());
    const parsed = positionSchema.safeParse(decoded);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pages a list that the API returns in one response. A position with an API
 * cursor never comes from this list, so it fails like any other bad cursor.
 */
export function sliceList<T>(
  items: T[],
  start: ListPosition,
  limit: number
): ListPage<T> | undefined {
  if (start.cursor !== undefined) {
    return undefined;
  }
  const end = start.offset + limit;
  return {
    items: items.slice(start.offset, end),
    next: end < items.length ? encodeListCursor({ offset: end }) : null,
  };
}

/**
 * Collects `limit` rows from a cursor-paginated API, fetching only the pages
 * it needs. An API page can be empty and still carry a cursor, so the loop
 * keeps going until it has enough rows or the API has no more.
 */
export async function collectList<T>(
  fetchPage: (
    cursor: string | undefined
  ) => Promise<{ items: T[]; cursor: string | null }>,
  start: ListPosition,
  limit: number,
  { maxPages = 100 }: { maxPages?: number } = {}
): Promise<ListPage<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let position = start;

  for (let pages = 0; pages < maxPages; pages++) {
    const page = await fetchPage(position.cursor);
    const remaining = page.items.slice(position.offset);
    const taken = remaining.slice(0, limit - items.length);
    items.push(...taken);

    if (taken.length < remaining.length) {
      const offset = position.offset + taken.length;
      return {
        items,
        next: encodeListCursor({ cursor: position.cursor, offset }),
      };
    }

    if (!page.cursor) {
      return { items, next: null };
    }

    if (seen.has(page.cursor)) {
      throw new PaginationError(
        'Pagination returned a cursor it already returned. The list is incomplete.'
      );
    }

    seen.add(page.cursor);
    position = { cursor: page.cursor, offset: 0 };

    if (items.length === limit) {
      return { items, next: encodeListCursor(position) };
    }
  }

  // A run of empty API pages can be long. Return the rows found so far with a
  // cursor, so the caller can continue instead of losing them.
  return { items, next: encodeListCursor(position) };
}
