import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import type { User } from '@vercel-internals/types';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import whoami from '../../../../src/commands/whoami';
import pkg from '../../../../src/util/pkg';
import { introspectToken } from '../../../../src/util/introspect-token';

vi.mock('../../../../src/util/introspect-token', () => ({
  introspectToken: vi.fn(),
}));

const introspectTokenMock = vi.mocked(introspectToken);

describe('whoami', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'whoami';

      client.setArgv(command, '--help');
      const exitCodePromise = whoami(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    const result = await whoami(client);
    expect(result).toBe(2);
  });

  it('should report being logged out instead of starting a login flow', async () => {
    client.authConfig = {};

    const exitCode = await whoami(client);

    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Logged out.');
    expect(stderr).toContain('vercel deploy --temporary');
  });

  it('should print the Vercel username on personal scope', async () => {
    const user = useUser({ billing: { plan: 'hobby' } as User['billing'] });
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`Logged in as ${user.username}`);
    await expect(client.stderr).toOutput('Active team: Personal Account');
    await expect(client.stderr).toOutput('Active team plan: Hobby');
  });

  it('should print the active team when a team is selected', async () => {
    useUser();
    const team = useTeam();
    team.billing = { plan: 'pro' };
    client.config.currentTeam = team.id;

    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`Active team: ${team.slug}`);
    await expect(client.stderr).toOutput('Active team plan: Pro');
  });

  it('should flag a local override when a linked project uses a different team', async () => {
    useUser();
    // Both teams must be known so they can be resolved by ID.
    const globalTeam = useTeam();
    const localTeam = {
      id: 'team_local',
      slug: 'local-team',
      name: 'Local Team',
      creatorId: 'u1',
      created: '2017-04-29T17:21:54.514Z',
      avatar: null,
    };
    client.scenario.get(`/teams/${localTeam.id}`, (_req, res) => {
      res.json(localTeam);
    });

    client.config.currentTeam = globalTeam.id;

    const cwd = setupTmpDir();
    client.cwd = cwd;
    await outputFile(
      join(cwd, '.vercel', 'project.json'),
      JSON.stringify({ orgId: localTeam.id, projectId: 'prj_1' })
    );

    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(`Active team: ${localTeam.slug}`);
    expect(stderr).toContain('Local override:');
    expect(stderr).toContain(`globally selected: ${globalTeam.slug}`);
  });

  it('should print only the Vercel username when output is not a TTY', async () => {
    const user = useUser();
    client.stdout.isTTY = false;
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
  });

  it('should print only the Vercel username in non-TTY mode even when a team is selected', async () => {
    const user = useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;
    client.stdout.isTTY = false;

    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    // Non-TTY stdout preserves the legacy behavior of printing the user's
    // username to support `vc whoami | pbcopy` and similar pipelines.
    // Team information is available via `--format json`.
    await expect(client.stdout).toOutput(`${user.username}\n`);
  });

  it('prints the username and exits 0 when piped, even if the saved team is gone', async () => {
    // Piped output is only the username, so a deleted or inaccessible saved
    // team no longer fails it. Terminal and JSON output still look it up.
    const user = useUser();
    let teamRequests = 0;
    client.scenario.get('/teams/team_deleted', (_req, res) => {
      teamRequests++;
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Not found' } });
    });
    client.config.currentTeam = 'team_deleted';
    client.stdout.isTTY = false;

    const exitCode = await whoami(client);

    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
    expect(teamRequests).toBe(0);
  });

  it('looks up only the user when output is piped', async () => {
    const user = useUser();
    let teamRequests = 0;
    client.scenario.get('/teams/team_piped', (_req, res) => {
      teamRequests++;
      res.json({ id: 'team_piped', slug: 'piped', name: 'Piped' });
    });
    client.config.currentTeam = 'team_piped';
    client.stdout.isTTY = false;

    const exitCode = await whoami(client);

    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
    expect(teamRequests).toBe(0);
  });

  describe('--cached', () => {
    it('prints the saved username without contacting Vercel', async () => {
      let requested = false;
      client.scenario.get('/v2/user', (_req, res) => {
        requested = true;
        res.status(500).json({});
      });
      client.authConfig = {
        token: 'token_dummy',
        skipWrite: true,
        userId: 'user_saved',
        cachedUser: { id: 'user_saved', username: 'saved-name' },
      };
      client.stdout.isTTY = false;
      client.setArgv('whoami', '--cached');

      const exitCode = await whoami(client);

      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('saved-name\n');
      expect(requested).toBe(false);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:cached', value: 'TRUE' },
      ]);
    });

    it('marks JSON output as cached', async () => {
      client.authConfig = {
        token: 'token_dummy',
        skipWrite: true,
        userId: 'user_saved',
        cachedUser: { id: 'user_saved', username: 'saved-name' },
      };
      client.setArgv('whoami', '--cached', '--json');

      const exitCode = await whoami(client);

      expect(exitCode).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        username: 'saved-name',
        cached: true,
      });
    });

    it('marks JSON from Vercel as not cached when nothing is saved', async () => {
      const user = useUser();
      client.setArgv('whoami', '--cached', '--json');

      const exitCode = await whoami(client);

      expect(exitCode).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        username: user.username,
        cached: false,
      });
    });

    it('asks Vercel and saves the username when nothing is cached', async () => {
      const user = useUser();
      client.stdout.isTTY = false;
      client.setArgv('whoami', '--cached');

      const exitCode = await whoami(client);

      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput(`${user.username}\n`);
      expect(client.authConfig.userId).toBe(user.id);
      expect(client.authConfig.cachedUser).toEqual({
        id: user.id,
        username: user.username,
      });
    });

    it('ignores a saved name that belongs to another user', async () => {
      // cli-go and older CLIs save a new userId but keep the name they don't know.
      const user = useUser();
      client.authConfig = {
        token: 'token_dummy',
        skipWrite: true,
        userId: user.id,
        cachedUser: { id: 'user_previous', username: 'previous-account' },
      };
      client.stdout.isTTY = false;
      client.setArgv('whoami', '--cached');

      const exitCode = await whoami(client);

      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput(`${user.username}\n`);
      expect(client.stdout.getFullOutput()).not.toContain('previous-account');
    });
  });

  describe('--format', () => {
    it('tracks telemetry for --format json', async () => {
      useUser();
      client.setArgv('whoami', '--format', 'json');
      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });

    it('outputs user information as JSON', async () => {
      const user = useUser({ billing: { plan: 'hobby' } as User['billing'] });
      client.setArgv('whoami', '--format', 'json');
      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toMatchObject({
        username: user.username,
        email: user.email,
        name: user.name,
        team: null,
        plan: 'hobby',
      });
      expect(jsonOutput.localOverride).toBeUndefined();
    });

    it('includes the active team as JSON', async () => {
      useUser();
      const team = useTeam();
      team.billing = { plan: 'enterprise' };
      client.config.currentTeam = team.id;
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.team).toMatchObject({
        id: team.id,
        slug: team.slug,
        name: team.name,
        plan: 'enterprise',
      });
      expect(jsonOutput.plan).toBe('enterprise');
      expect(jsonOutput.localOverride).toBeUndefined();
    });
  });

  describe('--json preflight fields', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('lists every team, the CLI version, and the linked project', async () => {
      useUser();
      const team = useTeam();
      const cwd = setupTmpDir();
      client.cwd = cwd;
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({
          orgId: team.id,
          projectId: 'prj_1',
          projectName: 'q3-report',
        })
      );
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.teams).toEqual([
        { id: team.id, slug: team.slug, name: team.name },
      ]);
      expect(jsonOutput.cliVersion).toBe(pkg.version);
      expect(jsonOutput.linkedProject).toEqual({
        id: 'prj_1',
        name: 'q3-report',
        orgId: team.id,
      });
    });

    it('uses null when the teams cannot be listed and nothing is linked', async () => {
      useUser();
      client.cwd = setupTmpDir();
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.teams).toBeNull();
      expect(jsonOutput.linkedProject).toBeNull();
      expect(jsonOutput.cliVersion).toBe(pkg.version);
    });

    it('reads the link from VERCEL_ORG_ID and VERCEL_PROJECT_ID', async () => {
      useUser();
      const team = useTeam();
      client.cwd = setupTmpDir();
      vi.stubEnv('VERCEL_ORG_ID', team.id);
      vi.stubEnv('VERCEL_PROJECT_ID', 'prj_env');
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.linkedProject).toEqual({
        id: 'prj_env',
        name: null,
        orgId: team.id,
      });
    });

    async function setupRepoLink(teamId: string) {
      const root = setupTmpDir();
      await outputFile(
        join(root, '.vercel', 'repo.json'),
        JSON.stringify({
          remoteName: 'origin',
          projects: [
            {
              id: 'prj_web',
              name: 'web',
              directory: 'apps/web',
              orgId: teamId,
            },
            {
              id: 'prj_api',
              name: 'api',
              directory: 'apps/api',
              orgId: teamId,
            },
          ],
        })
      );
      await outputFile(join(root, 'apps', 'web', 'index.html'), '');
      return root;
    }

    it("reads the repository link for a project's directory", async () => {
      useUser();
      const team = useTeam();
      const root = await setupRepoLink(team.id);
      client.cwd = join(root, 'apps', 'web');
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(0);

      expect(JSON.parse(client.stdout.getFullOutput()).linkedProject).toEqual({
        id: 'prj_web',
        name: 'web',
        orgId: team.id,
      });
    });

    it('uses null at a repository root that holds several projects', async () => {
      useUser();
      const team = useTeam();
      client.cwd = await setupRepoLink(team.id);
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(0);

      expect(
        JSON.parse(client.stdout.getFullOutput()).linkedProject
      ).toBeNull();
    });

    it('adds the CLI version and linked project when logged out', async () => {
      client.authConfig = {};
      const cwd = setupTmpDir();
      client.cwd = cwd;
      await outputFile(
        join(cwd, '.vercel', 'project.json'),
        JSON.stringify({ orgId: 'team_1', projectId: 'prj_1' })
      );
      client.setArgv('whoami', '--json');

      expect(await whoami(client)).toEqual(1);

      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        loggedIn: false,
        cliVersion: pkg.version,
        linkedProject: { id: 'prj_1', name: null, orgId: 'team_1' },
      });
    });
  });

  describe('app principal', () => {
    beforeEach(() => {
      vi.stubEnv('APP_PRINCIPAL_ENABLED', '1');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      introspectTokenMock.mockReset();
    });

    function useAppToken(team: ReturnType<typeof useTeam>) {
      client.scenario.get('/v2/user', (_req, res) => {
        res.status(403).json({ error: { message: 'forbidden' } });
      });
      introspectTokenMock.mockResolvedValue({
        active: true,
        client_id: 'app_dummy',
        client_name: 'Dummy App',
        team: { id: team.id, slug: team.slug },
      });
    }

    it('should print the app id in non-TTY mode', async () => {
      const team = useTeam();
      useAppToken(team);
      client.stdout.isTTY = false;

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);
      await expect(client.stdout).toOutput('app_dummy\n');
    });

    it('outputs the app and team as JSON without user fields', async () => {
      const team = useTeam();
      team.billing = { plan: 'pro' };
      useAppToken(team);
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.app).toEqual({ id: 'app_dummy', name: 'Dummy App' });
      expect(jsonOutput.team).toMatchObject({
        id: team.id,
        slug: team.slug,
        plan: 'pro',
      });
      expect(jsonOutput.plan).toBe('pro');
      expect(jsonOutput.username).toBeUndefined();
      expect(jsonOutput.email).toBeUndefined();
      expect(jsonOutput.name).toBeUndefined();
    });
  });
});
