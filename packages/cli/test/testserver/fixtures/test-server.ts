import { randomUUID } from 'node:crypto';

// Port of vercel/front tooling/playwright/src/test/fixtures/test-server.ts
// (at 185cfac41a9), minus Playwright annotations and attachments.

export const INFRA_TIMEOUT_MS = 45_000;
const START_ATTEMPT_TIMEOUT_MS = 15_000;
const START_MAX_ATTEMPTS = 2;
const START_RETRY_DELAY_MS = 250;

interface TestServerInfoResponse {
  id: string;
}

export interface TestServer {
  base: string;
  testId: string;
  /** Fetch a sandbox path with the `test-id` header merged in. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** Hit `/_/service/<id>/readyz` for each service to pre-warm cold starts. */
  warmup: (serviceIds: string[]) => Promise<void>;
}

export interface TestServerController extends TestServer {
  start: (meta: {
    name: string;
    file: string;
    title: string;
  }) => Promise<TestServerInfoResponse>;
  /** Fetch `/_/log?incomplete=true`; returns undefined on failure. */
  fetchLog: () => Promise<unknown>;
  /** `DELETE /_/test`. Errors are logged, not thrown. */
  end: () => Promise<void>;
}

export class TestServerResponseError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'TestServerResponseError';
  }
}

function handleBadResponse(response: Response) {
  if (!response.ok) {
    if (response.status === 502 || response.status === 410) {
      throw new TestServerResponseError(
        response.status,
        `Testserver sandbox expired/unreachable (${response.status}). Create a fresh sandbox and retry.`
      );
    }
    throw new TestServerResponseError(
      response.status,
      `Failed to communicate with test server: ${response.status} - ${response.statusText}`
    );
  }
}

function isRetryableStartupError(error: unknown): boolean {
  return (
    !(error instanceof TestServerResponseError) ||
    (error.status >= 500 && error.status !== 502)
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function createTestServer(base: string): TestServerController {
  const testId = randomUUID();
  const requestHeaders = { 'test-id': testId };

  const testServerFetch = async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('test-id', testId);
    const response = await fetch(`${base}${path}`, { ...init, headers });
    if (response.status === 410 || response.status === 502) {
      handleBadResponse(response);
    }
    return response;
  };

  const start: TestServerController['start'] = async ({
    name,
    file,
    title,
  }) => {
    const startedAt = performance.now();
    let attempts = 0;
    let lastError: unknown;

    for (let attempt = 1; attempt <= START_MAX_ATTEMPTS; attempt++) {
      attempts = attempt;
      try {
        const response = await fetch(`${base}/_/test`, {
          method: 'PUT',
          headers: { ...requestHeaders, 'content-type': 'application/json' },
          body: JSON.stringify({ name, meta: { file, title } }),
          signal: AbortSignal.timeout(START_ATTEMPT_TIMEOUT_MS),
        });
        handleBadResponse(response);
        return (await response.json()) as TestServerInfoResponse;
      } catch (error) {
        lastError = error;
        if (attempt < START_MAX_ATTEMPTS && isRetryableStartupError(error)) {
          await delay(START_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }

    const elapsedMs = Math.round(performance.now() - startedAt);
    throw new Error(
      `Testserver context startup failed after ${elapsedMs}ms (${attempts} attempt${attempts === 1 ? '' : 's'}, ${START_ATTEMPT_TIMEOUT_MS}ms cap per attempt) for test-id ${testId} at ${base}: ${getErrorMessage(lastError)}`,
      { cause: lastError }
    );
  };

  const fetchLog = async () => {
    try {
      const response = await testServerFetch('/_/log?incomplete=true', {
        signal: AbortSignal.timeout(INFRA_TIMEOUT_MS),
      });
      return (await response.json()) as unknown;
    } catch (e) {
      console.error('Error fetching test server logs:', e);
      return undefined;
    }
  };

  const end = async () => {
    try {
      const response = await fetch(`${base}/_/test`, {
        method: 'DELETE',
        headers: requestHeaders,
        signal: AbortSignal.timeout(INFRA_TIMEOUT_MS),
      });
      handleBadResponse(response);
    } catch (e) {
      console.error('Error calling testserver teardown:', e);
    }
  };

  const warmup = async (serviceIds: string[]) => {
    await Promise.allSettled(
      serviceIds.map(serviceId =>
        testServerFetch(`/_/service/${serviceId}/readyz`)
      )
    );
  };

  return {
    base,
    testId,
    fetch: testServerFetch,
    warmup,
    start,
    fetchLog,
    end,
  };
}
