/**
 * Pure, mechanical authoring helpers. They compose worlds and spell out
 * operation-log entries; they never decide which team, error, or operation a
 * scenario produces. Every expected answer is written literally in the case.
 */
import type {
  App,
  AuthoredWorld,
  JsonObject,
  LocalState,
  MatchMode,
  MembershipKind,
  OperationLogEntry,
  OperationsExpectation,
  Team,
  User,
} from '../model/schemas';

export const defaultSettings = { credStorage: 'file' };
export const defaultRepoLink = { remoteName: 'origin', projects: [] };

/** The local state every sandbox starts from unless a case overrides it. */
export function defaultLocal(): LocalState {
  return {
    credentials: null,
    settings: { ...defaultSettings },
    projectLink: null,
    repoLink: structuredClone(defaultRepoLink),
  };
}

/** A world with one user whose token authenticates as that user. */
export function baseUserWorld(user: User, token: string): AuthoredWorld {
  return {
    server: {
      users: { [user.id]: { ...user } },
      teams: {},
      memberships: { [user.id]: {} },
      apps: {},
      tokens: { [token]: { principal: { kind: 'user', id: user.id } } },
    },
    local: defaultLocal(),
  };
}

/** A world whose token authenticates as an app bound to `team`. */
export function baseAppWorld(
  appId: string,
  app: App,
  team: Team,
  token: string
): AuthoredWorld {
  return {
    server: {
      users: {},
      teams: { [team.id]: { ...team } },
      memberships: {},
      apps: { [appId]: { ...app } },
      tokens: { [token]: { principal: { kind: 'app', id: appId } } },
    },
    local: defaultLocal(),
  };
}

export function member(
  user: User,
  kind: MembershipKind = 'direct'
): { userId: string; kind: MembershipKind } {
  return { userId: user.id, kind };
}

/** Appends a team (and optionally a membership); insertion order = list order. */
export function withTeam(
  world: AuthoredWorld,
  team: Team,
  membership?: { userId: string; kind: MembershipKind }
): AuthoredWorld {
  const next = structuredClone(world);
  next.server.teams[team.id] = { ...team };
  if (membership) {
    next.server.memberships[membership.userId] = {
      ...next.server.memberships[membership.userId],
      [team.id]: membership.kind,
    };
  }
  return next;
}

export function withLocal(
  world: AuthoredWorld,
  local: Partial<LocalState>
): AuthoredWorld {
  const next = structuredClone(world);
  next.local = { ...next.local, ...structuredClone(local) };
  return next;
}

export function withStoredCredentials(
  world: AuthoredWorld,
  token: string
): AuthoredWorld {
  return withLocal(world, { credentials: { token } });
}

/** The `{id, slug, name}` projection whoami prints for a team. */
export function teamSummary(team: {
  id: string;
  slug: string;
  name: string | null;
}): JsonObject {
  return { id: team.id, slug: team.slug, name: team.name };
}

/** An empty merge patch: the world is expected to be unchanged. */
export function unchanged(): JsonObject {
  return {};
}

function expectation(
  mode: MatchMode,
  log: OperationLogEntry[]
): OperationsExpectation {
  return { mode, log };
}

export const ops = {
  exact: (...log: OperationLogEntry[]) => expectation('exact', log),
  unordered: (...log: OperationLogEntry[]) => expectation('unordered', log),
  subsequence: (...log: OperationLogEntry[]) => expectation('subsequence', log),
};

export const op = {
  userGet: (): OperationLogEntry => ({ operation: 'user.get' }),
  teamsList: (): OperationLogEntry => ({ operation: 'teams.list' }),
  teamGet: (idOrSlug: string, teamId: string | null): OperationLogEntry => ({
    operation: 'team.get',
    params: { idOrSlug },
    teamId,
  }),
  oauthDiscovery: (): OperationLogEntry => ({ operation: 'oauth.discovery' }),
  oauthIntrospect: (): OperationLogEntry => ({ operation: 'oauth.introspect' }),
};
