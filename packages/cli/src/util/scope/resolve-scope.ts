import { relative } from 'path';
import type { Org, ProjectLink, Team, User } from '@vercel-internals/types';
import type Client from '../client';
import type { ScopeResolutionContext } from '../../gateways/context';
import type { RepoLinkInfo } from '../../gateways/project-link-store';
import { gatewayErrorCause } from '../../gateways/result';
import { InvalidToken, MissingUser, TeamDeleted } from '../errors-ts';
import { findProjectsFromPath, type RepoProjectsConfig } from '../link/repo';
import type { TokenIntrospectionResponse } from '../introspect-token';
import { type App, isAppPrincipalEnabled, resolveAppFromToken } from '../app';
import output from '../../output-manager';

/**
 * The per-invocation session state that scope resolution reads and mutates.
 * `Client` satisfies it. Mutating `config.currentTeam` is part of the
 * contract: `client.fetch` uses it to inject `teamId` into later requests.
 */
export type ScopeSession = Pick<
  Client,
  | 'config'
  | 'authConfig'
  | 'localConfig'
  | 'argv'
  | 'cwd'
  | 'env'
  | 'user'
  | 'userPromise'
  | 'teams'
  | 'teamsPromise'
  | 'telemetryEventStore'
  | 'updateAuthConfig'
>;

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

export interface BasicScopeContext {
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

export interface ResolveScopeOptions {
  getTeam?: boolean;
  resolveLocalScope?: boolean;
}

export interface ResolveScopeWithLocalScopeOptions extends ResolveScopeOptions {
  resolveLocalScope: true;
}

export interface ResolveScopeWithoutLocalScopeOptions
  extends ResolveScopeOptions {
  resolveLocalScope?: false;
}

/**
 * Loads the authenticated user, caching it on the session. Updates the
 * cached `userId` in the auth config and telemetry. A 403 clears the cache
 * and throws `InvalidToken`.
 */
export function loadCurrentUser(
  ctx: ScopeResolutionContext,
  session: ScopeSession
): Promise<User> {
  if (session.user) {
    return Promise.resolve(session.user);
  }

  if (session.userPromise) {
    return session.userPromise;
  }

  session.userPromise = fetchCurrentUser(ctx, session).finally(() => {
    session.userPromise = undefined;
  });

  return session.userPromise;
}

async function fetchCurrentUser(
  ctx: ScopeResolutionContext,
  session: ScopeSession
): Promise<User> {
  const result = await ctx.identity.getCurrentUser();

  if (!result.ok) {
    if (result.error.code === 'missing_user') {
      throw new MissingUser();
    }

    if (result.error.code === 'forbidden') {
      session.user = undefined;
      session.userPromise = undefined;
      if (session.authConfig.userId) {
        session.updateAuthConfig({ userId: undefined });
        persistCachedUserId(ctx, session);
      }

      throw new InvalidToken(session.authConfig.tokenSource);
    }

    throw gatewayErrorCause(result.error);
  }

  const user = result.value;

  if (session.authConfig.userId !== user.id) {
    session.updateAuthConfig({ userId: user.id });
    persistCachedUserId(ctx, session);
  }

  session.telemetryEventStore.updateUserId(user.id);
  session.user = user;

  return user;
}

function persistCachedUserId(
  ctx: ScopeResolutionContext,
  session: ScopeSession
): void {
  const result = ctx.cliConfig.persistAuthConfig({
    authConfig: session.authConfig,
  });
  if (!result.ok) {
    output.debug('Failed to persist cached userId to auth config.');
  }
}

/**
 * Introspects the session token. Resolves to `null` when there is no token
 * or introspection fails.
 */
export async function introspectSessionToken(
  ctx: ScopeResolutionContext,
  session: ScopeSession
): Promise<TokenIntrospectionResponse | null> {
  const token = session.authConfig.token;
  if (!token) {
    return null;
  }
  const result = await ctx.tokenIntrospection.introspect({ token });
  return result.ok ? result.value : null;
}

/**
 * Resolves the authenticated principal: the user for a personal token, or the
 * app (from token introspection) for an app token. User lookup and token
 * introspection run concurrently. An introspection failure is never fatal for
 * a valid user token, and a missing user is only tolerated for the app-token
 * case (403 from /v2/user); any other user lookup failure surfaces.
 */
export async function resolvePrincipal(
  ctx: ScopeResolutionContext,
  session: ScopeSession
): Promise<Principal> {
  if (!isAppPrincipalEnabled(session.env)) {
    return {
      user: await loadCurrentUser(ctx, session),
      app: null,
      token: null,
    };
  }

  const [userResult, tokenResult] = await Promise.allSettled([
    loadCurrentUser(ctx, session),
    introspectSessionToken(ctx, session),
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

/**
 * Resolves the effective scope (user, team, app) for the session, applying
 * app-token and northstar default teams to `config.currentTeam`. With
 * `resolveLocalScope`, local project links can override the team.
 */
export function resolveScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  opts: ResolveScopeWithLocalScopeOptions
): Promise<ScopeContext>;
export function resolveScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  opts?: ResolveScopeWithoutLocalScopeOptions
): Promise<BasicScopeContext>;
export function resolveScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  opts?: ResolveScopeOptions
): Promise<BasicScopeContext | ScopeContext>;
export async function resolveScope(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  opts: ResolveScopeOptions = {}
): Promise<BasicScopeContext | ScopeContext> {
  const { user, app, token } = await resolvePrincipal(ctx, session);

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
    session.config.currentTeam = appTeamId;
  }

