import { relative } from 'path';
import type Client from './client';
import type { Org, Team, User } from '@vercel-internals/types';
import getUser from './get-user';
import getTeamById from './teams/get-team-by-id';
import { InvalidToken, TeamDeleted } from './errors-ts';
import { getLinkFromDir, getVercelDirectory } from './projects/link';
import { getRepoLink, findProjectsFromPath } from './link/repo';
import type { RepoProjectsConfig } from './link/repo';
import output from '../output-manager';
import { introspectToken } from './introspect-token';
import type { TokenIntrospectionResponse } from './introspect-token';
import { type App, isAppPrincipalEnabled, resolveAppFromToken } from './app';

export interface ScopeContext {
  org: Org;
  contextName: string;
  user: User | null;
  team: Team | null;
  app: App | null;
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
  app: App | null;
}

interface Principal {
  user: User | null;
  app: App | null;
  token: TokenIntrospectionResponse | null;
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
  const { user, app, token } = await getPrincipal(client);

  const defaultTeamId =
    user?.version === 'northstar' ? user.defaultTeamId : undefined;
  const appTeamId = !user && app ? token?.team?.id : undefined;

  if (!user && app && opts.getTeam === false) {
    throw new Error(`App principal scope resolution requires a team lookup.`);
  }

  // App tokens are bound to their introspected team. Make that team the
  // effective request scope so subsequent API calls include the correct
  // `teamId`, and so a stale team from the user's global config cannot win.
  if (!user && app) {
    client.config.currentTeam = appTeamId;
  }

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

  const teamId = client.config.currentTeam || defaultTeamId;
  const team =
    teamId && opts.getTeam !== false ? await getTeam(client, teamId) : null;

  const contextName = team?.slug || user?.username || user?.email;
  if (!contextName) {
    throw new Error(`Unable to determine context name`);
  }

  if (!opts.resolveLocalScope) {
    return { contextName, team, user, app };
  }

  return resolveLocalScopeContext(client, { user, app, team });
}

/**
 * Resolves the authenticated principal: the user for a personal token, or the
 * app (from token introspection) for an app token. User lookup and token
 * introspection run concurrently. An introspection failure is never fatal for
 * a valid user token, and a missing user is only tolerated for the app-token
 * case (403 from /v2/user); any other `getUser` failure surfaces.
 */
async function getPrincipal(client: Client): Promise<Principal> {
  if (!isAppPrincipalEnabled()) {
    return { user: await getUser(client), app: null, token: null };
  }

  const [userResult, tokenResult] = await Promise.allSettled([
    getUser(client),
    introspectToken(client),
  ]);

  const token = tokenResult.status === 'fulfilled' ? tokenResult.value : null;
  const app = token ? resolveAppFromToken(token) : null;

  if (userResult.status === 'rejected') {
    const isAppToken = app && userResult.reason instanceof InvalidToken;

    if (!isAppToken) {
      throw userResult.reason;
    }
  }

  const user = userResult.status === 'fulfilled' ? userResult.value : null;

  return { user, app, token };
}

async function resolveLocalScopeContext(
  client: Client,
  { user, app, team }: { user: User | null; app: App | null; team: Team | null }
): Promise<ScopeContext> {
  const explicitScopeProvided = detectExplicitScope(client);
  const globalTeamId = client.config.currentTeam;

  const { localOrgId, linkedRepo, isCrossTeamRepo } =
    await findLocalLink(client);

  // An app principal is authorized for the team bound to its token. Local
  // project metadata must not move requests into a different team.
  const isAppPrincipal = !user && Boolean(app);
  const effectiveLocalOrgId = isAppPrincipal ? undefined : localOrgId;

  const scopeMismatch = Boolean(
    effectiveLocalOrgId && globalTeamId && globalTeamId !== effectiveLocalOrgId
  );

  if (
    !isAppPrincipal &&
    !explicitScopeProvided &&
    !effectiveLocalOrgId &&
    isCrossTeamRepo
  ) {
    output.warn(
      `This repository has projects across multiple teams. ` +
        `Use \`--scope\` to specify which team, or \`cd\` into a project directory.`
    );
  }

  const resolvedTeam =
    !explicitScopeProvided && effectiveLocalOrgId
      ? await applyLocalOrg(client, effectiveLocalOrgId)
      : team;

  const { org, contextName } = resolveOrg(resolvedTeam, user);

  return {
    org,
    contextName,
    user,
    team: resolvedTeam,
    app,
    globalTeam: team,
    linkedRepo,
    isCrossTeamRepo,
    scopeMismatch,
    explicitScopeProvided,
  };
}

