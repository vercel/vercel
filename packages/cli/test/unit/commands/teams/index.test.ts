import { describe, it, expect } from 'vitest';
import teams from '../../../../src/commands/teams';
import { client } from '../../../mocks/client';

describe('teams', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'teams';

      client.setArgv(command, '--help');
      const exitCodePromise = teams(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('errors when invoked without subcommand', async () => {
    client.setArgv('teams');
    const exitCodePromise = teams(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });
});
