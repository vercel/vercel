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
    useUser();
    const args: string[] = [];

    client.setArgv('project', ...args);
    await project(client);
    expect(lsSpy).toHaveBeenCalledWith(client, args);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      useUser();
      const args: string[] = ['not-a-command'];

      client.setArgv('project', ...args);
      const exitCode = await project(client);
      expect(exitCode).toEqual(2);
    });
  });
});
