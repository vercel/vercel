/**
 * World-driven fake API. Serves catalog operations from `world.server` and
 * `conditions.faults` on top of the harness loopback server. Requests that
 * match no operation, or an operation unmodeled for the principal, fall
 * through to the harness 404 `scenario_unhandled` handler.
 */
import { startFakeApi, type FakeApi } from '../../harness/fake-api';
import { isJsonObject, type Json } from '../model/json';
import type {
  Conditions,
  FaultsCatalog,
  Operation,
  OperationLogEntry,
  OperationsCatalog,
  PrincipalKind,
  ServerState,
  Team,
  World,
} from '../model/schemas';

export interface WorldApiCatalog {
  operations: OperationsCatalog;
  faults: FaultsCatalog;
}

export interface OperationCall {
  entry: OperationLogEntry;
  auth: Operation['auth'];
  /** Raw Authorization header; never print it (it contains the token). */
  authorization: string | undefined;
}

export interface WorldApi {
  /** Live server state. Mutating operations update it in place. */
  server: ServerState;
  calls: OperationCall[];
}

type ResolvedPrincipal =
  | { kind: 'user' | 'app'; id: string }
  | { kind: 'none' | 'unknown' };

type Resolver = (
  server: ServerState,
  principal: { id: string },
  params: Record<string, string>
) => Json | undefined;

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function findTeam(server: ServerState, idOrSlug: string): Team | undefined {
  if (hasOwn(server.teams, idOrSlug)) return server.teams[idOrSlug];
  return Object.values(server.teams).find(team => team.slug === idOrSlug);
}

/** Implementations of every `world` response spec in the operation catalog. */
const resolvers: Record<string, Resolver> = {
  'user.get:user': (server, { id }) => ({ user: server.users[id] as Json }),
  'teams.list:user': (server, { id }) => ({
    teams: server.teamOrder
      .filter(teamId => server.memberships[id]?.[teamId] === 'direct')
      .map(teamId => server.teams[teamId] as Json),
  }),
  'team.get:user': (server, { id }, { idOrSlug }) => {
    const team = findTeam(server, idOrSlug);
    return team && server.memberships[id]?.[team.id]
      ? (team as Json)
      : undefined;
  },
  'team.get:app': (server, { id }, { idOrSlug }) => {
    const team = findTeam(server, idOrSlug);
    return team && team.id === server.apps[id]?.teamId
      ? (team as Json)
      : undefined;
  },
  'oauth.introspect:app': (server, { id }) => {
    const app = server.apps[id];
    const team = server.teams[app.teamId];
    return {
      active: true,
      client_id: app.clientId,
      client_name: app.clientName,
      team: { id: team.id, slug: team.slug },
    };
  },
};

function lookupToken(server: ServerState, token: string): ResolvedPrincipal {
  if (!hasOwn(server.tokens, token)) return { kind: 'unknown' };
  return server.tokens[token].principal;
}

function resolvePrincipal(
  operation: Operation,
  server: ServerState,
  authorization: string | undefined,
  body: unknown
): ResolvedPrincipal {
  if (operation.auth === 'none') return { kind: 'none' };
  if (operation.auth === 'form-token') {
    const token = isJsonObject(body) ? body.token : undefined;
    return typeof token === 'string' && token
      ? lookupToken(server, token)
      : { kind: 'none' };
  }
  if (authorization === undefined) return { kind: 'none' };
  const match = /^Bearer (.+)$/.exec(authorization);
  return match ? lookupToken(server, match[1]) : { kind: 'unknown' };
}

export function registerWorldApi(
  api: FakeApi,
  world: World,
  conditions: Conditions,
  catalog: WorldApiCatalog
): WorldApi {
  const state: WorldApi = {
    server: structuredClone(world.server),
    calls: [],
  };

  for (const [operationId, operation] of Object.entries(
    catalog.operations.operations
  )) {
    const register =
      operation.request.method === 'GET'
        ? api.router.get.bind(api.router)
        : api.router.post.bind(api.router);

    register(operation.request.path, (req, res, next) => {
      const params: Record<string, string> = {};
      for (const name of operation.params)
        params[name] = String(req.params[name]);
      const entry: OperationLogEntry = { operation: operationId };
      if (operation.params.length > 0) entry.params = params;
      if (operation.recordsTeamId) {
        entry.teamId =
          typeof req.query.teamId === 'string' ? req.query.teamId : null;
      }
      const authorization: string | undefined = req.get('authorization');
      const record = () =>
        state.calls.push({ entry, auth: operation.auth, authorization });
      const send = (status: number, body: Json) =>
        res.status(status).json(body);

      const faultId = conditions.faults[operationId];
      if (faultId !== undefined) {
        const fault = catalog.faults.faults[faultId];
        record();
        send(fault.status, fault.body);
        return;
      }

      const principal = resolvePrincipal(
        operation,
        state.server,
        authorization,
        req.body
      );
      const spec = operation.responses[principal.kind as PrincipalKind];
      if (!spec || spec.kind === 'unmodeled') {
        next?.();
        return;
      }
      record();
      if (spec.kind === 'literal') {
        send(spec.status, spec.body);
        return;
      }

      const resolver = resolvers[`${operationId}:${principal.kind}`];
      if (!resolver || !('id' in principal)) {
        throw new Error(
          `No world resolver for ${operationId}:${principal.kind}`
        );
      }
      const body = resolver(state.server, principal, params);
      if (body !== undefined) {
        send(spec.status, body);
      } else if (spec.otherwise) {
        send(spec.otherwise.status, spec.otherwise.body);
      } else {
        throw new Error(
          `${operationId}:${principal.kind} produced no response`
        );
      }
    });
  }

  return state;
}

/** Starts a standalone world API (used by the conformance vectors). */
export async function startWorldApi(
  world: World,
  conditions: Conditions,
  catalog: WorldApiCatalog
): Promise<{ api: FakeApi; worldApi: WorldApi }> {
  const api = await startFakeApi();
  return { api, worldApi: registerWorldApi(api, world, conditions, catalog) };
}
