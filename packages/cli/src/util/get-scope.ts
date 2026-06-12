import { relative } from 'path';
import type Client from './client';
import type { Org, Team, User } from '@vercel-internals/types';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import {
  AppTokenPersonalScopeNotSupported,
  AppTokenTeamRequired,
  TeamDeleted,
} from './errors-ts';
import { isVercelAppToken } from './is-vercel-app-token';
import { getLinkFromDir, getVercelDirectory } from './projects/link';
import { getRepoLink, findProjectsFromPath } from './link/repo';
import type { RepoProjectsConfig } from './link/repo';
import output from '../output-manager';

export interface ScopeContext {
  org: Org;
  contextName: string;
  /**
   * `null` when authenticating as a Vercel App (app-principal token) — there
   * is no user identity attached to the token.
   */
  user: User | null;
  team: Team | null;
  /**
   * The team that's globally selected (via `vc switch` or as the northstar
   * default), before any local project-link overrides are applied. This will
   * differ from `team` when a linked project forces a different scope.
   */
  globalTeam: Team | null;
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
  user: User | null;
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
  const appPrincipal = isVercelAppToken(client.authConfig.token);

  let user: User | null = null;
  let contextName = '';
  let team: Team | null = null;

  if (appPrincipal) {
    // App tokens carry no user identity and no default team. The team must
    // come from `--scope <team-id>` (already applied to `currentTeam`) or
    // from the linked project.
    let teamId = client.config.currentTeam;

    if (!teamId && !opts.resolveLocalScope) {
      const { localOrgId } = await resolveLocalLink(client);

      if (localOrgId) {
        if (!localOrgId.startsWith('team_')) {
          throw new AppTokenPersonalScopeNotSupported();
        }
        teamId = localOrgId;
        client.config.currentTeam = teamId;
      } else {
        throw new AppTokenTeamRequired();
      }
    }

    if (teamId) {
      if (opts.getTeam === false) {
        contextName = teamId;
      } else {
        team = await getTeamById(client, teamId);

        if (!team) {
          throw new TeamDeleted();
        }

        contextName = team.slug;
      }
    }
  } else {
    user = await getUser(client);
    contextName = user.username || user.email;
    const defaultTeamId =
      user.version === 'northstar' ? user.defaultTeamId : undefined;
    const currentTeamOrDefaultTeamId =
      client.config.currentTeam || defaultTeamId;

    if (currentTeamOrDefaultTeamId && opts.getTeam !== false) {
      team = await getTeamById(client, currentTeamOrDefaultTeamId);

      if (!team) {
        throw new TeamDeleted();
      }

      contextName = team.slug;
    }
  }

  if (!opts.resolveLocalScope) {
    return { contextName, team, user };
  }

  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;
  const globalTeam = team;

  const { localOrgId, repoLink } = await resolveLocalLink(client);

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

  const userOrg = (): Org => {
    if (!user) {
      throw new AppTokenTeamRequired();
    }
    return { type: 'user', id: user.id, slug: user.username };
  };

  if (explicitScopeProvided) {
    resolvedOrg = team
      ? { type: 'team', id: team.id, slug: team.slug }
      : userOrg();
  } else if (localOrgId) {
    client.config.currentTeam = localOrgId.startsWith('team_')
      ? localOrgId
      : undefined;

    const correctedTeam = client.config.currentTeam
      ? await getTeamById(client, client.config.currentTeam)
      : null;
    if (correctedTeam) {
      resolvedOrg = {
        type: 'team',
        id: correctedTeam.id,
        slug: correctedTeam.slug,
      };
      resolvedContextName = correctedTeam.slug;
    } else {
      if (appPrincipal) {
        throw new AppTokenPersonalScopeNotSupported();
      }
      const correctedUser = await getUser(client);
      resolvedOrg = {
        type: 'user',
        id: correctedUser.id,
        slug: correctedUser.username,
      };
      resolvedContextName = correctedUser.username || correctedUser.email;
    }
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
      : userOrg();
  }

  return {
    org: resolvedOrg,
    contextName: resolvedContextName,
    user,
    team: resolvedTeam,
    globalTeam,
    linkedRepo: linkedRepoResult,
    isCrossTeamRepo,
    scopeMismatch,
    explicitScopeProvided,
  } satisfies ScopeContext;
}

async function resolveLocalLink(client: Client): Promise<{
  localOrgId: string | undefined;
  repoLink: Awaited<ReturnType<typeof getRepoLink>> | null;
}> {
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

  return { localOrgId, repoLink };
}

export function applyScopeFromLink(client: Client, link: { org: Org }): void {
  const localOrgId = link.org.id;
  const globalTeamId = client.config.currentTeam;

  if (
    !localOrgId.startsWith('team_') &&
    isVercelAppToken(client.authConfig.token)
  ) {
    throw new AppTokenPersonalScopeNotSupported();
  }

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

export function detectExplicitScope(client: Client): boolean {
  const argv = client.argv;
  for (const arg of argv) {
    if (
      arg === '--scope' ||
      arg === '--team' ||
      arg.startsWith('--scope=') ||
      arg.startsWith('--team=') ||
      arg === '-S' ||
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
