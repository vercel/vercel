import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTeam, buildUser } from '../fakes/fake-identity-gateway';
import { DEFAULT_CWD, type InMemoryCliState } from '../fakes/in-memory-context';
import { runScenario, useNetworkGuard } from './harness';

useNetworkGuard();

const user = buildUser({
  id: 'user_1',
  username: 'alice',
  email: 'alice@example.com',
  name: 'Alice',
});
const acme = buildTeam({ id: 'team_acme', slug: 'acme', name: 'Acme Inc' });
const local = buildTeam({ id: 'team_local', slug: 'local-team' });

/** Logged in as `alice` with no team selected. */
function loggedIn(overrides: InMemoryCliState = {}): InMemoryCliState {
  return {
    ...overrides,
    cliConfig: {
      globalConfig: { telemetry: { enabled: false } },
      authConfig: { token: 'tok_user' },
      ...overrides.cliConfig,
    },
    identity: { user, teams: [acme], ...overrides.identity },
  };
}

/** Logged in as `alice` with `teamId` globally selected. */
function withGlobalTeam(
  teamId: string,
  overrides: InMemoryCliState = {}
): InMemoryCliState {
  return loggedIn({
    ...overrides,
    cliConfig: {
      globalConfig: { telemetry: { enabled: false }, currentTeam: teamId },
      ...overrides.cliConfig,
    },
  });
}

