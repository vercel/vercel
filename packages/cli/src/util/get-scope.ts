import { relative } from 'path';
import type Client from './client';
import type { Org, Team, User } from '@vercel-internals/types';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import { TeamDeleted } from './errors-ts';
import { getLinkFromDir, getVercelDirectory } from './projects/link';
import { getRepoLink, findProjectsFromPath } from './link/repo';
import type { RepoProjectsConfig } from './link/repo';
import output from '../output-manager';

export interface ScopeContext {
  /** The resolved org for API calls */
  org: Org;
  /** Display name for the active scope (team slug or username) */
  contextName: string;
  /** The authenticated user */
  user: User;
  /** The resolved team, or null if using a personal account */
  team: Team | null;

  /** Local repo link info, null if not in a repo-linked directory */
  linkedRepo: {
    repoConfig: RepoProjectsConfig;
    rootPath: string;
  } | null;

  /** repo.json has projects with different orgIds */
  isCrossTeamRepo: boolean;
  /** global scope !== linked project's orgId */
  scopeMismatch: boolean;
  /** user passed --scope, --team, or has scope in vercel.json */
  explicitScopeProvided: boolean;
}

interface GetScopeOptions {
  getTeam?: boolean;
  /** Read local scope (.vercel/project.json, .vercel/repo.json) and reconcile with global scope */
  resolveLocalScope?: boolean;
}

/**
 * Resolves the current scope for CLI commands.
 *
 * With no options (or just `{ getTeam }`), returns the basic global scope:
 * `{ contextName, team, user }`. This is the fast path — no disk reads.
 *
 * With `{ resolveLocalScope }`, also reads local scope
 * (.vercel/project.json, .vercel/repo.json) and reconciles it with
 * the global scope, returning the full `ScopeContext`.
 */