/**
 * Applies a locally-linked org as the effective scope and returns its team,
 * or null when the local org is a personal account.
 */
async function applyLocalOrg(
  client: Client,
  localOrgId: string
): Promise<Team | null> {
  client.config.currentTeam = localOrgId.startsWith('team_')
    ? localOrgId
    : undefined;

  return client.config.currentTeam
    ? await getTeamById(client, client.config.currentTeam)
    : null;
}

async function getTeam(client: Client, teamId: string): Promise<Team> {
  const team = await getTeamById(client, teamId);

  if (!team) {
    throw new TeamDeleted();
  }

  return team;
}

function resolveOrg(
  team: Team | null,
  user: User | null
): { org: Org; contextName: string } {
  if (team) {
    return {
      org: { type: 'team', id: team.id, slug: team.slug },
      contextName: team.slug,
    };
  }

  if (user) {
    return {
      org: { type: 'user', id: user.id, slug: user.username },
      contextName: user.username || user.email,
    };
  }

  throw new Error(
    `Unable to determine scope: no team or personal account is available for this token. ` +
      `Use \`--scope\` to specify a team.`
  );
}

interface LocalLink {
  localOrgId: string | undefined;
  linkedRepo: ScopeContext['linkedRepo'];
  isCrossTeamRepo: boolean;
}

type ProjectLink = { orgId: string; projectId: string };
type RepoLink = Awaited<ReturnType<typeof getRepoLink>>;

async function findLocalLink(client: Client): Promise<LocalLink> {
  const [projectLink, repoLink] = await Promise.all([
    findProjectLink(client),
    findRepoLink(client),
  ]);

  return {
    localOrgId: findLocalOrgId(client.cwd, projectLink, repoLink),
    linkedRepo: repoLink?.repoConfig
      ? { repoConfig: repoLink.repoConfig, rootPath: repoLink.rootPath }
      : null,
    isCrossTeamRepo: detectCrossTeamRepo(repoLink?.repoConfig),
  };
}

async function findProjectLink(client: Client): Promise<ProjectLink | null> {
  try {
    return await getLinkFromDir<ProjectLink>(getVercelDirectory(client.cwd));
  } catch (_error) {
    return null;
  }
}

async function findRepoLink(client: Client): Promise<RepoLink | null> {
  try {
    return await getRepoLink(client, client.cwd);
  } catch (_error) {
    return null;
  }
}

function findLocalOrgId(
  cwd: string,
  projectLink: ProjectLink | null,
  repoLink: RepoLink | null
): string | undefined {
  if (projectLink) {
    return projectLink.orgId;
  }

  if (repoLink?.repoConfig) {
    return findRepoOrgId(repoLink.repoConfig, relative(repoLink.rootPath, cwd));
  }

  return undefined;
}

function findRepoOrgId(
  repoConfig: RepoProjectsConfig,
  pathFromRepoRoot: string
): string | undefined {
  const projects = findProjectsFromPath(repoConfig.projects, pathFromRepoRoot);
  const orgIds = new Set(projects.map(p => p.orgId ?? repoConfig.orgId ?? ''));

  if (orgIds.size !== 1) {
    return undefined;
  }

  const [orgId] = orgIds;
  return orgId || undefined;
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
    if (arg === '--') {
      break;
    }
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
