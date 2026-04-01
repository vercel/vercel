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
  org: Org;
  contextName: string;
  user: User;
  team: Team | null;
  linkedRepo: {
    repoConfig: RepoProjectsConfig;
    rootPath: string;
  } | null;
  isCrossTeamRepo: boolean;
  scopeMismatch: boolean;
  explicitScopeProvided: boolean;
}

interface BasicScopeContext {
  contextName: string;
  user: User;
  team: Team | null;
}

interface GetScopeOptions {
  getTeam?: boolean;
  resolveLocalScope?: boolean;
}

interface GetScopeWithLocalScopeOptions extends GetScopeOptions {
  resolveLocalScope: true;
}

interface GetScopeWithoutLocalScopeOptions extends GetScopeOptions {
  resolveLocalScope?: false;
}

export default function getScope(
  client: Client,
  opts: GetScopeWithLocalScopeOptions
): Promise<ScopeContext>;
export default function getScope(
  client: Client,
  opts?: GetScopeWithoutLocalScopeOptions
): Promise<BasicScopeContext>;
export default async function getScope(
  client: Client,
  opts: GetScopeOptions = {}
): Promise<BasicScopeContext | ScopeContext> {
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

  if (!opts.resolveLocalScope) {
    return { contextName, team, user };
  }

  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;

  const cwd = client.cwd;
  let projectLink: { orgId: string; projectId: string } | null = null;
  try {
    projectLink = await getLinkFromDir<{
      orgId: string;
      projectId: string;
    }>(getVercelDirectory(cwd));
  } catch (_error) {
    projectLink = null;
  }

  let repoLink: Awaited<ReturnType<typeof getRepoLink>> | null = null;
  try {
    repoLink = await getRepoLink(client, cwd);
  } catch (_error) {
    repoLink = null;
  }

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

  const isCrossTeamRepo = detectCrossTeamRepo(repoLink?.repoConfig);

  const scopeMismatch = Boolean(
    localOrgId && globalTeamId && globalTeamId !== localOrgId
  );

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
    resolvedOrg = team
      ? { type: 'team', id: team.id, slug: team.slug }
      : { type: 'user', id: user.id, slug: user.username };
  } else if (localOrgId) {
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
