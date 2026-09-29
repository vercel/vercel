import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { FakeApi } from './harness/fake-api';
import { registerOAuthRoutes } from './harness/fake-api';
import {
  assertBuiltCli,
  describeRun,
  type CliScenarioResult,
  withScenario,
} from './harness/run-cli';
import {
  registerTeamRoutes,
  registerUserRoutes,
  type Team,
} from '../mocks/user-team-routes';

const token = 'scenario_token';
const user = {
  id: 'user_scenario',
  email: 'scenario@example.test',
  name: 'Scenario User',
  username: 'scenario-user',
};
const globalTeam: Team = {
  id: 'team_global',
  slug: 'global-team',
  name: 'Global Team',
  creatorId: user.id,
  created: '2017-04-29T17:21:54.514Z',
  avatar: null,
};
const localTeam: Team = {
  id: 'team_local',
  slug: 'local-team',
  name: 'Local Team',
  creatorId: user.id,
  created: '2017-04-29T17:21:54.514Z',
  avatar: null,
};
const virtualTeam: Team = {
  id: 'team_virtual',
  slug: 'virtual-team',
  name: 'Virtual Team',
  creatorId: 'user_other',
  created: '2017-04-29T17:21:54.514Z',
  avatar: null,
};
const northstarDefaultTeam: Team = {
  id: 'team_northstar_default',
  slug: 'northstar-default',
  name: 'Northstar Default',
  creatorId: 'user_northstar',
  created: '2017-04-29T17:21:54.514Z',
  avatar: null,
};
const northstarUser = {
  id: 'user_northstar',
  email: 'northstar@example.test',
  name: 'Northstar User',
  username: 'northstar-user',
  version: 'northstar' as const,
  defaultTeamId: northstarDefaultTeam.id,
};
// A team whose slug collides with the Northstar user's username.
const northstarUsernameTeam: Team = {
  id: 'team_northstar_username',
  slug: northstarUser.username,
  name: 'Northstar Username Team',
  creatorId: northstarUser.id,
  created: '2017-04-29T17:21:54.514Z',
  avatar: null,
};
const appIntrospection = {
  active: true,
  client_id: 'app_scenario',
  client_name: 'Scenario App',
  team: { id: globalTeam.id, slug: globalTeam.slug },
};

function expectSuccessfulRun(result: CliScenarioResult, api: FakeApi) {
  const diagnostics = describeRun(result, api);
  expect(result.exitCode, diagnostics).toBe(0);
  expect(result.signal, diagnostics).toBeNull();
  expect(result.guardViolations, diagnostics).toEqual([]);
  expect(api.unhandled, diagnostics).toEqual([]);
  expect(`${result.stdout}${result.stderr}`).not.toContain(token);
}

/**
 * Expected non-zero exits must still stay inside the fake API and guard.
 */
function expectCleanFailure(result: CliScenarioResult, api: FakeApi) {
  const diagnostics = describeRun(result, api);
  expect(result.exitCode, diagnostics).toBe(1);
  expect(result.signal, diagnostics).toBeNull();
  expect(result.guardViolations, diagnostics).toEqual([]);
  expect(api.unhandled, diagnostics).toEqual([]);
  expect(result.stdout, diagnostics).toBe('');
  expect(`${result.stdout}${result.stderr}`).not.toContain(token);
}

function failTeamsList(
  api: FakeApi,
  status: number,
  error: { code: string; message: string }
) {
  api.router.get('/v1/teams', (_req, res) => {
    res.status(status).json({ error });
  });
}

function routeLog(api: FakeApi): string[] {
  return api.requests.map(({ method, path, query }) => {
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]): [string, string] => [
        key,
        String(value),
      ])
    ).toString();
    return `${method} ${path}${search ? `?${search}` : ''}`;
  });
}

function expectBearerAuth(api: FakeApi, expectedToken: string) {
  expect(
    api.requests
      .filter(request => !request.path.startsWith('/.well-known/'))
      .filter(request => !request.path.startsWith('/oauth/'))
      .map(request => request.authorization)
  ).toEqual(expect.arrayContaining([`Bearer ${expectedToken}`]));
  expect(
    api.requests.every(
      request =>
        request.authorization === undefined ||
        request.authorization === `Bearer ${expectedToken}`
    )
  ).toBe(true);
}

function useAppRoutes(api: FakeApi) {
  api.router.get('/v2/user', (_req, res) => {
    res.status(403).json({
      error: { code: 'forbidden', message: 'Not authorized' },
    });
  });
  registerTeamRoutes(api.router, [globalTeam]);
  registerOAuthRoutes(api, { token, introspection: appIntrospection });
}

