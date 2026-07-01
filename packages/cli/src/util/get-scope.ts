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
import { introspectToken } from './introspect-token';

export const APP_PRINCIPAL_SCOPE_ENV = 'VERCEL_CLI_WHOAMI_INTROSPECTION';

/**
 * The Vercel App that authenticated the request. Present on the scope when the
 * token is an app-principal token rather than a user token, in which case
 * `user` is `null`.
 *
 * Consumers should remain principal-agnostic where possible and only branch on
 * this at the presentation layer (e.g. `whoami`).
 */
export interface ScopeApp {
  id: string;
  name?: string;
}

/**
 * Internal result of token introspection for an app principal: the app itself
 * plus the team the token is bound to (as reported by introspection, which only
 * includes `slug`/`name` when the token may read the team). Used to seed team
 * resolution and to fall back when the team can't be fully fetched.
 */
interface AppPrincipal {
  app: ScopeApp;
  team: { id: string; slug?: string; name?: string } | null;
}

export interface ScopeContext {
  org: Org;
  contextName: string;
  user: User | null;
  app?: ScopeApp;
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
  app?: ScopeApp;
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
  const allowAppPrincipal = isAppPrincipalScopeEnabled();
  let userError: unknown;
  const [user, appPrincipal] = await Promise.all([
    getUser(client).catch(error => {
      if (!allowAppPrincipal) {
        throw error;
      }
      userError = error;
      return null;
    }),
    allowAppPrincipal ? getAppPrincipal(client) : null,
  ]);

  if (!user && !appPrincipal) {
    throw userError;
  }

  const app = appPrincipal?.app;

  // An app-principal token is authenticated to a specific team server-side, so
  // seed the current team from the token when one isn't already selected. This
  // lets the app principal flow through the same team + local-scope resolution
  // as a user, rather than short-circuiting to a hand-built context.
  if (app && appPrincipal.team && !client.config.currentTeam) {
    client.config.currentTeam = appPrincipal.team.id;
  }

  let contextName: string = user
    ? user.username || user.email
    : (app?.name ?? app?.id ?? '');
  let team: Team | null = null;
  const defaultTeamId =
    user?.version === 'northstar' ? user.defaultTeamId : undefined;
  const currentTeamOrDefaultTeamId = client.config.currentTeam || defaultTeamId;

  // A Northstar user has no usable personal scope, so their default team is the
  // effective scope. The default is only persisted to `currentTeam` at login
  // (see `updateCurrentTeamAfterLogin`), which means on any invocation where
  // `currentTeam` isn't set we would otherwise resolve the default team for
  // *display* but send requests with no `teamId` — silently scoping API calls
  // to the (resource-less) personal account while the UI claims the team. Apply
  // the default here so the effective request scope matches what we report.
  if (!client.config.currentTeam && defaultTeamId) {
    client.config.currentTeam = defaultTeamId;
  }

  if (currentTeamOrDefaultTeamId && opts.getTeam !== false) {
    team = await resolveTeam(client, currentTeamOrDefaultTeamId, appPrincipal);

    if (!team) {
      throw new TeamDeleted();
    }

    contextName = team.slug;
  }

  if (!opts.resolveLocalScope) {
    return { contextName, team, user, app };
  }

  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;
  const globalTeam = team;

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
      : nonTeamOrg(user, app);
  } else if (localOrgId) {
    client.config.currentTeam = localOrgId.startsWith('team_')
      ? localOrgId
      : undefined;

    const correctedTeam = client.config.currentTeam
      ? await getTeamById(client, client.config.currentTeam)
      : null;
    // Only user tokens can be re-resolved to a personal scope; an app principal
    // has no personal account, so fall back to the app identity.
    const correctedUser = user ? await getUser(client) : null;
    resolvedOrg = correctedTeam
      ? { type: 'team', id: correctedTeam.id, slug: correctedTeam.slug }
      : nonTeamOrg(correctedUser, app);
    resolvedContextName = correctedTeam
      ? correctedTeam.slug
      : correctedUser
        ? correctedUser.username || correctedUser.email
        : (app?.name ?? app?.id ?? resolvedContextName);
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
      : nonTeamOrg(user, app);
  }

  return {
    org: resolvedOrg,
    contextName: resolvedContextName,
    user,
    app,
    team: resolvedTeam,
    globalTeam,
    linkedRepo: linkedRepoResult,
    isCrossTeamRepo,
    scopeMismatch,
    explicitScopeProvided,
  } satisfies ScopeContext;
}

async function getAppPrincipal(client: Client): Promise<AppPrincipal | null> {
  const token = client.authConfig.token;
  if (!token) {
    return null;
  }

  const introspection = await introspectToken(client, token);
  // App principals are identified by a `sub` carrying the app's client id,
  // which is prefixed with `cl_`. There is no separate discriminator field.
  if (
    !introspection.active ||
    !introspection.client_id ||
    !introspection.sub?.startsWith('cl_')
  ) {
    return null;
  }

  return {
    app: { id: introspection.client_id, name: introspection.client_name },
    team: introspection.team ?? null,
  };
}

/**
 * Resolve a team by id using the same mechanics as the user path. For an app
 * principal that lacks read access to the team, `getTeamById` (a `/teams/:id`
 * fetch) will fail; fall back to the partial team the introspection endpoint
 * returned so we still surface the team `id`.
 */
async function resolveTeam(
  client: Client,
  teamId: string,
  appPrincipal: AppPrincipal | null
): Promise<Team | null> {
  try {
    return await getTeamById(client, teamId);
  } catch (error) {
    const fallback = appPrincipal?.team;
    if (fallback && fallback.id === teamId) {
      return { id: fallback.id, slug: fallback.slug ?? fallback.id } as Team;
    }
    throw error;
  }
}

/**
 * The org to use when there is no team scope: a user's personal account, or —
 * for an app principal, which has no personal account — the app itself.
 */
function nonTeamOrg(user: User | null, app: ScopeApp | undefined): Org {
  if (user) {
    return { type: 'user', id: user.id, slug: user.username };
  }
  if (app) {
    return { type: 'user', id: app.id, slug: app.name ?? app.id };
  }
  throw new Error('Cannot resolve scope without a user or app principal');
}

function isAppPrincipalScopeEnabled(): boolean {
  const value = process.env[APP_PRINCIPAL_SCOPE_ENV];
  return value === '1' || value?.toLowerCase() === 'true';
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
