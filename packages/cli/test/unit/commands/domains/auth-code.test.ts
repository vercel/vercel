import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains auth-code', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'auth-code';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('errors and tracks subcommand usage when no domain is given', async () => {
    useUser();
    client.setArgv('domains', 'auth-code');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:auth-code',
        value: 'auth-code',
      },
    ]);
  });

  it('prints only the code on stdout and warns on stderr', async () => {
    useUser();
    client.scenario.get(
      '/v1/registrar/domains/example.com/auth-code',
      (_req, res) => {
        res.json({ authCode: 'SECRET-EPP-CODE-123' });
      }
    );

    client.setArgv('domains', 'auth-code', 'example.com');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('sensitive transfer-out auth code');
    await expect(exitCodePromise).resolves.toEqual(0);

    // stdout carries only the code (pipeable), never prose.
    expect(client.stdout.getFullOutput()).toEqual('SECRET-EPP-CODE-123\n');
    expect(client.stderr.getFullOutput()).not.toContain('SECRET-EPP-CODE-123');

    // The code itself must never reach telemetry; only the redacted domain.
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:auth-code',
        value: 'auth-code',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
    ]);
    const recordedValues = client.telemetryEventStore.readonlyEvents.map(
      event => event.value
    );
    expect(recordedValues).not.toContain('SECRET-EPP-CODE-123');
  });

  it('maps domain_cannot_be_transfered_out_until to a friendly error', async () => {
    useUser();
    client.scenario.get(
      '/v1/registrar/domains/example.com/auth-code',
      (_req, res) => {
        res.status(400).json({
          error: {
            code: 'domain_cannot_be_transfered_out_until',
            message: 'Domain cannot be transferred out until 2027-01-01',
          },
        });
      }
    );

    client.setArgv('domains', 'auth-code', 'example.com');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('cannot be transferred out');
    await expect(exitCodePromise).resolves.toEqual(1);
    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('maps domain_not_found to a friendly error', async () => {
    useUser();
    client.scenario.get(
      '/v1/registrar/domains/example.com/auth-code',
      (_req, res) => {
        res.status(404).json({
          error: {
            code: 'domain_not_found',
            message: 'Domain not found',
          },
        });
      }
    );

    client.setArgv('domains', 'auth-code', 'example.com');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('not found');
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
