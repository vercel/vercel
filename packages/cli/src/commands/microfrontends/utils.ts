import output from '../../output-manager';
import type Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import type { Project, Org, Team } from '@vercel-internals/types';
import type { MicrofrontendsGroupsResponse } from './types';

interface MicrofrontendsContext {
  project: Project;
  org: Org;
  team: Team;
  repoRoot?: string;
}

export async function ensureMicrofrontendsContext(
  client: Client,
  options?: { autoConfirm?: boolean }
): Promise<MicrofrontendsContext | number> {
  const link = await ensureLink('microfrontends', client, client.cwd, {
    autoConfirm: options?.autoConfirm,
  });
  if (typeof link === 'number') {
    return link;
  }

  const { project, org, repoRoot } = link;

  if (org.type !== 'team') {
    output.error('Microfrontends are only available for teams.');
    return 1;
  }

  client.config.currentTeam = org.id;
  const { team } = await getScope(client, {
    resolveLocalScope: true,
  });

  if (!team) {
    output.error('Microfrontends are only available for teams.');
    return 1;
  }

  return { project, org, team, repoRoot };
}

export async function fetchMicrofrontendsGroups(
  client: Client,
  teamId: string
): Promise<MicrofrontendsGroupsResponse> {
  output.spinner('Fetching microfrontends groups…');
  const response = await client.fetch<MicrofrontendsGroupsResponse>(
    `/v1/microfrontends/groups?teamId=${teamId}`,
    { method: 'GET' }
  );
  output.stopSpinner();
  return response;
}

/**
 * Validates that a string is a well-formed URL path suitable for use
 * as a microfrontends default route (e.g. `/docs`, `/app/settings`).
 *
 * Returns `true` if valid, or an error message string if invalid.
 * This signature is compatible with `client.input.text({ validate })`.
 */
export function validateDefaultRoute(path: string): true | string {
  if (!path || !path.startsWith('/')) {
    return 'Route must start with /';
  }
  if (/\s/.test(path)) {
    return 'Route must not contain spaces';
  }
  if (path.includes('?') || path.includes('#')) {
    return 'Route must not contain query strings or fragments';
  }
  try {
    new URL(path, 'http://n');
  } catch {
    return 'Route is not a valid URL path';
  }
  return true;
}

/**
 * Validates that a string looks like a valid routing path for microfrontends.json.
 * Routing paths support path-to-regexp syntax (e.g. `/docs`, `/docs/*`, `/app/:slug`).
 * Full validation happens at deploy time; this catches obvious mistakes early.
 * See https://vercel.com/docs/microfrontends/path-routing for supported syntax.
 */
export function validateRoutingPath(path: string): true | string {
  if (!path || !path.startsWith('/')) {
    return 'Path must start with /. See https://vercel.com/docs/microfrontends/path-routing for supported syntax.';
  }
  if (/\s/.test(path)) {
    return 'Path must not contain spaces. See https://vercel.com/docs/microfrontends/path-routing for supported syntax.';
  }
  return true;
}
