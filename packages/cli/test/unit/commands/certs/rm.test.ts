import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCert } from '../../../mocks/certs';
import certs from '../../../../src/commands/certs';

describe('certs rm', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'certs';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = certs(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should print error with exit code 1 if no arguments are provided', async () => {
    client.setArgv('certs', 'rm');
    const exitCodePromise = certs(client);
    await expect(client.stderr).toOutput(
      'Invalid number of arguments. Usage: `vercel certs delete <id or cn>`'
    );
    await expect(exitCodePromise).resolves.toEqual(2);
  });

  it('should track subcommand invocation', async () => {
    client.setArgv('certs', 'rm');
    const exitCode = await certs(client);
    expect(exitCode, 'exit code for "certs"').toEqual(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:delete',
        value: 'rm',
      },
    ]);
  });

  describe('[id]', () => {
    it('should prompt for confirmation', async () => {
      useUser();
      useCert();

      client.setArgv('certs', 'rm', 'cert-id');
      const exitCodePromise = certs(client);

      await expect(client.stderr).toOutput('Are you sure?');
      client.stdin.write('y');

      await expect(client.stderr).toOutput('Success! 1 Certificate deleted');
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it.each(['delete', 'del'])('runs as %s without a warning', async name => {
      useUser();
      useCert();

      client.setArgv('certs', name, 'cert-id');
      const exitCodePromise = certs(client);

      await expect(client.stderr).toOutput('Are you sure?');
      client.stdin.write('y');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
    });

    it('warns that remove is deprecated', async () => {
      useUser();
      useCert();

      client.setArgv('certs', 'remove', 'cert-id');
      const exitCodePromise = certs(client);

      await expect(client.stderr).toOutput(
        '`vercel certs remove` is deprecated. Use `vercel certs delete`.'
      );
      client.stdin.write('y');
      await expect(exitCodePromise).resolves.toEqual(0);
    });

    it('should track domain / cert id positional argument', async () => {
      useUser();
      useCert();

      client.setArgv('certs', 'rm', 'cert-id');
      const exitCodePromise = certs(client);

      await expect(client.stderr).toOutput('Are you sure?');
      client.stdin.write('y');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:delete',
          value: 'rm',
        },
        {
          key: 'argument:id',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
