import { describe, expect, it, vi } from 'vitest';
import login from '../../../../src/commands/login';
import { client } from '../../../mocks/client';
import * as loginFuture from '../../../../src/commands/login/future';

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

  it('continues to login flow in non-interactive mode with no args', async () => {
    client.setArgv('login');
    (client as { nonInteractive: boolean }).nonInteractive = true;

    const futureSpy = vi.spyOn(loginFuture, 'login').mockResolvedValue(0);
    const exitCodePromise = login(client, { shouldParseArgs: true });
    await expect(exitCodePromise).rejects.toThrowError(
      'process.exit unexpectedly called with "1"'
    );
    expect(futureSpy).toHaveBeenCalledTimes(0);
    await expect(client.stdout).toOutput(
      'Visit https://vercel.com/login/generate to generate a login passcode, then run \'vc login --passcode <passcode>\'\n{\n  "status": "action_required",\n  "action": "login_passcode_required",\n  "message": "Visit https://vercel.com/login/generate to generate a login passcode, then run \'vc login --passcode <passcode>\'",\n  "verification_uri": "https://vercel.com/login/generate",\n  "next": [\n    {\n      "command": "vc login --passcode <passcode>"\n    }\n  ],\n  "hint": "Run one of the commands in next[] to complete without prompting."\n}\n'
    );

    futureSpy.mockRestore();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });

  it('passes --passcode through to login flow', async () => {
    client.setArgv('login', '--passcode', 'ABCD-1234');
    (client as { nonInteractive: boolean }).nonInteractive = true;

    const futureSpy = vi.spyOn(loginFuture, 'login').mockResolvedValue(0);
    const exitCode = await login(client, { shouldParseArgs: true });
    expect(exitCode).toBe(0);
    expect(futureSpy).toHaveBeenCalledTimes(1);
    expect(futureSpy).toHaveBeenCalledWith(client, expect.anything());

    futureSpy.mockRestore();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });
});
