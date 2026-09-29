import { FORMAT_VERSION, type OperationsCatalog } from '../model/schemas';

const missingToken = {
  kind: 'literal',
  status: 403,
  body: {
    error: {
      code: 'forbidden',
      message: 'The request is missing an authentication token',
      missingToken: true,
    },
  },
} as const;

const invalidToken = {
  kind: 'literal',
  status: 403,
  body: {
    error: { code: 'forbidden', message: 'Not authorized', invalidToken: true },
  },
} as const;

const teamNotFound = {
  when: 'the team does not exist or is not visible to the principal',
  status: 404,
  body: { error: { code: 'not_found', message: 'Team not found' } },
};

const inactiveToken = {
  kind: 'literal',
  status: 200,
  body: { active: false },
} as const;

/**
 * Operations served by the world-driven fake API. A response spec of kind
 * `world` is computed from `world.server` as described by `semantics`; the
 * literal bodies are normative and consumed by every runner's fake API.
 */
export const operationsCatalog: OperationsCatalog = {
  formatVersion: FORMAT_VERSION,
  operations: {
    'user.get': {
      summary: 'Read the authenticated user.',
      request: { method: 'GET', path: '/v2/user' },
      auth: 'bearer',
      identity: true,
      recordsTeamId: false,
      params: [],
      requires: [],
      responses: {
        user: {
          kind: 'world',
          status: 200,
          semantics: '{"user": world.server.users[principal.id]}',
        },
        app: {
          kind: 'literal',
          status: 403,
          body: { error: { code: 'forbidden', message: 'Not authorized' } },
        },
        none: missingToken,
        unknown: invalidToken,
      },
    },
    'teams.list': {
      summary: "List the user's direct team memberships.",
      request: { method: 'GET', path: '/v1/teams' },
      auth: 'bearer',
      identity: true,
      recordsTeamId: false,
      params: [],
      requires: [],
      responses: {
        user: {
          kind: 'world',
          status: 200,
          semantics:
            '{"teams": [world.server.teams[id] for id in world.server.teamOrder if memberships[principal.id][id] == "direct"]}. Order is significant: the CLI picks the first match.',
        },
        app: { kind: 'unmodeled' },
        none: missingToken,
        unknown: invalidToken,
      },
    },
    'team.get': {
      summary: 'Read one team by id or slug.',
      request: { method: 'GET', path: '/teams/:idOrSlug' },
      auth: 'bearer',
      identity: true,
      recordsTeamId: true,
      params: ['idOrSlug'],
      requires: [],
      responses: {
        user: {
          kind: 'world',
          status: 200,
          semantics:
            'The team whose id or slug equals idOrSlug, when the user has a "direct" or "virtual" membership.',
          otherwise: teamNotFound,
        },
        app: {
          kind: 'world',
          status: 200,
          semantics:
            "The team whose id or slug equals idOrSlug, when it is the app's bound team (apps[principal.id].teamId).",
          otherwise: teamNotFound,
        },
        none: missingToken,
        unknown: invalidToken,
      },
    },
    'oauth.discovery': {
      summary: 'OAuth authorization server metadata.',
      request: { method: 'GET', path: '/.well-known/openid-configuration' },
      auth: 'none',
      identity: false,
      recordsTeamId: false,
      params: [],
      requires: ['oauth-test-issuer'],
      responses: {
        none: {
          kind: 'literal',
          status: 200,
          body: {
            issuer: '{{origin}}/',
            device_authorization_endpoint: '{{origin}}/oauth/device',
            token_endpoint: '{{origin}}/oauth/token',
            revocation_endpoint: '{{origin}}/oauth/revoke',
            jwks_uri: '{{origin}}/oauth/jwks',
            introspection_endpoint: '{{origin}}/oauth/introspect',
          },
        },
      },
    },
    'oauth.introspect': {
      summary: 'RFC 7662 token introspection (form body `token`).',
      request: { method: 'POST', path: '/oauth/introspect' },
      auth: 'form-token',
      identity: false,
      recordsTeamId: false,
      params: [],
      requires: ['oauth-test-issuer'],
      responses: {
        user: inactiveToken,
        app: {
          kind: 'world',
          status: 200,
          semantics:
            '{"active": true, "client_id": app.clientId, "client_name": app.clientName, "team": {"id": team.id, "slug": team.slug}} where app = apps[principal.id] and team = teams[app.teamId].',
        },
        none: inactiveToken,
        unknown: inactiveToken,
      },
    },
  },
};
