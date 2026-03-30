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

  describe('--describe', () => {
    it('outputs command schema as JSON and returns 0', async () => {
      client.setArgv('login', '--describe');
      const exitCode = await login(client, { shouldParseArgs: true });
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      const schema = JSON.parse(output);
      expect(schema.name).toBe('login');
      expect(schema.description).toBe('Sign in to your Vercel account.');
      expect(Array.isArray(schema.options)).toBe(true);
      expect(Array.isArray(schema.arguments)).toBe(true);
      expect(Array.isArray(schema.examples)).toBe(true);
    });

    it('includes --dry-run and --describe in schema options', async () => {
      client.setArgv('login', '--describe');
      await login(client, { shouldParseArgs: true });

      const output = client.stdout.getFullOutput();
      const schema = JSON.parse(output);
      const optionNames = schema.options.map((o: { name: string }) => o.name);
      expect(optionNames).toContain('dry-run');
      expect(optionNames).toContain('describe');
    });

    it('does not invoke the login flow', async () => {
      client.setArgv('login', '--describe');
      const futureSpy = vi.spyOn(loginFuture, 'login').mockResolvedValue(0);

      await login(client, { shouldParseArgs: true });
      expect(futureSpy).not.toHaveBeenCalled();

      futureSpy.mockRestore();
    });
  });

  describe('--dry-run', () => {
    it('outputs dry-run actions as JSON in agent mode and returns 0', async () => {
      client.setArgv('login', '--dry-run');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitCode = await login(client, { shouldParseArgs: true });
      expect(exitCode).toBe(0);

      const output = client.stdout.getFullOutput();
      const result = JSON.parse(output);
      expect(result.status).toBe('dry_run');
      expect(result.reason).toBe('dry_run_ok');
      expect(result.message).toBe(
        'Login would initiate OAuth device code flow'
      );
      expect(result.data.actions).toHaveLength(4);
      expect(result.data.actions[0].action).toBe('api_call');
      expect(result.data.actions[1].action).toBe('browser_open');
      expect(result.data.actions[2].action).toBe('poll');
      expect(result.data.actions[3].action).toBe('file_write');
      expect(result.data.actions[3].details).toEqual({
        path: '~/.vercel/auth.json',
      });

      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs human-readable dry-run in interactive mode and returns 0', async () => {
      client.setArgv('login', '--dry-run');
      (client as { nonInteractive: boolean }).nonInteractive = false;

      const exitCode = await login(client, { shouldParseArgs: true });
      expect(exitCode).toBe(0);
    });

    it('does not invoke the login flow', async () => {
      client.setArgv('login', '--dry-run');
      const futureSpy = vi.spyOn(loginFuture, 'login').mockResolvedValue(0);

      await login(client, { shouldParseArgs: true });
      expect(futureSpy).not.toHaveBeenCalled();

      futureSpy.mockRestore();
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
    const exitCode = await login(client, { shouldParseArgs: true });
    expect(exitCode).toBe(0);
    expect(futureSpy).toHaveBeenCalledTimes(1);

    futureSpy.mockRestore();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });
});
