import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

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
      const user = useUser({
        billing: {
          addons: [],
          period: { start: 0, end: 0 },
          plan: 'hobby',
          platform: 'stripe',
          status: 'active',
          trial: { start: 0, end: 0 },
        },
      });
      useTeams(undefined, { apiVersion: 2 });
      client.setArgv('teams', 'ls');
      const exitCodePromise = teams(client);
      await expect(client.stderr).toOutput(user.username);
      await expect(client.stderr).toOutput('Plan');
      await expect(client.stderr).toOutput('hobby');
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
        billing: {
          addons: [],
          period: { start: 0, end: 0 },
          plan: 'pro',
          platform: 'stripe',
          status: 'active',
          trial: { start: 0, end: 0 },
        },
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
        expect(firstTeam).toHaveProperty('plan');
        expect(firstTeam).toHaveProperty('type');
      });

      it('includes team plan and type in JSON output', async () => {
        client.setArgv('teams', 'ls', '--format', 'json');
        const exitCode = await teams(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        const firstTeam = jsonOutput.teams[0];

        expect(firstTeam.plan).toBe('pro');
        expect(firstTeam.type).toBe('team');
      });
    });
  });

  describe('current scope metadata', () => {
    it('includes the personal account plan and type in JSON output', async () => {
      const user = useUser({
        billing: {
          addons: [],
          period: { start: 0, end: 0 },
          plan: 'hobby',
          platform: 'stripe',
          status: 'active',
          trial: { start: 0, end: 0 },
        },
      });
      useTeams(undefined, { apiVersion: 2 });
      client.setArgv('teams', 'ls', '--format', 'json');

      const exitCode = await teams(client);
      expect(exitCode).toEqual(0);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      const personalAccount = jsonOutput.teams.find(
        (entry: { id: string }) => entry.id === user.id
      );

      expect(personalAccount).toMatchObject({
        slug: user.username,
        name: user.email,
        current: true,
        plan: 'hobby',
        type: 'user',
      });
    });

    it('marks the configured team as current and renders its plan in the table', async () => {
      useUser();
      const { teams: teamResponse } = useTeams(undefined, { apiVersion: 2 });
      const currentTeam = teamResponse[0];
      client.config.currentTeam = currentTeam.id;
      client.setArgv('teams', 'ls');

      const exitCode = await teams(client);
      expect(exitCode).toEqual(0);

      await expect(client.stderr).toOutput('Plan');
      await expect(client.stderr).toOutput('pro');
      await expect(client.stderr).toOutput(currentTeam.slug);
    });
  });
});
