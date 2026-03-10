import { describe, expect, it, vi } from 'vitest';
import login from '../../../../src/commands/login';
import { client } from '../../../mocks/client';

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

  it('outputs action_required in non-interactive mode with no args', async () => {
    client.setArgv('login');
    (client as { nonInteractive: boolean }).nonInteractive = true;

    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined as unknown as void);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);

    await expect(login(client, { shouldParseArgs: true })).rejects.toThrow(
      'exit'
    );

    expect(logSpy).toHaveBeenCalled();
    const [[output]] = logSpy.mock.calls;
    const payload = JSON.parse(output as string);
    expect(payload.status).toBe('action_required');
    expect(payload.reason).toBe('login_passcode_required');
    expect(payload.action).toBe('login_passcode_required');
    expect(payload.message).toContain('generate a login passcode');
    expect(payload.verification_uri).toBe('https://vercel.com/login/generate');
    expect(Array.isArray(payload.next)).toBe(true);
    expect(payload.next[0].command).toContain('login --passcode');

    logSpy.mockRestore();
    exitSpy.mockRestore();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });
});
