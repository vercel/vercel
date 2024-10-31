import { describe, it, expect } from 'vitest';
import env from '../../../../src/commands/env';
import { client } from '../../../mocks/client';

describe('env', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'env';

      client.setArgv(command, '--help');
      const exitCodePromise = env(client);
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
    client.setArgv('env');
    const exitCodePromise = env(client);
    await expect(exitCodePromise).resolves.toBe(1);
  });
});
