import { describe, expect, it } from 'vitest';
import { join } from 'path';
import { outputFile } from 'fs-extra';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import whoami from '../../../../src/commands/whoami';

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

  it('should print the team slug when output is not a TTY and a team is selected', async () => {
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;
    client.stdout.isTTY = false;

    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${team.slug}\n`);
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
});
