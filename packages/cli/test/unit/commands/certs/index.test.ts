import { describe, expect, it } from 'vitest';
import certs from '../../../../src/commands/certs';
import { client } from '../../../mocks/client';

describe('certs', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'certs';

      client.setArgv(command, '--help');
      const exitCodePromise = certs(client);
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
    client.setArgv('certs');
    const exitCodePromise = certs(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  describe('unrecognized subcommand', () => {
    it('shows help on unrecognized subcommand', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('certs', ...args);
      const exitCode = await certs(client);
      expect(exitCode).toEqual(2);
    });
  });
});
