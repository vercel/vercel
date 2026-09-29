import type { Team, User } from '@vercel-internals/types';
import { isErrnoException } from '@vercel/error-utils';
import { APIError } from '../util/errors-ts';
import { NowError } from '../util/now-error';
import getTeamByIdOrSlug from '../util/teams/get-team-by-id-or-slug';
import getTeams, { type TeamsClient } from '../util/teams/get-teams';
import {
  gatewayErrorFromCause,
  type GatewayResult,
  type OptionalResult,
} from './result';

/** The Vercel identity API: the current user and teams. */
export type IdentityGateway = {
  /**
   * Error codes: `forbidden` (403), `missing_user` (no `user` in the
   * response), `api_error` or `network` (`details.cause`).
   */
  getCurrentUser(): Promise<GatewayResult<User>>;
  /**
   * `missing` when the API returns no team. Error codes: `not_found` (404),
   * `api_error`, or `network`, all with `details.cause`.
   */
  getTeam(input: { idOrSlug: string }): Promise<OptionalResult<Team>>;
  /**
   * Error codes mirror the API error code: `not_authorized`, `rate_limited`,
   * otherwise `api_error` or `network`. `details.cause` holds the original.
   */
  listTeams(): Promise<GatewayResult<Team[]>>;
};

/** The API client capabilities the live identity gateway needs. */
export type IdentityApi = TeamsClient;

/** `network` for transport errors (errno codes), otherwise `api_error`. */
function failureCode(err: unknown): string {
  if (err instanceof APIError || err instanceof NowError) {
    return 'api_error';
  }
  return isErrnoException(err) ? 'network' : 'api_error';
}

export function liveIdentityGateway({
  api,
}: {
  api: IdentityApi;
}): IdentityGateway {
  return {
    async getCurrentUser() {
      try {
        const res = await api.fetch<{ user?: User }>('/v2/user', {
          useCurrentTeam: false,
        });
        if (!res.user) {
          return {
            ok: false,
            error: {
              code: 'missing_user',
              message: 'Not able to load user, missing from response',
            },
          };
        }
        return { ok: true, value: res.user };
      } catch (err: unknown) {
        const code =
          err instanceof APIError && err.status === 403
            ? 'forbidden'
            : failureCode(err);
        return { ok: false, error: gatewayErrorFromCause(code, err) };
      }
    },
    async getTeam({ idOrSlug }) {
      try {
        // Shares the module-level team cache with every other caller.
        const team = await getTeamByIdOrSlug(api, idOrSlug);
        return team ? { type: 'found', value: team } : { type: 'missing' };
      } catch (err: unknown) {
        const code =
          err instanceof APIError && err.status === 404
            ? 'not_found'
            : failureCode(err);
        return { type: 'error', error: gatewayErrorFromCause(code, err) };
      }
    },
    async listTeams() {
      try {
        return { ok: true, value: await getTeams(api) };
      } catch (err: unknown) {
        const code =
          isErrnoException(err) &&
          (err.code === 'not_authorized' || err.code === 'rate_limited')
            ? err.code
            : failureCode(err);
        return { ok: false, error: gatewayErrorFromCause(code, err) };
      }
    },
  };
}
