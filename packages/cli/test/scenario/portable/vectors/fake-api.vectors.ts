/**
 * Fake API conformance vectors. Every runner's world-driven fake API must
 * produce these handwritten responses and operation-log entries.
 */
import type { AuthoredVector, AuthoredWorld } from '../model/schemas';
import {
  globalTeam,
  localTeam,
  northstarDefaultTeam,
  scenarioApp,
  scenarioAppId,
  scenarioToken,
  scenarioUser,
  virtualTeam,
} from '../authoring/fixtures';
import { baseUserWorld, member, withTeam } from '../authoring/helpers';

const appToken = 'app_token';
const userAuth = { authorization: `Bearer ${scenarioToken}` };
const appAuth = { authorization: `Bearer ${appToken}` };
const unknownAuth = { authorization: 'Bearer not_a_known_token' };

/**
 * Direct memberships in `team_local` then `team_global` (not alphabetical, so
 * list order is observable), a virtual membership, and a non-member team.
 */
function vectorWorld(): AuthoredWorld {
  let world = baseUserWorld(scenarioUser, scenarioToken);
  world = withTeam(world, localTeam, member(scenarioUser));
  world = withTeam(world, globalTeam, member(scenarioUser));
  world = withTeam(world, virtualTeam, member(scenarioUser, 'virtual'));
  world = withTeam(world, northstarDefaultTeam);
  world.server.apps[scenarioAppId] = { ...scenarioApp };
  world.server.tokens[appToken] = {
    principal: { kind: 'app', id: scenarioAppId },
  };
  return world;
}

const world = vectorWorld();

const missingToken = {
  error: {
    code: 'forbidden',
    message: 'The request is missing an authentication token',
    missingToken: true,
  },
};
const invalidToken = {
  error: { code: 'forbidden', message: 'Not authorized', invalidToken: true },
};
const teamNotFound = {
  error: { code: 'not_found', message: 'Team not found' },
};

