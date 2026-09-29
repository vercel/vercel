import { beforeEach, describe, expect, it } from 'vitest';
import type { Team } from '@vercel-internals/types';
import {
  type IdentityApi,
  liveIdentityGateway,
} from '../../src/gateways/identity-gateway';
import type { FetchOptions } from '../../src/util/client';
import { APIError, InvalidToken } from '../../src/util/errors-ts';
import { Response } from '../../src/util/fetch';
import { teamCache } from '../../src/util/teams/get-team-by-id-or-slug';
import {
  buildTeam,
  buildUser,
  FakeIdentityGateway,
} from '../fakes/fake-identity-gateway';

type Call = { url: string; opts: FetchOptions | undefined };
type Responder = (call: Call) => unknown;

/** An API client that records requests and answers from `respond`. */
function recordingApi(respond: Responder): { api: IdentityApi; calls: Call[] } {
  const calls: Call[] = [];
  const api: IdentityApi = {
    authConfig: {},
    fetch: (async (url: string, opts?: FetchOptions) => {
      const call = { url, opts };
      calls.push(call);
      return respond(call);
    }) as IdentityApi['fetch'],
  };
  return { api, calls };
}

function apiError(status: number, body: object = {}): APIError {
  return new APIError('Request failed', new Response(null, { status }), body);
}

const user = buildUser({ id: 'user_1', username: 'alice' });
const team = buildTeam({ id: 'team_1', slug: 'acme' });

describe('liveIdentityGateway', () => {
  beforeEach(() => {
    teamCache.clear();
  });

  describe('getCurrentUser', () => {
    it('requests /v2/user without the current team', async () => {
      const { api, calls } = recordingApi(() => ({ user }));

      const result = await liveIdentityGateway({ api }).getCurrentUser();

      expect(result).toEqual({ ok: true, value: user });
      expect(calls).toEqual([
        { url: '/v2/user', opts: { useCurrentTeam: false } },
      ]);
    });

    it('maps a 403 to forbidden with the original error', async () => {
      const cause = apiError(403);
      const { api } = recordingApi(() => {
        throw cause;
      });

      const result = await liveIdentityGateway({ api }).getCurrentUser();

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'forbidden',
          message: cause.message,
          details: { cause },
        },
      });
    });

    it('maps a response without a user to missing_user', async () => {
      const { api } = recordingApi(() => ({}));

      const result = await liveIdentityGateway({ api }).getCurrentUser();

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'missing_user' },
      });
    });

    it('maps other API errors to api_error', async () => {
      const cause = apiError(500);
      const { api } = recordingApi(() => {
        throw cause;
      });

      const result = await liveIdentityGateway({ api }).getCurrentUser();

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'api_error', details: { cause } },
      });
    });

    it('maps network errors to network', async () => {
      const cause = Object.assign(new Error('socket hang up'), {
        code: 'ECONNRESET',
      });
      const { api } = recordingApi(() => {
        throw cause;
      });

      const result = await liveIdentityGateway({ api }).getCurrentUser();

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'network', details: { cause } },
      });
    });
  });

  describe('getTeam', () => {
    it('fetches the team and shares the team cache', async () => {
      const { api, calls } = recordingApi(() => team);
      const identity = liveIdentityGateway({ api });

      await expect(identity.getTeam({ idOrSlug: 'acme' })).resolves.toEqual({
        type: 'found',
        value: team,
      });
      expect(calls.map(c => c.url)).toEqual(['/teams/acme']);
      expect(teamCache.get(team.id)).toEqual(team);

      await identity.getTeam({ idOrSlug: team.id });
      expect(calls).toHaveLength(1);
    });

    it('maps a 404 to not_found with the original error', async () => {
      const cause = apiError(404);
      const { api } = recordingApi(() => {
        throw cause;
      });

      const result = await liveIdentityGateway({ api }).getTeam({
        idOrSlug: 'nope',
      });

      expect(result).toMatchObject({
        type: 'error',
        error: { code: 'not_found', details: { cause } },
      });
    });
  });

  describe('listTeams', () => {
    it('lists teams without the current team', async () => {
      const { api, calls } = recordingApi(() => ({ teams: [team] }));

      const result = await liveIdentityGateway({ api }).listTeams();

      expect(result).toEqual({ ok: true, value: [team] });
      expect(calls).toEqual([
        { url: '/v1/teams', opts: { useCurrentTeam: false } },
      ]);
    });

    it.each([
      [401, 'not_authorized'],
      [429, 'rate_limited'],
    ])('maps a %d %s error code', async (status, code) => {
      const cause = apiError(status, { code });
      const { api } = recordingApi(() => {
        throw cause;
      });

      const result = await liveIdentityGateway({ api }).listTeams();

      expect(result).toMatchObject({
        ok: false,
        error: { code, details: { cause } },
      });
    });

    it('maps a 403 to api_error caused by InvalidToken, like getTeams', async () => {
      const { api } = recordingApi(() => {
        throw apiError(403);
      });

      const result = await liveIdentityGateway({ api }).listTeams();

      expect(result).toMatchObject({ ok: false, error: { code: 'api_error' } });
      expect(result.ok || result.error.details?.cause).toBeInstanceOf(
        InvalidToken
      );
    });
  });
});

