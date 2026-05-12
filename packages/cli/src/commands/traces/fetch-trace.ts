import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import sleep from '../../util/sleep';
import type { Trace } from './types';

export type FetchTraceParams = {
  client: Client;
  teamId: string;
  projectId: string;
  requestId: string;
  /**
   * Total wall-clock budget in milliseconds. Only consulted when `retry` is
   * `true`. Once exceeded, the fetcher returns a `TimeoutError`.
   */
  timeoutMs: number;
  /**
   * When `false`, perform a single attempt regardless of the response status —
   * `--no-wait` semantics. When `true`, retry on `404` and `5xx` until the
   * trace is available or the budget runs out.
   */
  retry: boolean;
};

export type FetchTraceSuccess = {
  trace: Trace;
};

/**
 * Returned when the wall-clock budget is exceeded while the trace is still
 * pending (consistent `404`/`5xx` responses). The caller maps this to exit
 * code `124` and an actionable stderr message.
 */
export class TimeoutError extends Error {
  readonly requestId: string;
  readonly timeoutMs: number;

  constructor(requestId: string, timeoutMs: number) {
    super(`Trace not yet available for request ${requestId}.`);
    this.name = 'TimeoutError';
    this.requestId = requestId;
    this.timeoutMs = timeoutMs;
  }
}

type GetTraceResponse = {
  trace: Trace;
};

/**
 * Exponential backoff schedule: 500ms → 1000ms → 2000ms → 4000ms, then
 * capped at 5000ms for all subsequent attempts.
 */
const BACKOFF_SCHEDULE_MS = [500, 1000, 2000, 4000] as const;
const BACKOFF_CAP_MS = 5000;

function backoffForAttempt(attempt: number): number {
  return BACKOFF_SCHEDULE_MS[attempt] ?? BACKOFF_CAP_MS;
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Fetch a captured trace by request id, retrying through the eventual
 * consistency window between a request response and the trace being written
 * to storage.
 *
 * Retry policy:
 * - `404` and `5xx` → retry with exponential backoff up to `timeoutMs`.
 * - `401` / `403` → return immediately, no retry.
 * - Network / other errors → return immediately.
 *
 * When `retry` is `false`, a single attempt is made regardless of status.
 */
export async function fetchTrace({
  client,
  teamId,
  projectId,
  requestId,
  timeoutMs,
  retry,
}: FetchTraceParams): Promise<FetchTraceSuccess | TimeoutError | Error> {
  const search = new URLSearchParams({ teamId, projectId, requestId });
  const url = `/api/v1/projects/traces?${search.toString()}`;

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (true) {
    try {
      const response = await client.fetch<GetTraceResponse>(url, {
        // Disable the client's built-in retry — this fetcher owns retry policy.
        retry: { retries: 0 },
      });
      return { trace: response.trace };
    } catch (err) {
      if (!retry || !shouldRetry(err)) {
        return asError(err);
      }

      const delay = backoffForAttempt(attempt);
      attempt += 1;

      // If sleeping would push us past the budget, surface the timeout now
      // instead of waiting only to make a doomed request.
      if (Date.now() + delay >= deadline) {
        return new TimeoutError(requestId, timeoutMs);
      }

      await sleep(delay);
    }
  }
}

function shouldRetry(err: unknown): boolean {
  if (!isAPIError(err)) {
    // Network errors and unexpected shapes are not retried — we'd rather
    // surface them than mask intermittent infra problems.
    return false;
  }
  const { status } = err;
  if (status === 404) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}