export default async function getScope(
  client: Client,
  opts: GetScopeOptions = {}
) {
  const user = await getUser(client);
  let contextName = user.username || user.email;
  let team: Team | null = null;
  const defaultTeamId =
    user.version === 'northstar' ? user.defaultTeamId : undefined;
  const currentTeamOrDefaultTeamId = client.config.currentTeam || defaultTeamId;

  if (currentTeamOrDefaultTeamId && opts.getTeam !== false) {
    team = await getTeamById(client, currentTeamOrDefaultTeamId);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  // Fast path: no local scope resolution, return basic scope
  if (!opts.resolveLocalScope) {
    return { contextName, team, user };
  }

  // Enriched path: reconcile global scope with local scope
  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;

  // Read local scope (non-blocking, best-effort)
  const cwd = client.cwd;
  const projectLink = await getLinkFromDir<{
    orgId: string;
    projectId: string;
  }>(getVercelDirectory(cwd)).catch(() => null);
  const repoLink = await getRepoLink(client, cwd).catch(() => null);

  // Determine the local orgId from project link or repo link
  let localOrgId: string | undefined;
  if (projectLink) {
    localOrgId = projectLink.orgId;
  } else if (repoLink?.repoConfig) {
    const repoConfig = repoLink.repoConfig;
    const projects = findProjectsFromPath(
      repoConfig.projects,
      relative(repoLink.rootPath, cwd)
    );
    if (projects.length === 1) {
      localOrgId = projects[0].orgId ?? repoLink.repoConfig.orgId ?? undefined;
    } else if (projects.length > 1) {
      const orgIds = new Set(
        projects.map(p => p.orgId ?? repoConfig.orgId ?? '')
      );
      if (orgIds.size === 1) {
        const [singleOrgId] = orgIds;
        if (singleOrgId) {
          localOrgId = singleOrgId;
        }
      }
    }
  }

  // Detect cross-team repo
  const isCrossTeamRepo = detectCrossTeamRepo(repoLink?.repoConfig);

  // Detect mismatch
  const scopeMismatch = Boolean(
    localOrgId && globalTeamId && globalTeamId !== localOrgId
  );

  // Resolve the effective scope
  let resolvedOrg: Org;
  let resolvedContextName = contextName;
  let resolvedTeam = team;
  let linkedRepoResult: ScopeContext['linkedRepo'] = null;

  if (repoLink?.repoConfig) {
    linkedRepoResult = {
      repoConfig: repoLink.repoConfig,
      rootPath: repoLink.rootPath,
    };
  }

  if (explicitScopeProvided) {
    // Explicit --scope wins
    resolvedOrg = team
      ? { type: 'team', id: team.id, slug: team.slug }
      : { type: 'user', id: user.id, slug: user.username };
  } else if (localOrgId) {
    // No explicit scope, inherit from local link
    client.config.currentTeam = localOrgId.startsWith('team_')
      ? localOrgId
      : undefined;

    const correctedTeam = client.config.currentTeam
      ? await getTeamById(client, client.config.currentTeam)
      : null;
    const correctedUser = await getUser(client);
    resolvedOrg = correctedTeam
      ? { type: 'team', id: correctedTeam.id, slug: correctedTeam.slug }
      : {
          type: 'user',
          id: correctedUser.id,
          slug: correctedUser.username,
        };
    resolvedContextName = correctedTeam
      ? correctedTeam.slug
      : correctedUser.username || correctedUser.email;
    resolvedTeam = correctedTeam;
  } else {
    // No local link, use global scope as-is
    if (isCrossTeamRepo) {
      output.warn(
        `This repository has projects across multiple teams. ` +
          `Use \`--scope\` to specify which team, or \`cd\` into a project directory.`
      );
    }
    resolvedOrg = team
      ? { type: 'team', id: team.id, slug: team.slug }
      : { type: 'user', id: user.id, slug: user.username };
  }

  return {
    org: resolvedOrg,
    contextName: resolvedContextName,
    user,
    team: resolvedTeam,
    linkedRepo: linkedRepoResult,
    isCrossTeamRepo,
    scopeMismatch,
    explicitScopeProvided,
  } satisfies ScopeContext;
}

/**
 * Applies scope from a pre-resolved project link.
 * Sets client.config.currentTeam and warns if the linked project's org
 * differs from the user's current global scope (--scope, vc switch, config).
 *
 * Use this when the command already has a link from getLinkedProject()/ensureLink().
 * Unlike getScope(), this makes no API calls.
 */
export function applyScopeFromLink(client: Client, link: { org: Org }): void {
  const localOrgId = link.org.id;
  const globalTeamId = client.config.currentTeam;

  const scopeMismatch = Boolean(globalTeamId && globalTeamId !== localOrgId);

  if (scopeMismatch) {
    output.warn(
      `This directory is linked to a project under a different team than your current scope. ` +
        `Using the linked project's team. To change, run \`vc link\`.`
    );
  }

  client.config.currentTeam = localOrgId.startsWith('team_')
    ? localOrgId
    : undefined;
}

/**
 * Detects whether the user explicitly provided a scope via --scope, --team,
 * or the `scope` field in vercel.json (localConfig).
 */
function detectExplicitScope(client: Client): boolean {
  const argv = client.argv;
  for (const arg of argv) {
    if (
      arg === '--scope' ||
      arg === '--team' ||
      arg.startsWith('--scope=') ||
      arg.startsWith('--team=') ||
      arg === '-T'
    ) {
      return true;
    }
  }

  if (client.localConfig?.scope) {
    return true;
  }

  return false;
}

/**
 * Detects whether a repo.json config has projects across multiple teams.
 */
function detectCrossTeamRepo(
  repoConfig: RepoProjectsConfig | undefined
): boolean {
  if (!repoConfig?.projects || repoConfig.projects.length < 2) {
    return false;
  }

  const orgIds = new Set<string>();
  for (const project of repoConfig.projects) {
    const orgId = project.orgId ?? repoConfig.orgId;
    if (orgId) {
      orgIds.add(orgId);
    }
  }
  return orgIds.size > 1;
}
