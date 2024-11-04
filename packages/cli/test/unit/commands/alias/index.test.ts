import { describe, it, expect, afterEach, vi } from 'vitest';
import alias from '../../../../src/commands/alias';
import * as set from '../../../../src/commands/alias/set';
import { client } from '../../../mocks/client';

describe('alias', () => {
  const setSpy = vi.spyOn(set, 'default').mockResolvedValue(0);

  afterEach(() => {
    setSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'alias';

      client.setArgv(command, '--help');
      const exitCodePromise = alias(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to set subcommand', async () => {
    const args = ['dpl_123', 'example.com'];

    client.setArgv('alias', ...args);
    await alias(client);
    expect(setSpy).toHaveBeenCalledWith(client);
  });

  describe('unrecognized subcommand', () => {
    it('routes to set', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('alias', ...args);
      await alias(client);
      expect(setSpy).toHaveBeenCalledWith(client);
    });
  });
});