  // A Northstar user has no usable personal scope, so their default team is the
  // effective scope. The default is only persisted to `currentTeam` at login
  // (see `updateCurrentTeamAfterLogin`), which means on any invocation where
  // `currentTeam` isn't set we would otherwise resolve the default team for
  // *display* but send requests with no `teamId` — silently scoping API calls
  // to the (resource-less) personal account while the UI claims the team. Apply
  // the default here so the effective request scope matches what we report.
  if (!session.config.currentTeam && defaultTeamId) {
    session.config.currentTeam = defaultTeamId;
  }

  const teamId = session.config.currentTeam || defaultTeamId;
  const team =
    teamId && opts.getTeam !== false ? await loadTeam(ctx, teamId) : null;

  const contextName = team?.slug || user?.username || user?.email;
  if (!contextName) {
    throw new Error(`Unable to determine context name`);
  }

  if (!opts.resolveLocalScope) {
    return { contextName, team, user, app };
  }

  return resolveLocalScopeContext(ctx, session, { user, app, team });
}

async function resolveLocalScopeContext(
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  { user, app, team }: { user: User | null; app: App | null; team: Team | null }
): Promise<ScopeContext> {
  const explicitScopeProvided = detectExplicitScope(session);
  const globalTeamId = session.config.currentTeam;

  const { localOrgId, linkedRepo, isCrossTeamRepo } = await findLocalLink(
    ctx,
    session.cwd
  );

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
      ? await applyLocalOrg(ctx, session, effectiveLocalOrgId)
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
  ctx: ScopeResolutionContext,
  session: ScopeSession,
  localOrgId: string
): Promise<Team | null> {
  session.config.currentTeam = localOrgId.startsWith('team_')
    ? localOrgId
    : undefined;

  if (!session.config.currentTeam) {
    return null;
  }

  const result = await ctx.identity.getTeam({
    idOrSlug: session.config.currentTeam,
  });
  if (result.type === 'error') {
    throw gatewayErrorCause(result.error);
  }
  return result.type === 'found' ? result.value : null;
}

async function loadTeam(
  ctx: ScopeResolutionContext,
  teamId: string
): Promise<Team> {
  const result = await ctx.identity.getTeam({ idOrSlug: teamId });

  if (result.type === 'error') {
    throw gatewayErrorCause(result.error);
  }

  if (result.type === 'missing') {
    throw new TeamDeleted();
  }

  return result.value;
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

async function findLocalLink(
  ctx: ScopeResolutionContext,
  cwd: string
): Promise<LocalLink> {
  const [projectLink, repoLink] = await Promise.all([
    findProjectLink(ctx, cwd),
    findRepoLink(ctx, cwd),
  ]);

  return {
    localOrgId: findLocalOrgId(cwd, projectLink, repoLink),
    linkedRepo: repoLink?.repoConfig
      ? { repoConfig: repoLink.repoConfig, rootPath: repoLink.rootPath }
      : null,
    isCrossTeamRepo: detectCrossTeamRepo(repoLink?.repoConfig),
  };
}

async function findProjectLink(
  ctx: ScopeResolutionContext,
  cwd: string
): Promise<ProjectLink | null> {
  const result = await ctx.projectLinks.readProjectLink({ dir: cwd });
  return result.type === 'found' ? result.value : null;
}

async function findRepoLink(
  ctx: ScopeResolutionContext,
  cwd: string
): Promise<RepoLinkInfo | null> {
  const result = await ctx.projectLinks.findRepoLink({ cwd });
  return result.type === 'found' ? result.value : null;
}

function findLocalOrgId(
  cwd: string,
  projectLink: ProjectLink | null,
  repoLink: RepoLinkInfo | null
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

/**
 * True when the invocation names a scope explicitly: `--scope`/`--team`
 * (or `-S`/`-T`) before any `--`, or `scope` in the local config.
 */
export function detectExplicitScope(
  session: Pick<Client, 'argv' | 'localConfig'>
): boolean {
  const argv = session.argv;
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

  if (session.localConfig?.scope) {
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

/**
 * True when `cwd` is already linked locally: a `.vercel/project.json` in this
 * directory, or a repo.json project whose root directory contains `cwd`.
 * Invalid link files are treated as not linked. Never prompts.
 */
export async function hasLocalProjectLink(
  ctx: Pick<ScopeResolutionContext, 'projectLinks'>,
  { cwd }: { cwd: string }
): Promise<boolean> {
  // Invalid or conflicting project.json — still check repo.json.
  const projectLink = await ctx.projectLinks.readProjectLink({ dir: cwd });
  if (projectLink.type === 'found') {
    return true;
  }

  const repoLink = await ctx.projectLinks.findRepoLink({ cwd });
  if (repoLink.type !== 'found' || !repoLink.value.repoConfig) {
    return false;
  }

  try {
    const projects = findProjectsFromPath(
      repoLink.value.repoConfig.projects,
      relative(repoLink.value.rootPath, cwd)
    );
    return projects.length > 0;
  } catch {
    return false;
  }
}
