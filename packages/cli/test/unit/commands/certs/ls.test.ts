import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useCert } from '../../../mocks/certs';
import certs from '../../../../src/commands/certs';

describe('certs ls', () => {
  describe('invalid argument', () => {
    it('errors', async () => {
      useUser();
      client.setArgv('certs', 'ls', 'balderdash');
      const exitCode = await certs(client);

      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid number of arguments');
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'certs';
      const subcommand = 'ls';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = certs(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should list up to 20 certs by default', async () => {
    useUser();
    useCert();

    client.setArgv('certs', 'ls');
    const exitCodePromise = certs(client);
    await expect(client.stdout).toOutput('dummy-19.cert');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "certs"').toEqual(0);
  });

  it('tracks subcommand invocation', async () => {
    useUser();
    useCert();

    client.setArgv('certs', 'ls');
    const exitCodePromise = certs(client);

    await expect(exitCodePromise).resolves.toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:list',
        value: 'ls',
      },
    ]);
  });

  describe('--next', () => {
    it('tracks usage', async () => {
      useUser();
      useCert();

      client.setArgv('certs', 'ls', '--next', '123456');
      const exitCodePromise = certs(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:next',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--limit', () => {
    it('should list up to 2 certs if limit set to 2', async () => {
      useUser();
      useCert();
      client.setArgv('certs', 'ls', '--limit', '2');
      const exitCodePromise = certs(client);
      await expect(client.stdout).toOutput('dummy-1.cert');
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "certs"').toEqual(0);
    });

    it('tracks usage', async () => {
      useUser();
      useCert();
      client.setArgv('certs', 'ls', '--limit', '2');
      const exitCodePromise = certs(client);

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:list',
          value: 'ls',
        },
        {
          key: 'option:limit',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  it('should show permission error if user does not have permission', async () => {
    useUser();
    client.scenario.get('/v4/certs', (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: "You don't have permission to list the domain certificate.",
        },
      });
    });

    client.setArgv('certs', 'ls');

    const exec = certs(client);

    await expect(exec).rejects.toThrow(
      "You don't have permission to list the domain certificate."
    );
  });
});
