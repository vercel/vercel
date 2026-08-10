import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import whoami from '../../../../src/commands/whoami';
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
    expect(result).toBe(1);
  });

  it('should print the Vercel username on personal scope', async () => {
    const user = useUser();
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`Logged in as ${user.username}`);
    await expect(client.stderr).toOutput('Active team: Personal Account');
  });

  it('should print the active team when a team is selected', async () => {
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;

    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`Active team: ${team.slug}`);
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
      const user = useUser();
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
      });
      expect(jsonOutput.localOverride).toBeUndefined();
    });

    it('includes the active team as JSON', async () => {
      useUser();
      const team = useTeam();
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
      });
      expect(jsonOutput.localOverride).toBeUndefined();
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
      useAppToken(team);
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput.app).toEqual({ id: 'app_dummy', name: 'Dummy App' });
      expect(jsonOutput.team).toMatchObject({ id: team.id, slug: team.slug });
      expect(jsonOutput.username).toBeUndefined();
      expect(jsonOutput.email).toBeUndefined();
      expect(jsonOutput.name).toBeUndefined();
    });
  });
});
