import type { Team, User } from '@vercel-internals/types';
import type { IdentityGateway } from '../../src/gateways/identity-gateway';
import type { GatewayResult, OptionalResult } from '../../src/gateways/result';
import { APIError } from '../../src/util/errors-ts';
import { Response } from '../../src/util/fetch';

export type FakeUserState =
  | User
  /** `/v2/user` answers 403: an invalid or app token. */
  | { kind: 'forbidden' }
  /** `/v2/user` answers without a `user`. */
  | { kind: 'missing_user' }
  /**
   * `/v2/user` fails with a server error (`api_error`, a 500 `APIError`) or
   * a transport error (`network`, a node-fetch `ECONNRESET` errno error).
   */
  | { kind: 'error'; code: 'api_error' | 'network' };

export type FakeTeamsState =
  | Team[]
  /** Listing teams fails with this API error code. */
  | { kind: 'error'; code: 'not_authorized' | 'rate_limited' | 'api_error' };

export type FakeIdentityGatewayState = {
  /** Defaults to `forbidden`. Any token is accepted. */
  user?: FakeUserState;
  /** Teams where the user is a direct member. Defaults to none. */
  teams?: FakeTeamsState;
  /** Teams only resolvable by direct lookup (virtual membership). */
  directTeams?: Team[];
};

/** In-memory Vercel identity API. */
export class FakeIdentityGateway implements IdentityGateway {
  #user: FakeUserState;
  #teams: FakeTeamsState;
  #directTeams: Team[];

  constructor(state: FakeIdentityGatewayState = {}) {
    this.#user = structuredClone(state.user ?? { kind: 'forbidden' });
    this.#teams = structuredClone(state.teams ?? []);
    this.#directTeams = structuredClone(state.directTeams ?? []);
  }

  async getCurrentUser(): Promise<GatewayResult<User>> {
    const user = this.#user;
    if ('kind' in user) {
      if (user.kind === 'missing_user') {
        return {
          ok: false,
          error: {
            code: 'missing_user',
            message: 'Not able to load user, missing from response',
          },
        };
      }
      if (user.kind === 'error') {
        const cause =
          user.code === 'network'
            ? Object.assign(
                new Error(
                  'request to https://api.vercel.com/v2/user failed, reason: socket hang up'
                ),
                { code: 'ECONNRESET' }
              )
            : apiError('Internal server error', 500, {
                code: 'internal_server_error',
              });
        return {
          ok: false,
          error: {
            code: user.code,
            message: cause.message,
            details: { cause },
          },
        };
      }
      const cause = apiError('You are not authorized', 403, {
        code: 'forbidden',
      });
      return {
        ok: false,
        error: {
          code: 'forbidden',
          message: cause.message,
          details: { cause },
        },
      };
    }
    return { ok: true, value: structuredClone(user) };
  }

  async getTeam({
    idOrSlug,
  }: {
    idOrSlug: string;
  }): Promise<OptionalResult<Team>> {
    const listed = Array.isArray(this.#teams) ? this.#teams : [];
    const team = [...listed, ...this.#directTeams].find(
      t => t.id === idOrSlug || t.slug === idOrSlug
    );
    return team
      ? { type: 'found', value: structuredClone(team) }
      : { type: 'missing' };
  }

  async listTeams(): Promise<GatewayResult<Team[]>> {
    const teams = this.#teams;
    if (!Array.isArray(teams)) {
      const status = TEAMS_ERROR_STATUS[teams.code];
      const cause = apiError(`Teams request failed (${teams.code})`, status, {
        code: teams.code,
      });
      return {
        ok: false,
        error: { code: teams.code, message: cause.message, details: { cause } },
      };
    }
    return { ok: true, value: structuredClone(teams) };
  }
}

const TEAMS_ERROR_STATUS = {
  not_authorized: 403,
  rate_limited: 429,
  api_error: 500,
} as const;

function apiError(message: string, status: number, body: object): APIError {
  return new APIError(message, new Response(null, { status }), body);
}

/** Builds a `User` with sensible defaults. */
export function buildUser(attrs: Partial<User> = {}): User {
  return {
    id: 'user_fake',
    username: 'fake-user',
    email: 'fake-user@example.com',
    name: 'Fake User',
    avatar: '',
    createdAt: 0,
    billing: {} as User['billing'],
    ...attrs,
  };
}

/** Builds a `Team` with sensible defaults. */
export function buildTeam(
  attrs: Partial<Team> & Pick<Team, 'id' | 'slug'>
): Team {
  return {
    name: attrs.slug,
    created: '2017-04-29T17:21:54.514Z',
    creatorId: 'user_fake',
    avatar: null,
    billing: {} as Team['billing'],
    membership: { uid: 'user_fake', role: 'OWNER', created: 0 },
    ...attrs,
  };
}
