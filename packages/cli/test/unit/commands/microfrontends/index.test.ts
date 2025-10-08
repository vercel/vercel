import { describe, it, expect, afterEach, vi } from 'vitest';
import microfrontends from '../../../../src/commands/microfrontends';
import * as pull from '../../../../src/commands/microfrontends/pull';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('microfrontends', () => {
  const pullSpy = vi.spyOn(pull, 'default').mockResolvedValue(0);

  afterEach(() => {
    pullSpy.mockClear();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'microfrontends';

      client.setArgv(command, '--help');
      const exitCodePromise = microfrontends(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('routes to pull subcommand', async () => {
    useUser();
    client.setArgv('microfrontends', 'pull');
    await microfrontends(client);
    expect(pullSpy).toHaveBeenCalledWith(client);
  });

  describe('unrecognized subcommand', () => {
    it('shows help', async () => {
      useUser();
      const args: string[] = ['not-a-command'];

      client.setArgv('microfrontends', ...args);
      const exitCode = await microfrontends(client);
      expect(exitCode).toEqual(2);
    });
  });
});