describe('FakeIdentityGateway', () => {
  it('returns the configured user', async () => {
    const identity = new FakeIdentityGateway({ user });

    await expect(identity.getCurrentUser()).resolves.toEqual({
      ok: true,
      value: user,
    });
  });

  it('is forbidden by default, with an APIError cause', async () => {
    const result = await new FakeIdentityGateway().getCurrentUser();

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    expect(result.ok || result.error.details?.cause).toBeInstanceOf(APIError);
  });

  it('models a response without a user', async () => {
    const identity = new FakeIdentityGateway({
      user: { kind: 'missing_user' },
    });

    await expect(identity.getCurrentUser()).resolves.toMatchObject({
      ok: false,
      error: { code: 'missing_user' },
    });
  });

  it.each([
    ['api_error', APIError],
    ['network', Error],
  ] as const)('models a %s user lookup failure the live gateway maps the same way', async (code, causeType) => {
    const fake = await new FakeIdentityGateway({
      user: { kind: 'error', code },
    }).getCurrentUser();

    expect(fake).toMatchObject({ ok: false, error: { code } });
    const cause = fake.ok ? undefined : fake.error.details?.cause;
    expect(cause).toBeInstanceOf(causeType);
    expect(fake.ok || fake.error.message).toBe((cause as Error).message);

    // Parity: the live gateway classifies the fake's cause identically.
    const { api } = recordingApi(() => {
      throw cause;
    });
    await expect(
      liveIdentityGateway({ api }).getCurrentUser()
    ).resolves.toEqual(fake);
  });

  it('resolves listed and directly-resolvable teams by id or slug', async () => {
    const virtual: Team = buildTeam({ id: 'team_v', slug: 'virtual' });
    const identity = new FakeIdentityGateway({
      teams: [team],
      directTeams: [virtual],
    });

    await expect(identity.listTeams()).resolves.toEqual({
      ok: true,
      value: [team],
    });
    await expect(identity.getTeam({ idOrSlug: 'acme' })).resolves.toEqual({
      type: 'found',
      value: team,
    });
    await expect(identity.getTeam({ idOrSlug: 'team_v' })).resolves.toEqual({
      type: 'found',
      value: virtual,
    });
    await expect(identity.getTeam({ idOrSlug: 'nope' })).resolves.toEqual({
      type: 'missing',
    });
  });

  it('models team listing failures with API error codes', async () => {
    const identity = new FakeIdentityGateway({
      teams: { kind: 'error', code: 'rate_limited' },
    });

    const result = await identity.listTeams();

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'rate_limited' },
    });
    expect(result.ok || result.error.details?.cause).toMatchObject({
      code: 'rate_limited',
      status: 429,
    });
  });

  it.each([
    ['not_authorized', 403],
    ['rate_limited', 429],
    ['api_error', 500],
  ] as const)('gives a %s team listing failure an APIError cause with status %d', async (code, status) => {
    const result = await new FakeIdentityGateway({
      teams: { kind: 'error', code },
    }).listTeams();

    const cause = result.ok ? undefined : result.error.details?.cause;
    expect(cause).toBeInstanceOf(APIError);
    expect(cause).toMatchObject({ code, status });
  });
});
