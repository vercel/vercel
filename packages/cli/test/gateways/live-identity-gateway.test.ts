import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type IdentityApi,
  liveIdentityGateway,
} from '../../src/gateways/identity-gateway';
import { APIError } from '../../src/util/errors-ts';
import { Response } from '../../src/util/fetch';
import { NowError } from '../../src/util/now-error';
import getTeamByIdOrSlug from '../../src/util/teams/get-team-by-id-or-slug';
import getTeams from '../../src/util/teams/get-teams';
import { buildTeam, buildUser } from '../fakes/fake-identity-gateway';

// The team helpers are mocked so every mapping branch is reachable. The
// protocol-level tests in identity-gateway.test.ts cover the real helpers.
vi.mock('../../src/util/teams/get-team-by-id-or-slug', () => ({
  default: vi.fn(),
}));
vi.mock('../../src/util/teams/get-teams', () => ({ default: vi.fn() }));

const team = buildTeam({ id: 'team_1', slug: 'acme' });
const user = buildUser({ id: 'user_1', username: 'alice' });

function apiWith(fetch: IdentityApi['fetch']): IdentityApi {
  return { authConfig: {}, fetch };
}

const unusedApi = apiWith((() => {
  throw new Error('fetch must not be called');
}) as IdentityApi['fetch']);

const errno = (code: string) => Object.assign(new Error(code), { code });

describe('liveIdentityGateway (mocked team helpers)', () => {
  beforeEach(() => {
    vi.mocked(getTeamByIdOrSlug).mockReset();
    vi.mocked(getTeams).mockReset();
  });

  describe('getCurrentUser', () => {
    it('returns the user from the API', async () => {
      const fetch = vi.fn().mockResolvedValue({ user });

      const result = await liveIdentityGateway({
        api: apiWith(fetch as IdentityApi['fetch']),
      }).getCurrentUser();

      expect(result).toEqual({ ok: true, value: user });
      expect(fetch).toHaveBeenCalledWith('/v2/user', {
        useCurrentTeam: false,
      });
    });

    it('maps a response without a user to missing_user', async () => {
      const fetch = vi.fn().mockResolvedValue({});

      const result = await liveIdentityGateway({
        api: apiWith(fetch as IdentityApi['fetch']),
      }).getCurrentUser();

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'missing_user',
          message: 'Not able to load user, missing from response',
        },
      });
    });

    it('maps a 403 to forbidden', async () => {
      const cause = new APIError(
        'forbidden',
        new Response(null, { status: 403 }),
        {}
      );
      const fetch = vi.fn().mockRejectedValue(cause);

      const result = await liveIdentityGateway({
        api: apiWith(fetch as IdentityApi['fetch']),
      }).getCurrentUser();

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'forbidden', details: { cause } },
      });
    });

    it.each([
      ['a NowError', new NowError({ code: 'X', message: 'x', meta: {} })],
      ['a plain error', new Error('bad json')],
    ])('maps %s to api_error', async (_name, cause) => {
      const fetch = vi.fn().mockRejectedValue(cause);

      const result = await liveIdentityGateway({
        api: apiWith(fetch as IdentityApi['fetch']),
      }).getCurrentUser();

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'api_error', details: { cause } },
      });
    });
  });

  describe('getTeam', () => {
    it('passes the API client and id or slug', async () => {
      vi.mocked(getTeamByIdOrSlug).mockResolvedValue(team);

      const result = await liveIdentityGateway({ api: unusedApi }).getTeam({
        idOrSlug: 'acme',
      });

      expect(result).toEqual({ type: 'found', value: team });
      expect(getTeamByIdOrSlug).toHaveBeenCalledWith(unusedApi, 'acme');
    });

    it('reports a missing team', async () => {
      vi.mocked(getTeamByIdOrSlug).mockResolvedValue(undefined as never);

      await expect(
        liveIdentityGateway({ api: unusedApi }).getTeam({ idOrSlug: 'acme' })
      ).resolves.toEqual({ type: 'missing' });
    });

    it.each([
      [
        'a 404',
        new APIError('fail', new Response(null, { status: 404 }), {}),
        'not_found',
      ],
      [
        'a non-404 API error',
        new APIError('fail', new Response(null, { status: 500 }), {}),
        'api_error',
      ],
      ['a network error', errno('ECONNRESET'), 'network'],
    ])('maps %s', async (_name, cause, code) => {
      vi.mocked(getTeamByIdOrSlug).mockRejectedValue(cause);

      const result = await liveIdentityGateway({ api: unusedApi }).getTeam({
        idOrSlug: 'acme',
      });

      expect(result).toEqual({
        type: 'error',
        error: { code, message: cause.message, details: { cause } },
      });
    });
  });

  describe('listTeams', () => {
    it('passes the API client and returns the teams', async () => {
      // `getTeams` is overloaded; the gateway uses the v1 `Team[]` overload.
      vi.mocked(getTeams).mockResolvedValue([team] as never);

      const result = await liveIdentityGateway({ api: unusedApi }).listTeams();

      expect(result).toEqual({ ok: true, value: [team] });
      expect(getTeams).toHaveBeenCalledWith(unusedApi);
    });

    it.each([
      ['not_authorized', errno('not_authorized'), 'not_authorized'],
      ['rate_limited', errno('rate_limited'), 'rate_limited'],
      ['other errno codes', errno('ECONNREFUSED'), 'network'],
      ['a plain error', new Error('bad json'), 'api_error'],
    ])('maps %s', async (_name, cause, code) => {
      vi.mocked(getTeams).mockRejectedValue(cause);

      const result = await liveIdentityGateway({ api: unusedApi }).listTeams();

      expect(result).toEqual({
        ok: false,
        error: { code, message: cause.message, details: { cause } },
      });
    });
  });
});
