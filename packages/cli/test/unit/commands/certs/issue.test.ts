import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import certs from '../../../../src/commands/certs';
import { useUser } from '../../../mocks/user';

describe('certs issue', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'certs';
      const subcommand = 'issue';

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

  it('exit code 1 for missing options', async () => {
    client.setArgv('certs', 'issue');
    const exitCodePromise = certs(client);
    await expect(client.stderr).toOutput(
      'Invalid number of arguments to create a custom certificate entry. Usage:'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should issue cert', async () => {
    useUser();
    client.scenario.post('/v3/certs', (_, res) => {
      return res.json({});
    });
    client.scenario.patch('/v3/certs', (_, res) => {
      return res.json({ cns: ['acme.com'] });
    });

    client.setArgv('certs', 'issue', 'acme.com');
    const exitCode = certs(client);
    await expect(client.stderr).toOutput('Issuing a certificate for acme.com');
    await expect(client.stderr).toOutput(
      'Success! Certificate entry for acme.com created'
    );
    await expect(exitCode).resolves.toEqual(0);
  });

  it('should track subcommand usage', async () => {
    client.setArgv('certs', 'issue');
    const exitCode = await certs(client);
    expect(exitCode, 'exit code for "certs"').toEqual(1);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:issue',
        value: 'issue',
      },
    ]);
  });

  describe('--challenge-only', () => {
    it('should track usage of `--challenge-only` flag', async () => {
      client.setArgv('certs', 'issue', '--challenge-only');
      const exitCode = await certs(client);
      expect(exitCode, 'exit code for "certs"').toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:issue',
          value: 'issue',
        },
        {
          key: 'flag:challenge-only',
          value: 'TRUE',
        },
      ]);
    });

    it('should handle challenges', async () => {
      useUser();
      client.scenario.post('/v3/certs', (_, res) => {
        return res.json({});
      });
      client.scenario.patch('/v3/certs', (_, res) => {
        return res.json({
          cns: ['acme.com'],
          challengesToResolve: [{ domain: 'acme.com', status: 'pending' }],
        });
      });

      client.setArgv('certs', 'issue', 'acme.com', '--challenge-only');
      const exitCode = certs(client);
      await expect(client.stderr).toOutput(
        'A certificate issuance for acme.com has been started'
      );
      await expect(exitCode).resolves.toEqual(0);
    });
  });

  describe('--overwrite', () => {
    it('exit code 1 for deprecated `--overwrite` flag', async () => {
      client.setArgv('certs', 'issue', '--overwrite');
      const exitCodePromise = certs(client);
      await expect(client.stderr).toOutput('Overwrite option is deprecated');
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('should track usage of deprecated `--overwrite` flag', async () => {
      client.setArgv('certs', 'issue', '--overwrite');
      const exitCode = await certs(client);
      expect(exitCode, 'exit code for "certs"').toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:issue',
          value: 'issue',
        },
        {
          key: 'flag:overwrite',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--crt', () => {
    it('should track usage of `--crt` flag', async () => {
      client.setArgv('certs', 'issue', '--crt', 'path/to/crt');
      const exitCode = await certs(client);
      expect(exitCode, 'exit code for "certs"').toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:issue',
          value: 'issue',
        },
        {
          key: 'option:crt',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--key', () => {
    it('should track usage of `--key` flag', async () => {
      client.setArgv('certs', 'issue', '--key', 'path/to/key');
      const exitCode = await certs(client);
      expect(exitCode, 'exit code for "certs"').toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:issue',
          value: 'issue',
        },
        {
          key: 'option:key',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--ca', () => {
    it('should track usage of `--ca` flag', async () => {
      client.setArgv('certs', 'issue', '--ca', 'path/to/ca');
      const exitCode = await certs(client);
      expect(exitCode, 'exit code for "certs"').toEqual(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:issue',
          value: 'issue',
        },
        {
          key: 'option:ca',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