function appEnv(api: FakeApi): Record<string, string> {
  return {
    APP_PRINCIPAL_ENABLED: '1',
    VERCEL_CLI_INTERNAL_TEST_OAUTH_ISSUER: api.origin,
  };
}

beforeAll(() => {
  assertBuiltCli();
});

describe('vc whoami subprocess scenarios', () => {
  it('reports logged out without a token or login prompt', async () => {
    await withScenario(async ({ api, run }) => {
      // Bootstrap starts a best-effort user lookup for telemetry identity.
      api.router.get('/v2/user', (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'The request is missing an authentication token',
            missingToken: true,
          },
        });
      });

      const result = await run({ args: ['whoami'] });

      expect(result.exitCode, describeRun(result, api)).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Logged out.');
      expect(result.stderr).toContain('vercel deploy --temporary');
      expect(result.guardViolations).toEqual([]);
      expect(api.unhandled).toEqual([]);
      expect(api.requests.map(request => request.authorization)).toEqual([
        undefined,
      ]);
    });
  });

  it('prints only the personal username for non-TTY output', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);

      const result = await run({ args: ['whoami'], token });

      expectSuccessfulRun(result, api);
      expect(result.stdout).toBe(`${user.username}\n`);
      expect(routeLog(api)).toEqual(['GET /v2/user']);
      expectBearerAuth(api, token);
    });
  });

  it('prints personal identity as JSON', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);

      const result = await run({
        args: ['whoami', '--format', 'json'],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: null,
        username: user.username,
        email: user.email,
        name: user.name,
      });
      expect(routeLog(api)).toEqual(['GET /v2/user']);
    });
  });

  it('resolves --scope during bootstrap and includes the team as JSON', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);
      registerTeamRoutes(api.router, [globalTeam]);

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', globalTeam.slug],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: {
          id: globalTeam.id,
          slug: globalTeam.slug,
          name: globalTeam.name,
        },
        username: user.username,
        email: user.email,
        name: user.name,
      });
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
      expectBearerAuth(api, token);
    });
  });

  it('reports a linked-project local override from temp auth config', async () => {
    await withScenario(async ({ api, sandbox, run }) => {
      registerUserRoutes(api.router, user);
      registerTeamRoutes(api.router, [globalTeam, localTeam]);
      sandbox.writeJson('global-config/config.json', {
        credStorage: 'file',
        currentTeam: globalTeam.id,
      });
      sandbox.writeJson('global-config/auth.json', { token });
      sandbox.writeJson('workspace/.vercel/project.json', {
        orgId: localTeam.id,
        projectId: 'prj_local',
      });

      const result = await run({ args: ['whoami', '--format', 'json'] });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: { id: localTeam.id, slug: localTeam.slug, name: localTeam.name },
        username: user.username,
        email: user.email,
        name: user.name,
        localOverride: true,
        globalTeam: {
          id: globalTeam.id,
          slug: globalTeam.slug,
          name: globalTeam.name,
        },
      });
      expect(routeLog(api)).toEqual([
        'GET /v2/user',
        `GET /teams/${globalTeam.id}?teamId=${globalTeam.id}`,
        `GET /teams/${localTeam.id}?teamId=${localTeam.id}`,
      ]);
      expectBearerAuth(api, token);
    });
  });

  it('keeps explicit --scope ahead of a linked project', async () => {
    await withScenario(async ({ api, sandbox, run }) => {
      registerUserRoutes(api.router, user);
      registerTeamRoutes(api.router, [globalTeam, localTeam]);
      sandbox.writeJson('workspace/.vercel/project.json', {
        orgId: localTeam.id,
        projectId: 'prj_local',
      });

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', globalTeam.slug],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toMatchObject({
        team: { id: globalTeam.id, slug: globalTeam.slug },
        username: user.username,
      });
      expect(JSON.parse(result.stdout).localOverride).toBeUndefined();
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
    });
  });

  it('prints an app principal and bound team as JSON through OAuth introspection', async () => {
    await withScenario(async ({ api, run }) => {
      useAppRoutes(api);

      const result = await run({
        args: ['whoami', '--format', 'json'],
        token,
        env: appEnv(api),
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: {
          id: globalTeam.id,
          slug: globalTeam.slug,
          name: globalTeam.name,
        },
        app: { id: 'app_scenario', name: 'Scenario App' },
      });
      expect(routeLog(api).sort()).toEqual(
        [
          'GET /.well-known/openid-configuration',
          'GET /v2/user',
          'POST /oauth/introspect',
          `GET /teams/${globalTeam.id}?teamId=${globalTeam.id}`,
        ].sort()
      );
      expect(
        api.requests.find(request => request.path === '/oauth/introspect')?.body
      ).toEqual({ token });
      expectBearerAuth(api, token);
    });
  });

  it('prints only the app id for non-TTY output', async () => {
    await withScenario(async ({ api, run }) => {
      useAppRoutes(api);

      const result = await run({
        args: ['whoami'],
        token,
        env: appEnv(api),
      });

      expectSuccessfulRun(result, api);
      expect(result.stdout).toBe('app_scenario\n');
    });
  });

  it('resolves --scope against the app token team', async () => {
    await withScenario(async ({ api, run }) => {
      useAppRoutes(api);

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', globalTeam.slug],
        token,
        env: appEnv(api),
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toMatchObject({
        team: { id: globalTeam.id, slug: globalTeam.slug },
        app: { id: 'app_scenario' },
      });
      expect(routeLog(api).sort()).toEqual(
        [
          'GET /.well-known/openid-configuration',
          'GET /v2/user',
          'GET /v2/user',
          'POST /oauth/introspect',
          'POST /oauth/introspect',
          `GET /teams/${globalTeam.id}?teamId=${globalTeam.id}`,
        ].sort()
      );
    });
  });

  it('resolves --scope through a direct lookup for a virtual team membership', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);
      // The teams list only contains direct memberships.
      registerTeamRoutes(api.router, [globalTeam]);
      api.router.get(`/teams/${virtualTeam.slug}`, (_req, res) => {
        res.json(virtualTeam);
      });

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', virtualTeam.slug],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: {
          id: virtualTeam.id,
          slug: virtualTeam.slug,
          name: virtualTeam.name,
        },
        username: user.username,
        email: user.email,
        name: user.name,
      });
      expect(routeLog(api)).toEqual([
        'GET /v2/user',
        'GET /v1/teams',
        `GET /teams/${virtualTeam.slug}`,
      ]);
      expectBearerAuth(api, token);
    });
  });

  it('prefers a team whose slug matches a Northstar username', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, northstarUser);
      registerTeamRoutes(api.router, [
        northstarDefaultTeam,
        northstarUsernameTeam,
      ]);

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', northstarUser.username],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: {
          id: northstarUsernameTeam.id,
          slug: northstarUsernameTeam.slug,
          name: northstarUsernameTeam.name,
        },
        username: northstarUser.username,
        email: northstarUser.email,
        name: northstarUser.name,
      });
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
    });
  });

  it('rejects a Northstar personal account as --scope', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, northstarUser);
      registerTeamRoutes(api.router, [northstarDefaultTeam]);

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', northstarUser.username],
        token,
      });

      expectCleanFailure(result, api);
      expect(result.stderr).toContain(
        'You cannot set your Personal Account as the scope.'
      );
      // The identity match skips the direct team lookup.
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
    });
  });

  it('ignores a teams-list failure when --scope matches the user identity', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);
      // A non-403, non-429 4xx fails once without retries or token handling.
      failTeamsList(api, 400, {
        code: 'bad_request',
        message: 'Teams are unavailable',
      });

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', user.username],
        token,
      });

      expectSuccessfulRun(result, api);
      expect(JSON.parse(result.stdout)).toEqual({
        team: null,
        username: user.username,
        email: user.email,
        name: user.name,
      });
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
    });
  });

  it('reports a rate-limited teams list for a team --scope', async () => {
    await withScenario(async ({ api, run }) => {
      registerUserRoutes(api.router, user);
      // The CLI maps `error.code`. A real 429 waits for Retry-After plus up
      // to 30s of skew on each retry, so use a 4xx that fails immediately.
      failTeamsList(api, 400, {
        code: 'rate_limited',
        message: 'Rate limit exceeded',
      });

      const result = await run({
        args: ['whoami', '--format', 'json', '--scope', globalTeam.slug],
        token,
      });

      expectCleanFailure(result, api);
      expect(result.stderr).toContain(
        'Rate limited. Too many requests to the same endpoint: /teams'
      );
      expect(routeLog(api)).toEqual(['GET /v2/user', 'GET /v1/teams']);
    });
  });

  it('records the Git fallback when the workspace has no repo link', async () => {
    await withScenario(async ({ api, sandbox, run }) => {
      registerUserRoutes(api.router, user);
      rmSync(join(sandbox.workspace, '.vercel', 'repo.json'));

      const result = await run({ args: ['whoami'], token });

      expect(result.guardViolations).toContainEqual({
        kind: 'child_process',
        target: 'execSync git rev-parse --show-toplevel',
      });
    });
  });

  it('fails visibly when a required route is missing', async () => {
    await withScenario(async ({ api, run }) => {
      const result = await run({ args: ['whoami'], token });

      expect(result.exitCode).toBe(1);
      expect(result.guardViolations).toEqual([]);
      expect(
        api.unhandled.map(({ method, path }) => `${method} ${path}`)
      ).toEqual(['GET /v2/user']);
    });
  });
});
