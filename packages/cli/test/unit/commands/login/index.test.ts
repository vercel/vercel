import { describe, expect, it } from 'vitest';
import login from '../../../../src/commands/login';
import { client } from '../../../mocks/client';
import { vi } from 'vitest';

vi.setConfig({ testTimeout: 10000 });

describe('login', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'login';

      client.setArgv(command, '--help');
      const exitCodePromise = login(client, { shouldParseArgs: true });
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should not allow the `--token` flag', async () => {
    client.setArgv('login', '--token', 'foo');
    const exitCodePromise = login(client, { shouldParseArgs: true });
    await expect(client.stderr).toOutput(
      'Error: `--token` may not be used with the "login" command\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "login"').toEqual(2);
  });
});
