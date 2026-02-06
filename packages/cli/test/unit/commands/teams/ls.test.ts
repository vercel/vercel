import { beforeEach, describe, expect, it } from 'vitest';
import teams from '../../../../src/commands/teams';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('teams ls', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'teams';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('non-northstar', () => {
    it('should display your personal account', async () => {
      const user = useUser();
      useTeams(undefined, { apiVersion: 2 });
      client.setArgv('teams', 'ls');
      const exitCodePromise = teams(client);
      await expect(client.stderr).toOutput(user.username);
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "teamsList"').toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
      ]);
    });
  });

  describe('northstar', () => {
    const username = 'some-user';

    beforeEach(() => {
      useUser({
        username,
        version: 'northstar',
      });
      useTeams(undefined, { apiVersion: 2 });
    });

    it('should not display your personal account', async () => {
      client.setArgv('teams', 'list');
      const exitCodePromise = teams(client);

      await expect(client.stdout).not.toOutput(username);

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "teams"').toEqual(0);
    });

    it('--next option should be tracked', async () => {
      client.setArgv('teams', 'list', '--next', '1584722256178');
      const exitCode = await teams(client);
      expect(exitCode, 'exit code for "teams"').toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'list' },
        { key: 'option:next', value: '[REDACTED]' },
      ]);
    });

    describe('depreated flags', () => {
      it('--until option should be tracked', async () => {
        client.setArgv('teams', 'list', '--until', '1584722256178');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:until', value: '[REDACTED]' },
        ]);
      });

      it('--count option should be tracked', async () => {
        client.setArgv('teams', 'list', '--count', '3');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:count', value: '[REDACTED]' },
        ]);
      });

      it('--since option should be tracked', async () => {
        client.setArgv('teams', 'list', '--since', '31584722256178');
        const exitCode = await teams(client);
        expect(exitCode, 'exit code for "teams"').toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:since', value: '[REDACTED]' },
        ]);
      });
    });

    describe('--format', () => {
      it('tracks telemetry for --format json', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:list',
            value: 'ls',
          },
          {
            key: 'option:format',
            value: 'json',
          },
        ]);
      });

      it('outputs teams as valid JSON that can be piped to jq', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        // Should be valid JSON - this will throw if not parseable
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toHaveProperty('teams');
        expect(Array.isArray(jsonOutput.teams)).toBe(true);
      });

      it('outputs correct team structure in JSON', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput.teams.length).toBeGreaterThan(0);
        const firstTeam = jsonOutput.teams[0];
        expect(firstTeam).toHaveProperty('id');
        expect(firstTeam).toHaveProperty('slug');
        expect(firstTeam).toHaveProperty('name');
        expect(firstTeam).toHaveProperty('current');
      });
    });
  });
});
