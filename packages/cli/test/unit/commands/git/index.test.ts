import { describe, it, expect } from 'vitest';
import git from '../../../../src/commands/git';
import { client } from '../../../mocks/client';

// this requires mocking a linked project
describe.todo('git', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'git';

      client.setArgv(command, '--help');
      const exitCodePromise = git(client);
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
    client.setArgv('git');
    const exitCodePromise = git(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });
});
