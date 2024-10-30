import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import teams from '../../../../src/commands/teams';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

describe('teams ls', () => {
  describe('non-northstar', () => {
    it('should display your personal account', async () => {
      const user = useUser();
      useTeams(undefined, { apiVersion: 2 });
      client.setArgv('teams', 'ls');
      const exitCodePromise = teams(client);
      await expect(client.stderr).toOutput(user.username);
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'list',
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
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('--next option should be tracked', async () => {
      client.setArgv('teams', 'list', '--next', '1584722256178');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'list' },
        { key: 'option:next', value: '[REDACTED]' },
      ]);
    });

    describe('depreated flags', () => {
      it('--until option should be tracked', async () => {
        client.setArgv('teams', 'list', '--until', '1584722256178');
        const exitCodePromise = teams(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:until', value: '[REDACTED]' },
        ]);
      });

      it('--count option should be tracked', async () => {
        client.setArgv('teams', 'list', '--count', '3');
        const exitCodePromise = teams(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:count', value: '[REDACTED]' },
        ]);
      });

      it('--since option should be tracked', async () => {
        client.setArgv('teams', 'list', '--since', '31584722256178');
        const exitCodePromise = teams(client);
        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          { key: 'subcommand:list', value: 'list' },
          { key: 'option:since', value: '[REDACTED]' },
        ]);
      });
    });
  });
});
