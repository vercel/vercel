import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import target from '../../../../src/commands/target';

describe('target', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'target';

      client.setArgv(command, '--help');
      const exitCodePromise = target(client);
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
    client.setArgv('target');
    const exitCodePromise = target(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  it('should reject invalid arguments', async () => {
    client.setArgv('target', '--invalid');
    const exitCodePromise = target(client);
    await expect(exitCodePromise).resolves.toBe(1);
  });
});
