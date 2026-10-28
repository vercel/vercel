import { z } from 'zod';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../client';
import { isAPIError } from '../errors-ts';

/**
 * Pages through the observability events API
 * (`POST /v1/observability/events`). Shared by `vercel logs` and
 * `vercel traces search`.
 */

/** Largest page requested before any size-based reduction. */
export const MAX_PAGE_SIZE = 1000;

const QUERY_REASON_HEADER = 'x-vercel-observability-query-reason';

export type ObservabilityEvent = Record<string, unknown>;

export interface ExcludedInterval {
  readonly start: string;
  readonly end: string;
}

const responseSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
  meta: z
    .object({
      excludedIntervals: z
        .array(z.object({ start: z.string(), end: z.string() }))
        .optional(),
    })
    .passthrough()
    .optional(),
});

type EventsResponse = z.infer<typeof responseSchema>;

export class InvalidEventsResponseError extends Error {
  constructor() {
    super('The Observability API returned an invalid events response.');
    this.name = 'InvalidEventsResponseError';
  }
}

/** A single record is larger than the API response ceiling. */
export class RecordTooLargeError extends Error {
  constructor() {
    super(
      'A single record exceeds the API response size limit and cannot be returned.'
    );
    this.name = 'RecordTooLargeError';
  }
}

/**
 * One events query. The API binds a cursor to `event`, `ownerId`,
 * `projectIds`, `timeRange`, `filter`, and order, so these must stay fixed
 * across pages. `select` and the page size may change.
 */
export interface EventsRequest {
  readonly event: string;
  readonly ownerId: string;
  /** Omit to query every project the owner has. */
  readonly projectIds?: ReadonlyArray<string>;
  readonly timeRange: { readonly start: string; readonly end: string };
  readonly filter?: string;
  readonly select: ReadonlyArray<string>;
  /** Sent as `x-vercel-observability-query-reason`, e.g. `cli/logs-runtime`. */
  readonly queryReason: string;
  /** Fail on the first 429 instead of waiting for `Retry-After`. */
  readonly bailOn429?: boolean;
}

function isResultTooLarge(err: unknown): boolean {
  return (
    isAPIError(err) && err.status === 413 && err.code === 'result_too_large'
  );
}

async function fetchEventsPage(
  client: Client,
  request: EventsRequest,
  limit: number,
  cursor: string | undefined
): Promise<EventsResponse> {
  const body: JSONObject = {
    event: request.event,
    scope: {
      ownerId: request.ownerId,
      ...(request.projectIds ? { projectIds: [...request.projectIds] } : {}),
    },
    timeRange: {
      start: request.timeRange.start,
      end: request.timeRange.end,
    },
    select: [...request.select],
    order: 'desc',
    limit,
  };
  if (request.filter) body.filter = request.filter;
  if (cursor) body.cursor = cursor;

  const params = new URLSearchParams({ teamId: request.ownerId });
  const response = await client.fetch<unknown>(
    `/v1/observability/events?${params}`,
    {
      method: 'POST',
      headers: { [QUERY_REASON_HEADER]: request.queryReason },
      body,
      useCurrentTeam: false,
      ...(request.bailOn429 ? { bailOn429: true } : {}),
    }
  );
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) {
    throw new InvalidEventsResponseError();
  }
  return parsed.data;
}

export interface EventsPage {
  readonly events: ReadonlyArray<ObservabilityEvent>;
  readonly excludedIntervals: ReadonlyArray<ExcludedInterval>;
  /**
   * The API cursor after this page, when more records matched. Resuming from
   * it continues right after the last record of this page.
   */
  readonly nextCursor: string | null;
}

export interface EventsResult {
  /** More records matched than were returned. */
  readonly hasMore: boolean;
  /** The API cursor to continue from when `hasMore` is true. */
  readonly nextCursor: string | null;
}

/**
 * Yields pages newest first until `limit` records are returned or the result
 * ends. Pages are up to `MAX_PAGE_SIZE` records and never more than the
 * remaining limit, so the last page's cursor lines up with the last returned
 * record. When a page exceeds the API response ceiling, the same cursor is
 * retried with half the page size, and the reduced size is kept for the
 * remaining pages.
 *
 * `startCursor` resumes a previous query; the request must match the one the
 * cursor came from.
 */
export async function* fetchEventPages(
  client: Client,
  request: EventsRequest,
  limit: number,
  startCursor?: string
): AsyncGenerator<EventsPage, EventsResult> {
  let remaining = limit;
  let maxPageSize = MAX_PAGE_SIZE;
  let cursor: string | undefined = startCursor;
  let lastNextCursor: string | null = null;

  while (remaining > 0) {
    let pageSize = Math.min(remaining, maxPageSize);
    let response: EventsResponse;
    for (;;) {
      try {
        response = await fetchEventsPage(client, request, pageSize, cursor);
        break;
      } catch (err) {
        if (!isResultTooLarge(err)) throw err;
        if (pageSize === 1) throw new RecordTooLargeError();
        pageSize = Math.max(1, Math.floor(pageSize / 2));
        maxPageSize = pageSize;
      }
    }

    // Page size never exceeds `remaining`, so this slice is a guard: dropping
    // records here would make the next cursor skip them.
    const events = response.events.slice(0, remaining);
    remaining -= events.length;
    const { hasMore, nextCursor } = response.pagination;
    const continues = hasMore && Boolean(nextCursor) && nextCursor !== cursor;
    lastNextCursor = continues ? nextCursor : null;
    yield {
      events,
      excludedIntervals: response.meta?.excludedIntervals ?? [],
      nextCursor: lastNextCursor,
    };

    if (!continues) {
      // More matched but the API gave no usable cursor: report it without a
      // continuation instead of looping on the same page.
      return { hasMore, nextCursor: null };
    }
    cursor = nextCursor ?? undefined;
  }

  return { hasMore: true, nextCursor: lastNextCursor };
}

/** Sorts excluded intervals by start, then end. */
export function sortIntervals(
  intervals: Iterable<ExcludedInterval>
): ExcludedInterval[] {
  return [...intervals].sort(
    (a, b) =>
      Date.parse(a.start) - Date.parse(b.start) ||
      Date.parse(a.end) - Date.parse(b.end)
  );
}