describe('whoami', () => {
  describe('logged out', () => {
    it('reports being logged out', async () => {
      const { exitCode, stderr } = await runScenario(['whoami']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Logged out.');
      expect(stderr).toContain('vercel deploy --temporary');
    });

    it('reports being logged out as JSON', async () => {
      const { exitCode, stdout } = await runScenario([
        'whoami',
        '--format',
        'json',
      ]);

      expect(exitCode).toBe(1);
      expect(JSON.parse(stdout)).toEqual({ loggedIn: false });
    });
  });

  describe('TTY output', () => {
    it('prints the user on personal scope', async () => {
      const { exitCode, stderr } = await runScenario(['whoami'], loggedIn());

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Logged in as alice');
      expect(stderr).toContain('Active team: Personal Account');
    });

    it('prints the selected team with its name', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        withGlobalTeam(acme.id)
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Active team: acme (Acme Inc)');
    });

    it('omits the team name when it equals the slug', async () => {
      const plain = buildTeam({ id: 'team_plain', slug: 'plain' });
      const { stderr } = await runScenario(
        ['whoami'],
        withGlobalTeam(plain.id, { identity: { teams: [plain] } })
      );

      expect(stderr).toContain('Active team: plain\n');
    });

    it('flags a local override from a linked project', async () => {
      const cwd = join(DEFAULT_CWD, 'app');
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        withGlobalTeam(acme.id, {
          cwd,
          identity: { teams: [acme, local] },
          projectLinks: {
            projectLinks: { [cwd]: { orgId: local.id, projectId: 'prj_1' } },
          },
        })
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain(`Active team: ${local.slug}`);
      expect(stderr).toContain('Local override:');
      expect(stderr).toContain(`globally selected: ${acme.slug}`);
    });

    it('flags a local override from a repo link', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        withGlobalTeam(acme.id, {
          cwd: join(DEFAULT_CWD, 'apps', 'web'),
          identity: { teams: [acme, local] },
          projectLinks: {
            repos: {
              [DEFAULT_CWD]: {
                remoteName: 'origin',
                projects: [
                  {
                    id: 'prj_web',
                    name: 'web',
                    directory: 'apps/web',
                    orgId: local.id,
                  },
                ],
              },
            },
          },
        })
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain(`Active team: ${local.slug}`);
      expect(stderr).toContain('Local override:');
    });

    it('warns about a cross-team repo without a matching project', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({
          projectLinks: {
            repos: {
              [DEFAULT_CWD]: {
                remoteName: 'origin',
                projects: [
                  { id: 'prj_a', name: 'a', directory: 'a', orgId: acme.id },
                  { id: 'prj_b', name: 'b', directory: 'b', orgId: local.id },
                ],
              },
            },
          },
        })
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain(
        'This repository has projects across multiple teams.'
      );
      expect(stderr).toContain('Active team: Personal Account');
    });
  });

  describe('non-TTY output', () => {
    it('prints only the username', async () => {
      const { exitCode, stdout } = await runScenario(['whoami'], loggedIn(), {
        stdoutIsTTY: false,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe('alice\n');
    });

    it('prints only the username when a team is selected', async () => {
      const { stdout } = await runScenario(
        ['whoami'],
        withGlobalTeam(acme.id),
        {
          stdoutIsTTY: false,
        }
      );

      expect(stdout).toBe('alice\n');
    });
  });

  describe('--format json', () => {
    it('outputs the personal scope', async () => {
      const { exitCode, stdout } = await runScenario(
        ['whoami', '--format', 'json'],
        loggedIn()
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toEqual({
        team: null,
        username: 'alice',
        email: 'alice@example.com',
        name: 'Alice',
      });
    });

    it('outputs the selected team', async () => {
      const { stdout } = await runScenario(
        ['whoami', '--format', 'json'],
        withGlobalTeam(acme.id)
      );

      expect(JSON.parse(stdout).team).toEqual({
        id: acme.id,
        slug: acme.slug,
        name: acme.name,
      });
    });

    it('outputs a local override', async () => {
      const cwd = join(DEFAULT_CWD, 'app');
      const { stdout } = await runScenario(
        ['whoami', '--format', 'json'],
        withGlobalTeam(acme.id, {
          cwd,
          identity: { teams: [acme, local] },
          projectLinks: {
            projectLinks: { [cwd]: { orgId: local.id, projectId: 'prj_1' } },
          },
        })
      );

      const json = JSON.parse(stdout);
      expect(json.team).toMatchObject({ id: local.id });
      expect(json.localOverride).toBe(true);
      expect(json.globalTeam).toEqual({
        id: acme.id,
        slug: acme.slug,
        name: acme.name,
      });
    });
  });

  describe('--scope', () => {
    const northstar = buildUser({
      ...user,
      version: 'northstar',
      defaultTeamId: acme.id,
    });
    const virtual = buildTeam({ id: 'team_virtual', slug: 'virtual' });

    it('selects a team from the teams list', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--scope', 'acme'],
        loggedIn()
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Active team: acme');
      expect(stderr).not.toContain('Local override:');
    });

    it('rejects an unknown scope', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--scope', 'nope'],
        loggedIn()
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain('The specified scope does not exist');
    });

    it('selects a team from the deprecated --team option', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--team', 'acme'],
        loggedIn()
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('The "--team" option is deprecated.');
      expect(stderr).toContain('Active team: acme');
    });

    it('selects a team from `scope` in the local vercel.json', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({
          workspace: {
            files: { [join(DEFAULT_CWD, 'vercel.json')]: { scope: 'acme' } },
          },
        })
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Active team: acme');
    });

    describe('user lookup fails', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it.each([
        [
          'a server error',
          { kind: 'error', code: 'api_error' },
          'Internal server error (500)',
        ],
        [
          'a network error',
          { kind: 'error', code: 'network' },
          'request to https://api.vercel.com/v2/user failed, reason: socket hang up',
        ],
        [
          'a response without a user',
          { kind: 'missing_user' },
          'Not able to load user, missing from response',
        ],
      ] as const)('reports %s as an unexpected error', async (_, userState, reason) => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({ identity: { user: userState } })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          `Not able to load user because of unexpected error: ${reason}`
        );
      });

      it('does not fall back to app token scope for a server error', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            identity: { user: { kind: 'error', code: 'api_error' } },
          }),
          { env: { APP_PRINCIPAL_ENABLED: '1' } }
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'Not able to load user because of unexpected error: Internal server error (500)'
        );
      });

      it('reports an invalid token as missing access to the account', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({ identity: { user: { kind: 'forbidden' } } })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'You do not have access to the specified account'
        );
      });

      it('records the failure as error telemetry for agents', async () => {
        // `TelemetryEventStore.enabled` still reads `process.env` directly.
        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);

        const { exitCode, fakes } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            agent: { isAgent: true, agentName: 'claude' },
            cliConfig: { globalConfig: { telemetry: { enabled: true } } },
            identity: { user: { kind: 'error', code: 'api_error' } },
          })
        );

        expect(exitCode).toBe(1);
        expect(fakes.telemetry.sent).toHaveLength(1);
        expect(fakes.telemetry.sent[0].body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ key: 'error_status', value: '500' }),
            expect.objectContaining({
              key: 'error_code',
              value: 'internal_server_error',
            }),
          ])
        );
      });
    });

    describe('virtual team membership', () => {
      it('rejects the team when a direct lookup cannot find it either', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'virtual'],
          loggedIn()
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain('The specified scope does not exist');
      });

      it('selects a team missing from the teams list by direct lookup', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'virtual'],
          loggedIn({ identity: { directTeams: [virtual] } })
        );

        expect(exitCode).toBe(0);
        expect(stderr).toContain('Active team: virtual\n');
      });

      it.each([
        ['slug', 'virtual'],
        ['id', 'team_virtual'],
      ])('outputs the team found by %s as JSON', async (_, scope) => {
        const { exitCode, stdout } = await runScenario(
          ['whoami', '--scope', scope, '--format', 'json'],
          loggedIn({ identity: { directTeams: [virtual] } })
        );

        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout).team).toEqual({
          id: virtual.id,
          slug: virtual.slug,
          name: virtual.name,
        });
      });
    });

    describe('northstar username matching a team slug', () => {
      const namesake = buildTeam({ id: 'team_alice', slug: 'alice' });

      it('selects the team over the personal account', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'alice'],
          loggedIn({ identity: { user: northstar, teams: [acme, namesake] } })
        );

        expect(exitCode).toBe(0);
        expect(stderr).toContain('Active team: alice\n');
      });

      it('outputs the team as JSON', async () => {
        const { exitCode, stdout } = await runScenario(
          ['whoami', '--scope', 'alice', '--format', 'json'],
          loggedIn({ identity: { user: northstar, teams: [acme, namesake] } })
        );

        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout).team).toEqual({
          id: namesake.id,
          slug: namesake.slug,
          name: namesake.name,
        });
      });

      // The direct lookup is skipped when the scope matches the user's
      // identity, so a namesake team with only a virtual membership loses to
      // the personal account check.
      it('rejects a namesake team reachable only by direct lookup', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'alice'],
          loggedIn({ identity: { user: northstar, directTeams: [namesake] } })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'You cannot set your Personal Account as the scope.'
        );
      });
    });

    describe('northstar personal account', () => {
      it.each([
        ['username', 'alice'],
        ['email', 'alice@example.com'],
        ['id', 'user_1'],
      ])('rejects scoping by %s', async (_, scope) => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', scope],
          loggedIn({ identity: { user: northstar } })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'You cannot set your Personal Account as the scope.'
        );
      });
    });

    describe('teams list fails but the scope matches the user', () => {
      it.each([
        ['username', 'alice', 'api_error'],
        ['email', 'alice@example.com', 'api_error'],
        ['id', 'user_1', 'api_error'],
        ['username', 'alice', 'rate_limited'],
        ['username', 'alice', 'not_authorized'],
      ] as const)('uses the personal account when scoping by %s (%s, teams %s)', async (_, scope, code) => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', scope],
          loggedIn({ identity: { teams: { kind: 'error', code } } })
        );

        expect(exitCode).toBe(0);
        expect(stderr).toContain('Logged in as alice');
        expect(stderr).toContain('Active team: Personal Account');
      });

      it('clears a globally selected team', async () => {
        const { exitCode, stdout, fakes } = await runScenario(
          ['whoami', '--scope', 'alice', '--format', 'json'],
          withGlobalTeam(acme.id, {
            identity: { teams: { kind: 'error', code: 'api_error' } },
          })
        );

        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout)).toEqual({
          team: null,
          username: 'alice',
          email: 'alice@example.com',
          name: 'Alice',
        });
        // The override applies to this invocation only.
        expect(fakes.cliConfig.globalConfig?.currentTeam).toBe(acme.id);
      });

      it('still rejects the personal account of a northstar user', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'alice'],
          loggedIn({
            identity: {
              user: northstar,
              teams: { kind: 'error', code: 'api_error' },
            },
          })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'You cannot set your Personal Account as the scope.'
        );
      });
    });

    describe('teams list fails for a team scope', () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('reports rate limiting while listing teams', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            identity: { teams: { kind: 'error', code: 'rate_limited' } },
          })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'Rate limited. Too many requests to the same endpoint: /teams'
        );
      });

      it('reports missing access while listing teams', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            identity: { teams: { kind: 'error', code: 'not_authorized' } },
          })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain(
          'You do not have access to the specified team'
        );
      });

      it('reports an unexpected failure while listing teams', async () => {
        const { exitCode, stderr } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            identity: { teams: { kind: 'error', code: 'api_error' } },
          })
        );

        expect(exitCode).toBe(1);
        expect(stderr).toContain('Not able to load teams');
      });

      it('records the rate limit as error telemetry for agents', async () => {
        // `TelemetryEventStore.enabled` still reads `process.env` directly.
        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);

        const { exitCode, fakes } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            agent: { isAgent: true, agentName: 'claude' },
            cliConfig: { globalConfig: { telemetry: { enabled: true } } },
            identity: { teams: { kind: 'error', code: 'rate_limited' } },
          })
        );

        expect(exitCode).toBe(1);
        expect(fakes.telemetry.sent).toHaveLength(1);
        expect(fakes.telemetry.sent[0].body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ key: 'error_status', value: '429' }),
            expect.objectContaining({
              key: 'error_code',
              value: 'rate_limited',
            }),
          ])
        );
      });

      it('does not record error telemetry outside agents', async () => {
        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);

        const { fakes } = await runScenario(
          ['whoami', '--scope', 'acme'],
          loggedIn({
            cliConfig: { globalConfig: { telemetry: { enabled: true } } },
            identity: { teams: { kind: 'error', code: 'rate_limited' } },
          })
        );

        expect(fakes.telemetry.sent).toHaveLength(1);
        expect(fakes.telemetry.sent[0].body).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ key: 'error_code' }),
          ])
        );
      });
    });
  });

  describe('failures', () => {
    it('renders an invalid token', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({ identity: { user: { kind: 'forbidden' } } })
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain('The specified token is not valid.');
    });

    it('renders a server error while loading the user', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({ identity: { user: { kind: 'error', code: 'api_error' } } })
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Error: Internal server error (500)');
    });

    it('renders an interrupted connection while loading the user', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({ identity: { user: { kind: 'error', code: 'network' } } })
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        'Connection to api.vercel.com interrupted. Please verify your internet connectivity and DNS configuration.'
      );
    });

    it('renders a response without a user', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        loggedIn({ identity: { user: { kind: 'missing_user' } } })
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Not able to load user, missing from response');
    });

    it('renders a deleted team', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami'],
        withGlobalTeam('team_gone')
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        'Your team was deleted or you were removed from the team.'
      );
    });
  });

  describe('app principal', () => {
    const appState = ({
      withTeam = true,
    }: {
      withTeam?: boolean;
    } = {}): InMemoryCliState => ({
      cliConfig: {
        globalConfig: { telemetry: { enabled: false } },
        authConfig: { token: 'tok_app' },
      },
      identity: { user: { kind: 'forbidden' }, directTeams: [acme] },
      introspection: {
        tokens: {
          tok_app: {
            active: true,
            client_id: 'app_dummy',
            client_name: 'Dummy App',
            ...(withTeam ? { team: { id: acme.id, slug: acme.slug } } : {}),
          },
        },
      },
    });
    const env = { APP_PRINCIPAL_ENABLED: '1' };

    it('prints the app id in non-TTY mode', async () => {
      const { exitCode, stdout } = await runScenario(['whoami'], appState(), {
        env,
        stdoutIsTTY: false,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe('app_dummy\n');
    });

    it('outputs the app and team as JSON without user fields', async () => {
      const { stdout } = await runScenario(
        ['whoami', '--format', 'json'],
        appState(),
        { env }
      );

      const json = JSON.parse(stdout);
      expect(json.app).toEqual({ id: 'app_dummy', name: 'Dummy App' });
      expect(json.team).toMatchObject({ id: acme.id, slug: acme.slug });
      expect(json).not.toHaveProperty('username');
      expect(json).not.toHaveProperty('email');
      expect(json).not.toHaveProperty('name');
    });

    it("resolves --scope against the token's team", async () => {
      const { exitCode, stdout } = await runScenario(
        ['whoami', '--scope', 'acme'],
        appState(),
        { env, stdoutIsTTY: false }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toBe('app_dummy\n');
    });

    it("resolves --scope by the token team's id as JSON", async () => {
      const { exitCode, stdout } = await runScenario(
        ['whoami', '--scope', acme.id, '--format', 'json'],
        appState(),
        { env }
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).team).toMatchObject({
        id: acme.id,
        slug: acme.slug,
      });
    });

    it("rejects --scope for a team other than the token's", async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--scope', 'other'],
        appState(),
        { env }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        'You do not have access to the specified account'
      );
    });

    it('rejects --scope when the token has no team', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--scope', 'acme'],
        appState({ withTeam: false }),
        { env }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        'You do not have access to the specified account'
      );
    });

    it('rejects --scope when app principals are disabled', async () => {
      const { exitCode, stderr } = await runScenario(
        ['whoami', '--scope', 'acme'],
        appState()
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        'You do not have access to the specified account'
      );
    });

    it('treats the token as invalid when app principals are disabled', async () => {
      const { exitCode, stderr } = await runScenario(['whoami'], appState());

      expect(exitCode).toBe(1);
      expect(stderr).toContain('The specified token is not valid.');
    });
  });

  describe('credentials', () => {
    it('caches the user id in the stored credentials', async () => {
      const { fakes } = await runScenario(['whoami'], loggedIn());

      expect(fakes.cliConfig.authConfig?.userId).toBe(user.id);
    });

    it('logs in with VERCEL_TOKEN without writing credentials', async () => {
      const { exitCode, stderr, fakes } = await runScenario(
        ['whoami'],
        { identity: { user } },
        { env: { VERCEL_TOKEN: 'tok_env' } }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Logged in as alice');
      expect(fakes.cliConfig.authConfig).toBeUndefined();
    });
  });
});
