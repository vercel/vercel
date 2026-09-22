import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_EVAL_TEAM_ID,
  ALLOWED_EVAL_TEAM_SLUG,
  assertAllowedEvalTeam,
  getVerifiedEvalToken,
  resetEvalTeamGuardCacheForTests,
  verifyTokenIsScopedToEvalTeam,
} from './team-guard';

function mockTeamsResponse(
  teams: Array<{ id: string; slug?: string }>,
  next?: number
) {
  return vi.fn(async (url: any) => {
    if (!String(url).includes('/v2/teams')) {
      throw new Error(`unexpected fetch in guard test: ${url}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        teams,
        ...(next ? { pagination: { next } } : {}),
      }),
    } as any;
  });
}

const originalFetch = (globalThis as any).fetch;

beforeEach(() => {
  resetEvalTeamGuardCacheForTests();
  delete process.env.VERCEL_TOKEN;
});

afterEach(() => {
  (globalThis as any).fetch = originalFetch;
  resetEvalTeamGuardCacheForTests();
  delete process.env.VERCEL_TOKEN;
});

describe('assertAllowedEvalTeam', () => {
  it('accepts exactly the dedicated evals team ID', () => {
    expect(() =>
      assertAllowedEvalTeam(ALLOWED_EVAL_TEAM_ID, 'test')
    ).not.toThrow();
  });

  it('rejects any other team ID', () => {
    expect(() => assertAllowedEvalTeam('team_vercel', 'test')).toThrow(
      /TEAM GUARD/
    );
    expect(() => assertAllowedEvalTeam('team_vercel_labs', 'test')).toThrow(
      /TEAM GUARD/
    );
  });

  it('rejects missing values (fail closed)', () => {
    expect(() => assertAllowedEvalTeam(undefined, 'test')).toThrow(
      /TEAM GUARD/
    );
    expect(() => assertAllowedEvalTeam('', 'test')).toThrow(/TEAM GUARD/);
    expect(() => assertAllowedEvalTeam(null, 'test')).toThrow(/TEAM GUARD/);
  });

  it('rejects case/whitespace variations (exact match only)', () => {
    expect(() =>
      assertAllowedEvalTeam(ALLOWED_EVAL_TEAM_ID.toUpperCase(), 'test')
    ).toThrow(/TEAM GUARD/);
    expect(() =>
      assertAllowedEvalTeam(` ${ALLOWED_EVAL_TEAM_ID}`, 'test')
    ).toThrow(/TEAM GUARD/);
  });
});

describe('verifyTokenIsScopedToEvalTeam', () => {
  it('accepts a token that can only access the dedicated evals team', async () => {
    (globalThis as any).fetch = mockTeamsResponse([
      { id: ALLOWED_EVAL_TEAM_ID, slug: ALLOWED_EVAL_TEAM_SLUG },
    ]);
    await expect(verifyTokenIsScopedToEvalTeam('tok')).resolves.toBeUndefined();
  });

  it('rejects a token that can access any other team', async () => {
    (globalThis as any).fetch = mockTeamsResponse([
      { id: ALLOWED_EVAL_TEAM_ID, slug: ALLOWED_EVAL_TEAM_SLUG },
      { id: 'team_labs', slug: 'vercel-labs' },
    ]);
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(
      /other teams/
    );
  });

  it('rejects a token that cannot access the evals team at all', async () => {
    (globalThis as any).fetch = mockTeamsResponse([
      { id: 'team_labs', slug: 'vercel-labs' },
    ]);
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(
      /cannot access the dedicated evals team/
    );
  });

  it('rejects when more teams exist beyond the first page (fail closed)', async () => {
    (globalThis as any).fetch = mockTeamsResponse(
      [{ id: ALLOWED_EVAL_TEAM_ID, slug: ALLOWED_EVAL_TEAM_SLUG }],
      12345
    );
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(
      /other teams/
    );
  });

  it('rejects when the allowed team ID resolves to an unexpected slug (stale allowlist)', async () => {
    (globalThis as any).fetch = mockTeamsResponse([
      { id: ALLOWED_EVAL_TEAM_ID, slug: 'some-renamed-team' },
    ]);
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(/stale/);
  });

  it('rejects on API errors (fail closed — no verification means no run)', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
    }));
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(
      /cannot be verified/
    );
  });

  it('rejects on network failure (fail closed)', async () => {
    (globalThis as any).fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(verifyTokenIsScopedToEvalTeam('tok')).rejects.toThrow(
      /could not list/
    );
  });
});

describe('getVerifiedEvalToken', () => {
  it('returns undefined when no VERCEL_TOKEN is set', async () => {
    await expect(getVerifiedEvalToken()).resolves.toBeUndefined();
  });

  it('returns the token after successful scope verification, verifying only once', async () => {
    process.env.VERCEL_TOKEN = 'tok';
    const fetchMock = mockTeamsResponse([
      { id: ALLOWED_EVAL_TEAM_ID, slug: ALLOWED_EVAL_TEAM_SLUG },
    ]);
    (globalThis as any).fetch = fetchMock;

    await expect(getVerifiedEvalToken()).resolves.toBe('tok');
    await expect(getVerifiedEvalToken()).resolves.toBe('tok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps rejecting once verification has failed (no retry-into-success)', async () => {
    process.env.VERCEL_TOKEN = 'tok';
    (globalThis as any).fetch = mockTeamsResponse([
      { id: 'team_labs', slug: 'vercel-labs' },
    ]);

    await expect(getVerifiedEvalToken()).rejects.toThrow(/TEAM GUARD/);
    // Even if fetch would now succeed, the cached rejection stands.
    (globalThis as any).fetch = mockTeamsResponse([
      { id: ALLOWED_EVAL_TEAM_ID, slug: ALLOWED_EVAL_TEAM_SLUG },
    ]);
    await expect(getVerifiedEvalToken()).rejects.toThrow(/TEAM GUARD/);
  });
});
