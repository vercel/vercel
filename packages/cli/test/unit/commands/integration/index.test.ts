import { describe, it, expect } from 'vitest';
import integration from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';

describe('integration', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'integration';

      client.setArgv(command, '--help');
      const exitCodePromise = integration(client);
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
    client.setArgv('integration');
    const exitCodePromise = integration(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('integration', ...args);
      const exitCode = await integration(client);
      expect(exitCode).toEqual(2);
    });
  });
});
