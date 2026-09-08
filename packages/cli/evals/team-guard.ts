/**
 * HARD SAFETY GUARD for CLI evals — DO NOT WEAKEN OR BYPASS.
 *
 * Policy: CLI evals may ONLY ever run against the dedicated
 * "Agentic Zero Conf" evals team — no other team and no personal account.
 * There is intentionally NO env var or flag to bypass this guard. If you
 * believe the dedicated team changed, update the two constants below in a
 * reviewed PR — never at runtime.
 */

export const ALLOWED_EVAL_TEAM_ID = 'team_KhlEYrm473sP7ybEytVDlfyj';
export const ALLOWED_EVAL_TEAM_SLUG = 'agentic-zero-conf';

export class EvalTeamGuardError extends Error {
  constructor(message: string) {
    super(
      `CLI EVALS TEAM GUARD: refusing to run. ${message} ` +
        `CLI evals may only run against the dedicated "${ALLOWED_EVAL_TEAM_SLUG}" ` +
        `evals team (${ALLOWED_EVAL_TEAM_ID}) and no other team. There is no bypass.`
    );
    this.name = 'EvalTeamGuardError';
  }
}

/**
 * Assert that a team ID is exactly the dedicated evals team. Throws
 * EvalTeamGuardError otherwise (including when the value is missing).
 * `source` names where the value came from, for the error message.
 */
export function assertAllowedEvalTeam(
  teamId: string | undefined | null,
  source: string
): asserts teamId is string {
  if (teamId !== ALLOWED_EVAL_TEAM_ID) {
    throw new EvalTeamGuardError(
      `${source} is ${teamId ? `"${teamId}"` : 'not set'}, which is not the allowed evals team.`
    );
  }
}

let verifiedTokenPromise: Promise<string | undefined> | undefined;

/**
 * Single credential chokepoint for eval code: returns VERCEL_TOKEN only
 * after verifying (once per process, memoized) that it is scoped to ONLY the
 * dedicated evals team. Returns undefined when no token is set. Throws
 * EvalTeamGuardError — and keeps throwing on every subsequent call — if the
 * token can reach any other team or verification is impossible.
 *
 * All code that hands a token to a sandbox or to the Vercel API must get it
 * from here instead of reading process.env.VERCEL_TOKEN directly.
 */
/** Test-only: clears the memoized token verification so tests can vary env/fetch. */
export function resetEvalTeamGuardCacheForTests(): void {
  verifiedTokenPromise = undefined;
}

export function getVerifiedEvalToken(): Promise<string | undefined> {
  if (!verifiedTokenPromise) {
    verifiedTokenPromise = (async () => {
      const token = process.env.VERCEL_TOKEN;
      if (!token) return undefined;
      const apiBase =
        process.env.VERCEL_API_URL && process.env.VERCEL_API_URL.length > 0
          ? process.env.VERCEL_API_URL
          : undefined;
      await verifyTokenIsScopedToEvalTeam(token, apiBase);
      return token;
    })();
  }
  return verifiedTokenPromise;
}

interface TeamsResponse {
  teams?: Array<{ id?: string; slug?: string; name?: string }>;
  pagination?: { next?: number | null };
}

/**
 * Live, fail-closed verification that a Vercel token is scoped to ONLY the
 * dedicated evals team. Lists the teams the token can access and throws
 * unless that list is exactly [the evals team].
 *
 * A correct teamId in every request is not enough on its own: buggy eval or
 * teardown code running with a token that can reach other teams can still
 * damage them. A token that can see any other team (e.g. a broadly scoped
 * personal token) is rejected outright — mint a token scoped to the evals
 * team only.
 *
 * Any failure (network error, non-2xx, unexpected shape) throws: no
 * verification means no run.
 */
export async function verifyTokenIsScopedToEvalTeam(
  token: string,
  apiBase = 'https://api.vercel.com'
): Promise<void> {
  const fetchFn = (globalThis as any).fetch as
    | ((input: string | URL, init?: RequestInit) => Promise<Response>)
    | undefined;
  if (!fetchFn) {
    throw new EvalTeamGuardError(
      'global fetch is unavailable, so the token team scope cannot be verified.'
    );
  }

  let res: Response;
  try {
    res = await fetchFn(`${apiBase}/v2/teams?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err: any) {
    const message =
      err && typeof err.message === 'string' ? err.message : String(err);
    throw new EvalTeamGuardError(
      `could not list the token's teams to verify its scope (${message}).`
    );
  }

  if (!res.ok) {
    throw new EvalTeamGuardError(
      `listing the token's teams failed with status ${res.status}, so its scope cannot be verified.`
    );
  }

  let data: TeamsResponse;
  try {
    data = (await res.json()) as TeamsResponse;
  } catch {
    throw new EvalTeamGuardError(
      'the teams response could not be parsed, so the token scope cannot be verified.'
    );
  }

  const teams = data.teams ?? [];
  const allowed = teams.find(t => t.id === ALLOWED_EVAL_TEAM_ID);

  if (!allowed) {
    throw new EvalTeamGuardError(
      `the provided token cannot access the dedicated evals team at all.`
    );
  }

  if (allowed.slug && allowed.slug !== ALLOWED_EVAL_TEAM_SLUG) {
    throw new EvalTeamGuardError(
      `team ${ALLOWED_EVAL_TEAM_ID} resolved to slug "${allowed.slug}" instead of "${ALLOWED_EVAL_TEAM_SLUG}" — the allowlist constants look stale; fix them in a reviewed PR.`
    );
  }

  const others = teams.filter(t => t.id !== ALLOWED_EVAL_TEAM_ID);
  if (others.length > 0 || data.pagination?.next) {
    const names = others
      .slice(0, 5)
      .map(t => t.slug ?? t.id ?? 'unknown')
      .join(', ');
    throw new EvalTeamGuardError(
      `the provided token can access other teams (${names}${
        data.pagination?.next ? ', …' : ''
      }). Use a token scoped ONLY to the "${ALLOWED_EVAL_TEAM_SLUG}" evals team so a buggy eval or teardown physically cannot touch anything else.`
    );
  }
}
