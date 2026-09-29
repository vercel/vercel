import type { Team, User } from '@vercel-internals/types';
import { errorToString, isErrnoException } from '@vercel/error-utils';
import type { ScopeResolutionContext } from '../../gateways/context';
import { gatewayErrorCause } from '../../gateways/result';
import output from '../../output-manager';
import { isAppPrincipalEnabled, resolveAppFromToken } from '../app';
import {
  introspectSessionToken,
  loadCurrentUser,
  type ScopeSession,
} from './resolve-scope';

export type ResolveExplicitScopeResult =
  | { ok: true }
  | { ok: false; exitCode: 1 };

/**
 * Resolves a `--scope` value (or `--team`, or `scope` from the local config)
 * at CLI bootstrap and applies it to `config.currentTeam`. Prints the
 * user-facing error and returns `{ ok: false }` when the scope can't be used.
 */
export async function resolveExplicitScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  {
    scope,
    trackAgenticErrorTelemetry,
  }: {
    scope: string;
    trackAgenticErrorTelemetry: (err: unknown) => void;
  }
): Promise<ResolveExplicitScopeResult> {
  let user: User | null = null;

  try {
    user = await loadCurrentUser(ctx, session);
    session.telemetryEventStore.updateUserId(user.id);
  } catch (err: unknown) {
    if (err instanceof Error) {
      output.debug(err.stack || err.toString());
    }

    // App tokens cannot fetch the user; resolve the scope against the
    // token's own team instead.
    const appTokenScopeResolved =
      isErrnoException(err) &&
      err.code === 'NOT_AUTHORIZED' &&
      isAppPrincipalEnabled(session.env) &&
      (await resolveAppTokenScope(ctx, session, scope));

    if (!appTokenScopeResolved) {
      if (isErrnoException(err) && err.code === 'NOT_AUTHORIZED') {
        output.prettyError({
          message: `You do not have access to the specified account`,
          link: 'https://err.sh/vercel/scope-not-accessible',
        });

        trackAgenticErrorTelemetry(err);
        return { ok: false, exitCode: 1 };
      }

      output.error(
        `Not able to load user because of unexpected error: ${errorToString(err)}`
      );
      trackAgenticErrorTelemetry(err);
      return { ok: false, exitCode: 1 };
    }
  }

  if (!user) {
    return { ok: true };
  }

  const scopeMatchesUserIdentity =
    user.id === scope || user.email === scope || user.username === scope;

  let teams: Team[] = [];

  const teamsResult = await ctx.identity.listTeams();
  if (teamsResult.ok) {
    teams = teamsResult.value;
  } else {
    const err = gatewayErrorCause(teamsResult.error);
    // If the scope clearly refers to the user's own identity we don't need
    // the teams list to resolve it, so swallow any failure and fall through
    // to personal-account handling. Otherwise the teams list is required, so
    // surface the error.
    if (scopeMatchesUserIdentity) {
      output.debug(
        `Ignoring failure to load teams; scope matches the current user's identity`
      );
    } else if (teamsResult.error.code === 'not_authorized') {
      output.prettyError({
        message: `You do not have access to the specified team`,
        link: 'https://err.sh/vercel/scope-not-accessible',
      });

      trackAgenticErrorTelemetry(err);
      return { ok: false, exitCode: 1 };
    } else if (teamsResult.error.code === 'rate_limited') {
      output.prettyError({
        message: 'Rate limited. Too many requests to the same endpoint: /teams',
      });

      trackAgenticErrorTelemetry(err);
      return { ok: false, exitCode: 1 };
    } else {
      output.error('Not able to load teams');
      trackAgenticErrorTelemetry(err);
      return { ok: false, exitCode: 1 };
    }
  }

  // A scope string can be ambiguous: a Northstar user's username may also be
  // the slug of a team they own (the team backing their default scope). In
  // that case the team must win. Otherwise the user could not target the
  // team by name because the personal account check would reject it.
  let related = teams.find(team => team.id === scope || team.slug === scope);

  // The `/teams` list only contains teams where the user is a direct
  // member. The user can also hold a virtual membership to a team. In
  // that case the list omits the team, but `GET /teams/:id` still resolves
  // it. Look up the scope directly before we reject it.
  if (!related && !scopeMatchesUserIdentity) {
    const lookup = await ctx.identity.getTeam({ idOrSlug: scope });
    if (lookup.type === 'found') {
      related = lookup.value;
    } else if (lookup.type === 'error') {
      output.debug(
        `Direct team lookup for scope "${scope}" failed: ${errorToString(
          gatewayErrorCause(lookup.error)
        )}`
      );
    }
  }

  if (related) {
    session.config.currentTeam = related.id;
  } else if (scopeMatchesUserIdentity) {
    if (user.version === 'northstar') {
      output.error('You cannot set your Personal Account as the scope.');
      return { ok: false, exitCode: 1 };
    }

    delete session.config.currentTeam;
  } else {
    output.prettyError({
      message: 'The specified scope does not exist',
      link: 'https://err.sh/vercel/scope-not-existent',
    });

    return { ok: false, exitCode: 1 };
  }

  return { ok: true };
}

/**
 * Resolves a `--scope` value against an app token's introspected team, since
 * app tokens cannot list users or teams. Applies the team as the current
 * scope on a match.
 */
export async function resolveAppTokenScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  scope: string
): Promise<boolean> {
  const token = await introspectSessionToken(ctx, session);
  const app = token ? resolveAppFromToken(token) : null;
  const team = token?.team;

  if (!app || !team) {
    return false;
  }

  if (team.id !== scope && team.slug !== scope) {
    return false;
  }

  session.config.currentTeam = team.id;
  return true;
}
