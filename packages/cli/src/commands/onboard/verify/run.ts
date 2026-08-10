import type { VerifyCheck, VerifyManifest } from './manifest';

/**
 * Execute a verification manifest against a deployment.
 *
 * Sequential and deterministic: the same manifest against the same
 * deployment makes the same requests in the same order and applies the same
 * comparisons. Order matters to the author (a POST that creates what a
 * later GET reads), and one request at a time keeps the evidence readable.
 *
 * Redirects are not followed, matching `curl` without `-L`: the status the
 * deployment actually answered is the fact being checked.
 */

export interface CheckOutcome {
  method: string;
  path: string;
  why?: string;
  ok: boolean;
  /** HTTP status, absent when the request itself failed. */
  status?: number;
  expectedStatus: number[];
  /** Human-readable mismatches; empty when `ok`. */
  failures: string[];
  durationMs: number;
  /** First bytes of the response, kept only on failure. */
  bodySnippet?: string;
}

export interface VerifyRunResult {
  outcomes: CheckOutcome[];
  passed: number;
  failed: number;
  /** How many full passes were needed; more than one means readiness retries. */
  attempts: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const SNIPPET_LENGTH = 200;

/**
 * How long to keep retrying a deployment that is not answering yet. A fresh
 * deployment (and a freshly minted protection-bypass token) takes seconds
 * to propagate, and the observed signature is every check failing at the
 * status level moments after the deploy. Retrying is bounded, and stops the
 * moment any check passes — a partial failure is a real result, not a
 * readiness problem.
 */
const DEFAULT_READINESS_MS = 30_000;
const RETRY_DELAY_MS = 3_000;

export async function runChecks(options: {
  /** Origin the check paths resolve against, e.g. `https://app.vercel.app`. */
  baseUrl: string;
  manifest: VerifyManifest;
  /** Deployment Protection bypass, sent as `x-vercel-protection-bypass`. */
  bypassToken?: string | null;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Total budget for readiness retries; 0 disables them. */
  readinessMs?: number;
  /** Called before each retry, so the caller can say what is happening. */
  onRetry?: (attempt: number) => void;
  /** Injectable for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<VerifyRunResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const readinessMs = options.readinessMs ?? DEFAULT_READINESS_MS;
  const sleepImpl = options.sleepImpl ?? sleep;
  const deadline = Date.now() + readinessMs;

  let attempts = 0;
  while (true) {
    attempts += 1;
    const outcomes: CheckOutcome[] = [];
    for (const check of options.manifest.checks) {
      outcomes.push(
        await runCheck(check, options.baseUrl, {
          fetchImpl,
          timeoutMs,
          bypassToken: options.bypassToken ?? undefined,
        })
      );
    }

    const passed = outcomes.filter(outcome => outcome.ok).length;
    const result = {
      outcomes,
      passed,
      failed: outcomes.length - passed,
      attempts,
    };

    if (passed > 0 || !looksUnready(outcomes) || Date.now() >= deadline) {
      return result;
    }
    options.onRetry?.(attempts + 1);
    await sleepImpl(RETRY_DELAY_MS);
  }
}

/**
 * Every check failing at the status level (wrong status, or the request
 * itself failing) is the shape of a deployment that has not propagated —
 * body-only mismatches mean the app answered, and answering wrong is a
 * result.
 */
function looksUnready(outcomes: CheckOutcome[]): boolean {
  return outcomes.every(
    outcome =>
      !outcome.ok &&
      outcome.failures.some(
        failure =>
          failure.startsWith('status ') || failure.startsWith('request failed')
      )
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCheck(
  check: VerifyCheck,
  baseUrl: string,
  options: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    bypassToken?: string;
  }
): Promise<CheckOutcome> {
  const startedAt = Date.now();
  const base: Omit<CheckOutcome, 'ok' | 'failures' | 'durationMs'> = {
    method: check.method,
    path: check.path,
    expectedStatus: check.expect.status,
    ...(check.why ? { why: check.why } : {}),
  };

  const headers: Record<string, string> = { ...check.headers };
  if (options.bypassToken) {
    headers['x-vercel-protection-bypass'] = options.bypassToken;
  }
  if (check.bodyIsJson && !hasHeader(headers, 'content-type')) {
    headers['content-type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await options.fetchImpl(`${baseUrl}${check.path}`, {
      method: check.method,
      headers,
      ...(check.body !== undefined ? { body: check.body } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    return {
      ...base,
      ok: false,
      failures: [
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
      durationMs: Date.now() - startedAt,
    };
  }

  const failures: string[] = [];
  if (!check.expect.status.includes(response.status)) {
    failures.push(
      `status ${response.status} (expected ${check.expect.status.join(' or ')})`
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (
    check.expect.contentType &&
    !contentType.startsWith(check.expect.contentType)
  ) {
    failures.push(
      `content-type ${contentType || 'missing'} (expected ${check.expect.contentType})`
    );
  }

  let body = '';
  if (
    check.expect.bodyContains.length > 0 ||
    check.expect.notBodyContains.length > 0 ||
    failures.length > 0
  ) {
    try {
      body = await response.text();
    } catch {
      // An unreadable body fails only the assertions that need it.
    }
  }

  for (const needle of check.expect.bodyContains) {
    if (!body.includes(needle)) {
      failures.push(`body missing ${JSON.stringify(needle)}`);
    }
  }
  for (const needle of check.expect.notBodyContains) {
    if (body.includes(needle)) {
      failures.push(`body contains forbidden ${JSON.stringify(needle)}`);
    }
  }

  return {
    ...base,
    status: response.status,
    ok: failures.length === 0,
    failures,
    durationMs: Date.now() - startedAt,
    ...(failures.length > 0 && body ? { bodySnippet: snippet(body) } : {}),
  };
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(key => key.toLowerCase() === name);
}

function snippet(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  return collapsed.length <= SNIPPET_LENGTH
    ? collapsed
    : `${collapsed.slice(0, SNIPPET_LENGTH - 1)}…`;
}
