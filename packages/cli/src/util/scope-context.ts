import { relative } from 'path';
import type Client from './client';
import type { Org, Project, Team, User } from '@vercel-internals/types';
import getScope from './get-scope';
import { getProjectLink, getLinkedProject } from './projects/link';
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

  /** Local project link info, null if not in a linked directory */
  linkedProject: { org: Org; project: Project } | null;
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

interface ResolveScopeOptions {
  /** Command needs a linked project (e.g. deploy, env, pull) */
  requiresProject?: boolean;
  /** Command just needs a team scope (e.g. project ls, domains) */
  requiresTeamOnly?: boolean;
}

/**
 * Resolves the scope context by reconciling global scope (--scope, vc switch, config)
 * with local scope (.vercel/project.json orgId, .vercel/repo.json per-project orgId).
 *
 * This is the high-level function commands should use instead of calling getScope()
 * or reading getLinkedProject() and manually setting client.config.currentTeam.
 */
export async function resolveScopeContext(
  client: Client,
  opts: ResolveScopeOptions = {}
): Promise<ScopeContext> {
  // Step 1: Read global scope
  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;

  // Step 2: Read global user/team info
  const { contextName: globalContextName, team, user } = await getScope(client);

  // Step 3: Read local scope (non-blocking, best-effort)
  const cwd = client.cwd;
  const projectLink = await getProjectLink(client, cwd).catch(() => null);
  const repoLink = await getRepoLink(client, cwd).catch(() => null);

  // Determine the local orgId from project link or repo link
  let localOrgId: string | undefined;
  if (projectLink) {
    localOrgId = projectLink.orgId;
  } else if (repoLink?.repoConfig) {
    const projects = findProjectsFromPath(
      repoLink.repoConfig.projects,
      relative(repoLink.rootPath, cwd)
    );
    if (projects.length === 1) {
      localOrgId = projects[0].orgId ?? repoLink.repoConfig.orgId ?? undefined;
    }
  }

  // Step 4: Detect cross-team repo
  const isCrossTeamRepo = detectCrossTeamRepo(repoLink?.repoConfig);

  // Step 5: Detect mismatch
  const scopeMismatch = Boolean(
    localOrgId && globalTeamId && globalTeamId !== localOrgId
  );

  // Step 6: Resolve the effective scope
  let resolvedOrg: Org;
  let resolvedContextName = globalContextName;
  let resolvedTeam = team;
  let linkedProjectResult: ScopeContext['linkedProject'] = null;
  let linkedRepoResult: ScopeContext['linkedRepo'] = null;

  if (repoLink?.repoConfig) {
    linkedRepoResult = {
      repoConfig: repoLink.repoConfig,
      rootPath: repoLink.rootPath,
    };
  }

  if (opts.requiresProject && localOrgId) {
    // Project-bound commands: local link wins
    if (scopeMismatch) {
      output.warn(
        `This directory is linked to a project under a different team than your current scope. ` +
          `Using the linked project's team. To change, run \`vc link\`.`
      );
    }

    // Override client.config.currentTeam to the local org
    client.config.currentTeam = localOrgId.startsWith('team_')
      ? localOrgId
      : undefined;

    // Re-fetch scope with the corrected team
    const corrected = await getScope(client);
    resolvedOrg = corrected.team
      ? { type: 'team', id: corrected.team.id, slug: corrected.team.slug }
      : { type: 'user', id: corrected.user.id, slug: corrected.user.username };
    resolvedContextName = corrected.contextName;
    resolvedTeam = corrected.team;

    // Try to get the full linked project for context
    const fullLink = await getLinkedProject(client, cwd).catch(() => null);
    if (fullLink && fullLink.status === 'linked') {
      linkedProjectResult = { org: fullLink.org, project: fullLink.project };
    }
  } else if (opts.requiresTeamOnly) {
    // Team-only commands
    if (explicitScopeProvided) {
      // Explicit --scope wins for team-only commands
      resolvedOrg = team
        ? { type: 'team', id: team.id, slug: team.slug }
        : { type: 'user', id: user.id, slug: user.username };
    } else if (localOrgId) {
      // No explicit scope, inherit from local link
      client.config.currentTeam = localOrgId.startsWith('team_')
        ? localOrgId
        : undefined;

      const corrected = await getScope(client);
      resolvedOrg = corrected.team
        ? {
            type: 'team',
            id: corrected.team.id,
            slug: corrected.team.slug,
          }
        : {
            type: 'user',
            id: corrected.user.id,
            slug: corrected.user.username,
          };
      resolvedContextName = corrected.contextName;
      resolvedTeam = corrected.team;
    } else {
      // No local link, use global scope as-is
      resolvedOrg = team
        ? { type: 'team', id: team.id, slug: team.slug }
        : { type: 'user', id: user.id, slug: user.username };
    }
  } else {
    // No specific requirement — use global scope
    resolvedOrg = team
      ? { type: 'team', id: team.id, slug: team.slug }
      : { type: 'user', id: user.id, slug: user.username };
  }

  return {
    org: resolvedOrg,
    contextName: resolvedContextName,
    user,
    team: resolvedTeam,
    linkedProject: linkedProjectResult,
    linkedRepo: linkedRepoResult,
    isCrossTeamRepo,
    scopeMismatch,
    explicitScopeProvided,
  };
}

/**
 * Applies scope from a pre-resolved project link.
 * Sets client.config.currentTeam and warns if the linked project's org
 * differs from the user's current global scope (--scope, vc switch, config).
 *
 * Use this when the command already has a link from getLinkedProject()/ensureLink().
 * Unlike resolveScopeContext(), this makes no API calls.
 */
export function applyScopeFromLink(client: Client, link: { org: Org }): void {
  const globalTeamId = client.config.currentTeam;
  const localOrgId = link.org.id;

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
  // Check argv for --scope or --team flags
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

  // Check if localConfig has a scope field
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
