import { describe, it, expect, afterEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import * as ls from '../../../../src/commands/flags/ls';
import { client } from '../../../mocks/client';

describe('flags', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'flags';

      client.setArgv(command, '--help');
      const exitCodePromise = flags(client);
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
    const args: string[] = [];

    client.setArgv('flags', ...args);
    await flags(client);
    expect(lsSpy).toHaveBeenCalledWith(client, args);
  });

  describe('unrecognized subcommand', () => {
    it('routes to ls', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('flags', ...args);
      await flags(client);
      expect(lsSpy).toHaveBeenCalledWith(client, args);
    });
  });
});
