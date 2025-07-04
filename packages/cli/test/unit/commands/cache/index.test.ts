import { describe, it, expect } from 'vitest';
import cache from '../../../../src/commands/cache';
import { client } from '../../../mocks/client';

const command = 'cache';

describe('cache', () => {
  it('should track telemetry with --help', async () => {
    client.setArgv(command, '--help');
    const exitCodePromise = cache(client);
    await expect(exitCodePromise).resolves.toEqual(2);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:help',
        value: command,
      },
    ]);
  });

  it('should error when missing subcommand', async () => {
    client.setArgv(command);
    const exitCodePromise = cache(client);
    await expect(exitCodePromise).resolves.toBe(2);
  });

  it('should error when invalid subcommand', async () => {
    const args: string[] = ['not-a-command'];
    client.setArgv(command, ...args);
    const exitCode = await cache(client);
    expect(exitCode).toEqual(2);
  });
});
