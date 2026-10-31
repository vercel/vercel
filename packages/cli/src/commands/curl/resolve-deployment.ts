import type { Deployment } from '@vercel-internals/types';
import type Client from '../../util/client';
import output from '../../output-manager';
import { InvalidToken, isAPIError } from '../../util/errors-ts';
import { detectExplicitScope } from '../../util/get-scope';
import getTeams from '../../util/teams/get-teams';
import toHost from '../../util/to-host';
import { isAppPrincipalEnabled, resolveAppFromToken } from '../../util/app';
import { introspectToken } from '../../util/introspect-token';
import getUser from '../../util/get-user';

/** Discover candidate accounts without changing the user's selected team. */
export async function getDeploymentAccounts(client: Client): Promise<string[]> {
  if (detectExplicitScope(client)) {
    return client.config.currentTeam ? [client.config.currentTeam] : [];
  }

  // App tokens cannot list teams. Their introspected team is authoritative.
  if (isAppPrincipalEnabled()) {
    try {
      await getUser(client);
    } catch (err) {
      if (!(err instanceof InvalidToken)) throw err;
      const token = await introspectToken(client).catch(() => null);
      if (!token || !resolveAppFromToken(token)) throw err;
      return token.team ? [token.team.id] : [];
    }
  }

  const currentTeam = client.config.currentTeam;
  try {
    const teams = (await getTeams(client)).filter(team => !team.limited);
    return teams
      .map(team => team.id)
      .sort((a, b) => Number(b === currentTeam) - Number(a === currentTeam));
  } catch (err) {
    // Some scoped credentials can read deployments but cannot enumerate teams.
    if (err instanceof InvalidToken && currentTeam) return [currentTeam];
    throw err;
  }
}

/** Resolve explicit targets across the accounts the caller can access. */
export async function resolveDeployment(
  client: Client,
  selector: string,
  accountId?: string
): Promise<Deployment | null> {
  const hostOrId = selector.includes('.') ? toHost(selector) : selector;
  const endpoint = `/v13/deployments/${encodeURIComponent(hostOrId)}`;

  const lookup = async (accountId?: string): Promise<Deployment | null> => {
    try {
      const deployment = await client.fetch<Deployment>(endpoint, {
        useCurrentTeam: false,
        ...(accountId ? { accountId } : {}),
        bailOn429: true,
      });
      if (!deployment) return null;
      return {
        ...deployment,
        ownerId: deployment.ownerId ?? deployment.team?.id,
      };
    } catch (err) {
      if (!isAPIError(err) || (err.status !== 403 && err.status !== 404)) {
        throw err;
      }
      output.debug(`Deployment lookup failed for ${hostOrId}: ${err}`);
      return null;
    }
  };

  // An explicitly supplied scope remains an override, not a search hint.
  if (accountId || detectExplicitScope(client)) {
    return lookup(accountId ?? client.config.currentTeam);
  }

  let deployment = await lookup();
  if (deployment?.projectId && deployment.ownerId) return deployment;

  let accounts: string[];
  try {
    accounts = await getDeploymentAccounts(client);
  } catch (err) {
    if (deployment?.url) return deployment;
    throw err;
  }

  for (const account of accounts) {
    const scoped = await lookup(account);
    if (scoped?.projectId && scoped.ownerId) return scoped;
    // Keep a public response's URL usable even if ownership is unavailable.
    deployment ??= scoped;
  }
  return deployment;
}
