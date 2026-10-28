import type { Factories } from '../factories/types';
import type { PhaseTimings } from '../progress-events';
import { secs, type Progress } from './progress';
import { INFRA_TIMEOUT_MS, type TestServer } from './test-server';

// Port of vercel/front tooling/playwright/src/test/fixtures/authenticator.ts
// (at 185cfac41a9), minus cookies. Instead of setting browser cookies,
// `withTeam` makes the token and team the defaults for the `cli` and `api`
// fixtures. `withToken` is deferred until a test needs it.

export interface AuthContext {
  user: Factories.User;
  team: Factories.Team;
  token: Factories.Token;
}

export interface Authenticator {
  withTeam: (
    user: Factories.User,
    team: Factories.Team
  ) => Promise<Factories.Token>;
  /** The token/team set by the last `withTeam` call, if any. */
  readonly current: AuthContext | undefined;
}

export function createAuthenticator(
  testServer: TestServer,
  factories: Factories,
  phases?: PhaseTimings,
  progress?: Progress
): Authenticator {
  let current: AuthContext | undefined;

  // A successful testserver factory response guarantees that the token, team,
  // and creator membership are immediately readable. Assert the team-scope
  // verdict once, and fail at setup if the API ever violates that contract.
  const assertScopeUsable = async (authToken: string, teamSlug: string) => {
    const response = await testServer.fetch(
      `/v2/user/authenticate?teamId=${encodeURIComponent(teamSlug)}`,
      {
        headers: { authorization: authToken },
        signal: AbortSignal.timeout(INFRA_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      throw new Error(
        `authenticator.withTeam: testserver read-after-write invariant failed for team ${teamSlug}: /v2/user/authenticate returned HTTP ${response.status}`
      );
    }

    let body: {
      error?: { message?: string };
      user?: { id?: string };
      team?: {
        slug?: string;
        limited?: boolean;
        limitedBy?: ('scope' | 'mfa')[];
      };
    };
    try {
      body = (await response.json()) as typeof body;
    } catch {
      throw new Error(
        `authenticator.withTeam: testserver read-after-write invariant failed for team ${teamSlug}: /v2/user/authenticate returned invalid JSON`
      );
    }

    let verdict: string | undefined;
    if (body.error) {
      verdict = `error: ${body.error.message ?? 'unknown'}`;
    } else if (!body.user) {
      verdict = 'no user in response';
    } else if (body.team?.slug !== teamSlug) {
      verdict = `resolved team was ${body.team?.slug ?? 'absent'}`;
    } else if (body.team.limited && body.team.limitedBy?.includes('scope')) {
      verdict = 'team is limited by scope';
    }

    if (verdict) {
      throw new Error(
        `authenticator.withTeam: testserver read-after-write invariant failed for team ${teamSlug}: ${verdict}`
      );
    }
  };

  const withTeam = async (user: Factories.User, team: Factories.Team) => {
    const token = await factories.tokens.tokens.build({
      uid: user.id,
      teamId: team.id,
    });
    const authStartedAt = Date.now();
    try {
      await assertScopeUsable(`Bearer ${token.secretString}`, team.slug);
    } finally {
      const authMs = Date.now() - authStartedAt;
      if (phases) phases.authMs += authMs;
      progress?.log(`auth check ${secs(authMs)}`);
    }
    current = { user, team, token };
    return token;
  };

  return {
    withTeam,
    get current() {
      return current;
    },
  };
}
