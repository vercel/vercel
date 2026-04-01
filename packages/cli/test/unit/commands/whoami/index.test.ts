import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
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

  it('should print the Vercel username', async () => {
    const user = useUser();
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`> ${user.username} (hobby)\n`);
  });

  it('should print only the Vercel username when output is not a TTY', async () => {
    const user = useUser();
    client.stdout.isTTY = false;
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
  });

  it('should print only the Vercel username when a team scope is active and output is not a TTY', async () => {
    const team = useTeam();
    const user = useUser();
    client.config.currentTeam = team.id;
    client.stdout.isTTY = false;

    const exitCode = await whoami(client);

    expect(exitCode).toEqual(0);
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
        plan: 'hobby',
        scope: {
          type: 'user',
          name: user.username,
        },
        team: null,
      });
    });

    it('outputs the effective team plan when scoped to a team', async () => {
      const team = useTeam();
      const user = useUser();
      client.config.currentTeam = team.id;
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toMatchObject({
        username: user.username,
        email: user.email,
        name: user.name,
        plan: team.billing.plan,
        scope: {
          type: 'team',
          name: team.slug,
        },
        team: {
          id: team.id,
          slug: team.slug,
          name: team.name,
        },
      });
    });

    it('falls back to the personal scope when currentTeam is stale', async () => {
      const user = useUser();
      client.config.currentTeam = 'stale-team-id';
      client.scenario.get('/teams/stale-team-id', (_req, res) => {
        res.status(404).json({
          error: {
            code: 'not_found',
            message: 'Team not found',
          },
        });
      });
      client.setArgv('whoami', '--format', 'json');

      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);

      const output = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(output);

      expect(jsonOutput).toMatchObject({
        username: user.username,
        plan: 'hobby',
        scope: {
          type: 'user',
          name: user.username,
        },
        team: null,
      });
    });
  });
});
