import { describe, it, expect, afterEach, vi } from 'vitest';
import project from '../../../../src/commands/project';
import * as list from '../../../../src/commands/project/list';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('project', () => {
  const lsSpy = vi.spyOn(list, 'default').mockResolvedValue(0);

  afterEach(() => {
    lsSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'project';

      client.setArgv(command, '--help');
      const exitCodePromise = project(client);
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
    const user = useUser();
    const args: string[] = [];
    const opts = {};

    client.setArgv('project', ...args);
    await project(client);
    expect(lsSpy).toHaveBeenCalledWith(client, opts, args, user.username);
  });
});
