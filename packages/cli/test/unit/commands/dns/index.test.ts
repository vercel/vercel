import { describe, it, expect, afterEach, vi } from 'vitest';
import dns from '../../../../src/commands/dns';
import * as ls from '../../../../src/commands/dns/ls';
import { client } from '../../../mocks/client';

describe('dns', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dns';

      client.setArgv(command, '--help');
      const exitCodePromise = dns(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to ls subcommand', async () => {
    const args = ['example.com'];

    client.setArgv('dns', ...args);
    await dns(client);
    expect(lsSpy).toHaveBeenCalledWith(client, args);
  });

  describe('unrecognized subcommand', () => {
    it('routes to ls', async () => {
      const args: string[] = ['not-a-command', 'example.com'];

      client.setArgv('dns', ...args);
      await dns(client);
      expect(lsSpy).toHaveBeenCalledWith(client, args);
    });
  });
});
