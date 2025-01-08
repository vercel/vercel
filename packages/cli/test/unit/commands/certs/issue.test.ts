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
      const exitCode = await certs(client);
      expect(exitCode).toEqual(2);

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
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(1);
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
    const exitCodePromise = certs(client);
    await expect(client.stderr).toOutput('Issuing a certificate for acme.com');
    await expect(client.stderr).toOutput(
      'Success! Certificate entry for acme.com created'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode).toEqual(0);
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
      const exitCodePromise = certs(client);
      await expect(client.stderr).toOutput(
        'A certificate issuance for acme.com has been started'
      );
      await expect(client.stderr).toOutput(
        `Add the following TXT records with your registrar to be able to the solve the DNS challenge:`
      );

      const table = client.stdout.getFullOutput().split('\n');
      expect(table.length).toEqual(3);
      expect(table[0].split(/\s+/)).toEqual(['_acme-challenge', 'TXT', '']);

      await expect(client.stderr).toOutput(
        'To issue the certificate once the records are added, run'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });
  });

  describe('--overwrite', () => {
    it('exit code 1 for deprecated `--overwrite` flag', async () => {
      client.setArgv('certs', 'issue', '--overwrite');
      const exitCodePromise = certs(client);
      await expect(client.stderr).toOutput('Overwrite option is deprecated');
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
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