export const fakeApiVectors: AuthoredVector[] = [
  {
    id: 'fake-api/user-get-user',
    summary: 'user.get returns the token user verbatim.',
    world,
    request: { method: 'GET', path: '/v2/user', headers: userAuth },
    expect: {
      status: 200,
      json: { user: scenarioUser },
      operation: { operation: 'user.get' },
    },
  },
  {
    id: 'fake-api/user-get-app',
    summary: 'user.get rejects an app token without marking it invalid.',
    world,
    request: { method: 'GET', path: '/v2/user', headers: appAuth },
    expect: {
      status: 403,
      json: { error: { code: 'forbidden', message: 'Not authorized' } },
      operation: { operation: 'user.get' },
    },
  },
  {
    id: 'fake-api/user-get-none',
    summary: 'user.get without Authorization reports a missing token.',
    world,
    request: { method: 'GET', path: '/v2/user' },
    expect: {
      status: 403,
      json: missingToken,
      operation: { operation: 'user.get' },
    },
  },
  {
    id: 'fake-api/user-get-unknown-token',
    summary: 'user.get with an unknown token reports an invalid token.',
    world,
    request: { method: 'GET', path: '/v2/user', headers: unknownAuth },
    expect: {
      status: 403,
      json: invalidToken,
      operation: { operation: 'user.get' },
    },
  },
  {
    id: 'fake-api/teams-list-user',
    summary:
      'teams.list returns direct memberships only, in teamOrder (not id order).',
    world,
    request: { method: 'GET', path: '/v1/teams', headers: userAuth },
    expect: {
      status: 200,
      json: { teams: [localTeam, globalTeam] },
      operation: { operation: 'teams.list' },
    },
  },
  {
    id: 'fake-api/teams-list-app-unmodeled',
    summary: 'teams.list is unmodeled for app tokens.',
    world,
    request: { method: 'GET', path: '/v1/teams', headers: appAuth },
    expect: {
      status: 404,
      json: {
        error: {
          code: 'scenario_unhandled',
          message: 'Scenario API did not handle GET /v1/teams',
        },
      },
      operation: null,
    },
  },
  {
    id: 'fake-api/teams-list-none',
    summary: 'teams.list without Authorization reports a missing token.',
    world,
    request: { method: 'GET', path: '/v1/teams' },
    expect: {
      status: 403,
      json: missingToken,
      operation: { operation: 'teams.list' },
    },
  },
  {
    id: 'fake-api/teams-list-unknown-token',
    summary: 'teams.list with an unknown token reports an invalid token.',
    world,
    request: { method: 'GET', path: '/v1/teams', headers: unknownAuth },
    expect: {
      status: 403,
      json: invalidToken,
      operation: { operation: 'teams.list' },
    },
  },
  {
    id: 'fake-api/teams-list-fault-rate-limited',
    summary: 'The rate_limited fault replaces the teams.list response.',
    world,
    conditions: { faults: { 'teams.list': 'rate_limited' } },
    request: { method: 'GET', path: '/v1/teams', headers: userAuth },
    expect: {
      status: 400,
      json: { error: { code: 'rate_limited', message: 'Rate limit exceeded' } },
      operation: { operation: 'teams.list' },
    },
  },
  {
    id: 'fake-api/teams-list-fault-client-error',
    summary: 'The client_error fault replaces the teams.list response.',
    world,
    conditions: { faults: { 'teams.list': 'client_error' } },
    request: { method: 'GET', path: '/v1/teams', headers: userAuth },
    expect: {
      status: 400,
      json: {
        error: { code: 'bad_request', message: 'Teams are unavailable' },
      },
      operation: { operation: 'teams.list' },
    },
  },
  {
    id: 'fake-api/team-get-direct-by-id',
    summary: 'team.get by id for a direct member records the teamId query.',
    world,
    request: {
      method: 'GET',
      path: '/teams/team_global',
      query: { teamId: 'team_global' },
      headers: userAuth,
    },
    expect: {
      status: 200,
      json: globalTeam,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'team_global' },
        teamId: 'team_global',
      },
    },
  },
  {
    id: 'fake-api/team-get-direct-by-slug',
    summary: 'team.get by slug without a teamId query records null.',
    world,
    request: { method: 'GET', path: '/teams/global-team', headers: userAuth },
    expect: {
      status: 200,
      json: globalTeam,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'global-team' },
        teamId: null,
      },
    },
  },
  {
    id: 'fake-api/team-get-virtual-by-slug',
    summary: 'team.get resolves a virtual membership.',
    world,
    request: { method: 'GET', path: '/teams/virtual-team', headers: userAuth },
    expect: {
      status: 200,
      json: virtualTeam,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'virtual-team' },
        teamId: null,
      },
    },
  },
  {
    id: 'fake-api/team-get-non-member',
    summary: 'team.get hides teams the user is not a member of.',
    world,
    request: {
      method: 'GET',
      path: '/teams/team_northstar_default',
      headers: userAuth,
    },
    expect: {
      status: 404,
      json: teamNotFound,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'team_northstar_default' },
        teamId: null,
      },
    },
  },
  {
    id: 'fake-api/team-get-app-bound-team',
    summary: "team.get returns an app token's bound team.",
    world,
    request: {
      method: 'GET',
      path: '/teams/team_global',
      query: { teamId: 'team_global' },
      headers: appAuth,
    },
    expect: {
      status: 200,
      json: globalTeam,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'team_global' },
        teamId: 'team_global',
      },
    },
  },
  {
    id: 'fake-api/team-get-app-other-team',
    summary: 'team.get hides other teams from an app token.',
    world,
    request: { method: 'GET', path: '/teams/local-team', headers: appAuth },
    expect: {
      status: 404,
      json: teamNotFound,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'local-team' },
        teamId: null,
      },
    },
  },
  {
    id: 'fake-api/team-get-none',
    summary: 'team.get without Authorization reports a missing token.',
    world,
    request: { method: 'GET', path: '/teams/team_global' },
    expect: {
      status: 403,
      json: missingToken,
      operation: {
        operation: 'team.get',
        params: { idOrSlug: 'team_global' },
        teamId: null,
      },
    },
  },
  {
    id: 'fake-api/oauth-discovery',
    summary: 'OAuth discovery points every endpoint at the fake API origin.',
    world,
    request: { method: 'GET', path: '/.well-known/openid-configuration' },
    expect: {
      status: 200,
      json: {
        issuer: '{{origin}}/',
        device_authorization_endpoint: '{{origin}}/oauth/device',
        token_endpoint: '{{origin}}/oauth/token',
        revocation_endpoint: '{{origin}}/oauth/revoke',
        jwks_uri: '{{origin}}/oauth/jwks',
        introspection_endpoint: '{{origin}}/oauth/introspect',
      },
      operation: { operation: 'oauth.discovery' },
    },
  },
  {
    id: 'fake-api/oauth-introspect-app',
    summary: 'Introspecting an app token returns the app and its bound team.',
    world,
    request: {
      method: 'POST',
      path: '/oauth/introspect',
      body: { token: appToken },
    },
    expect: {
      status: 200,
      json: {
        active: true,
        client_id: 'app_scenario',
        client_name: 'Scenario App',
        team: { id: 'team_global', slug: 'global-team' },
      },
      operation: { operation: 'oauth.introspect' },
    },
  },
  {
    id: 'fake-api/oauth-introspect-user',
    summary: 'Introspecting a user token reports it inactive.',
    world,
    request: {
      method: 'POST',
      path: '/oauth/introspect',
      body: { token: scenarioToken },
    },
    expect: {
      status: 200,
      json: { active: false },
      operation: { operation: 'oauth.introspect' },
    },
  },
  {
    id: 'fake-api/oauth-introspect-none',
    summary: 'Introspection without a token reports inactive.',
    world,
    request: { method: 'POST', path: '/oauth/introspect', body: {} },
    expect: {
      status: 200,
      json: { active: false },
      operation: { operation: 'oauth.introspect' },
    },
  },
  {
    id: 'fake-api/unmodeled-route',
    summary: 'Requests matching no catalog operation are unhandled.',
    world,
    request: { method: 'GET', path: '/v9/projects', headers: userAuth },
    expect: {
      status: 404,
      json: {
        error: {
          code: 'scenario_unhandled',
          message: 'Scenario API did not handle GET /v9/projects',
        },
      },
      operation: null,
    },
  },
];
