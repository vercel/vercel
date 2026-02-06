import { afterEach, describe, expect, it, vi } from 'vitest';
import webhooks from '../../../../src/commands/webhooks';
import * as ls from '../../../../src/commands/webhooks/ls';
import { client } from '../../../mocks/client';

describe('webhooks', () => {
  const lsSpy = vi.spyOn(ls, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'webhooks';

      client.setArgv(command, '--help');
      const exitCodePromise = webhooks(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to ls subcommand by default', async () => {
    const args: string[] = [];

    client.setArgv('webhooks', ...args);
    await webhooks(client);
    expect(lsSpy).toHaveBeenCalledWith(client, args);
  });

  describe('unrecognized subcommand', () => {
    it('routes to ls', async () => {
      const args: string[] = ['not-a-command'];

      client.setArgv('webhooks', ...args);
      await webhooks(client);
      expect(lsSpy).toHaveBeenCalledWith(client, args);
    });
  });
});
