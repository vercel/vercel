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

/**
 * Why a check failed, at the level the recovery differs on.
 *
 * - `application` — the app answered, and answered wrong. A result.
 * - `deployment-unready` — every check failed at the status/request level
 *   moments after a deploy; the readiness retry owns it. A pass-level
 *   diagnosis: it is part of the contract for future ledger evolution but
 *   is never attached to a single check's outcome — unreadiness is only
 *   recognizable from the whole pass.
 * - `deployment-protection` — a Vercel protection response, recognized by
 *   Vercel-owned signals (never by bare status); the bypass-token refresh
 *   owns it.
 * - `request-failed` — the request itself failed (DNS, timeout).
 */
export type FailureClass =
  | 'application'
  | 'deployment-unready'
  | 'deployment-protection'
  | 'request-failed';

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
  /** Why it failed, at the level recovery differs on; absent when `ok`. */
  failureClass?: FailureClass;
  durationMs: number;
  /** First bytes of the response, kept only on failure. */
  bodySnippet?: string;
}

export interface VerifyRunResult {
  outcomes: CheckOutcome[];
  passed: number;
  failed: number;
  /** How many full passes were needed; more than one means retries. */
  attempts: number;
  /**
   * How many of those passes were protection retries — full-manifest reruns
   * after a bypass-token refresh, because checks hit Deployment Protection.
   */
  protectionRetries: number;
  /**
   * Checks still classified as `deployment-protection` after the final
   * pass. Non-zero means the result is about protection, not the app.
   */
  protectionBlocked: number;
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

/**
 * Full-manifest reruns allowed after protection was recognized and the
 * bypass token refreshed. One refreshed token normally settles it; the
 * second attempt covers a token that was minted while propagation was still
 * in flight. Bounded, because a token that fails twice is not going to
 * start working on the third identical request.
 */
const MAX_PROTECTION_RETRIES = 2;

/**
 * The hostname and path of Vercel's SSO handshake endpoint — where a
 * deployment protected by Vercel Authentication redirects an unauthorized
 * request. The same endpoint `src/util/openapi/spec-url.ts` completes the
 * handshake against, so this recognizer and the CLI's own SSO client cannot
 * drift apart silently.
 */
const SSO_API_HOST = 'vercel.com';
const SSO_API_PATH = '/sso-api';

/**
 * The nonce cookie a Vercel-protected response sets so the SSO handshake
 * can bind the browser to the request. Vercel-owned; an application would
 * have to impersonate Vercel's protection to set it.
 */
const SSO_NONCE_COOKIE = '_vercel_sso_nonce';

export async function runChecks(options: {
  /** Origin the check paths resolve against, e.g. `https://app.vercel.app`. */
  baseUrl: string;
  manifest: VerifyManifest;
  /** Deployment Protection bypass, sent as `x-vercel-protection-bypass`. */
  bypassToken?: string | null;
  /**
   * Reacquire a bypass token after checks were recognized as blocked by
   * Deployment Protection. Owned by the caller, which owns the client the
   * token comes from. Returning `null` means no fresh token could be
   * minted; the protection retry still runs once with the old token absent
   * or stale, and the result then says so.
   */
  refreshBypassToken?: () => Promise<string | null>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Total budget for readiness retries; 0 disables them. */
  readinessMs?: number;
  /** Called before each retry, so the caller can say what is happening. */
  onRetry?: (attempt: number, reason: 'unready' | 'protection') => void;
  /** Injectable for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<VerifyRunResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const readinessMs = options.readinessMs ?? DEFAULT_READINESS_MS;
  const sleepImpl = options.sleepImpl ?? sleep;
  const deadline = Date.now() + readinessMs;

  let bypassToken = options.bypassToken ?? undefined;
  let attempts = 0;
  let protectionRetries = 0;
  while (true) {
    attempts += 1;
    const outcomes: CheckOutcome[] = [];
    for (const check of options.manifest.checks) {
      outcomes.push(
        await runCheck(check, options.baseUrl, {
          fetchImpl,
          timeoutMs,
          bypassToken,
        })
      );
    }

    const passed = outcomes.filter(outcome => outcome.ok).length;
    const protectionBlocked = outcomes.filter(
      outcome => outcome.failureClass === 'deployment-protection'
    ).length;
    const result = {
      outcomes,
      passed,
      failed: outcomes.length - passed,
      attempts,
      protectionRetries,
      protectionBlocked,
    };

    // Deployment Protection first: it can block only the first requests of
    // a pass (the observed misclassification), so even a partially passing
    // pass is retried in full — with a refreshed token, preserving stateful
    // check order — rather than reported as the app failing. Bounded by its
    // own budget, not the readiness deadline, because a protected check is
    // an answer arriving, not a deployment propagating.
    if (protectionBlocked > 0 && protectionRetries < MAX_PROTECTION_RETRIES) {
      protectionRetries += 1;
      const refreshed = (await options.refreshBypassToken?.()) ?? null;
      if (refreshed) {
        bypassToken = refreshed;
      }
      options.onRetry?.(attempts + 1, 'protection');
      continue;
    }

    // Readiness retry, for a deployment that is not answering yet: only
    // when every check failed at the status/request level — a single pass
    // means the deployment answered, and a partial failure is a result.
    if (
      protectionBlocked === 0 &&
      passed === 0 &&
      looksUnready(outcomes) &&
      Date.now() < deadline
    ) {
      options.onRetry?.(attempts + 1, 'unready');
      await sleepImpl(RETRY_DELAY_MS);
      continue;
    }

    return result;
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
      (outcome.failureClass === 'request-failed' ||
        outcome.failures.some(failure => failure.startsWith('status ')))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recognize a Vercel Deployment Protection response by Vercel-owned
 * signals, never by status alone: an application's own 302/401/403 must
 * stay an application result. The signals are the ones the CLI's own SSO
 * client operates on — the redirect into `vercel.com/sso-api` and the
 * `_vercel_sso_nonce` cookie the protected response sets.
 */
function isProtectionResponse(response: Response): boolean {
  const location = response.headers.get('location');
  if (location) {
    try {
      const url = new URL(location, 'https://placeholder.invalid');
      if (
        url.hostname === SSO_API_HOST &&
        url.pathname.startsWith(SSO_API_PATH)
      ) {
        return true;
      }
    } catch {
      // An unparseable location is not a protection signal.
    }
  }

  const setCookie = response.headers.get('set-cookie');
  if (setCookie?.includes(`${SSO_NONCE_COOKIE}=`)) {
    return true;
  }

  return false;
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
  const base: Omit<
    CheckOutcome,
    'ok' | 'failures' | 'durationMs' | 'failureClass'
  > = {
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
      failureClass: 'request-failed',
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

  const ok = failures.length === 0;
  // A protection response that nonetheless satisfied every expectation is a
  // pass — the author asked for exactly that status. Classification only
  // describes failures.
  const failureClass: FailureClass | undefined = ok
    ? undefined
    : isProtectionResponse(response)
      ? 'deployment-protection'
      : 'application';

  if (failureClass === 'deployment-protection') {
    failures.push('blocked by Vercel Deployment Protection');
  }

  return {
    ...base,
    status: response.status,
    ok,
    failures,
    ...(failureClass ? { failureClass } : {}),
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
