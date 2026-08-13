import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains auto-renew', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'auto-renew';

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

  it('errors and tracks subcommand usage when no arguments are given', async () => {
    useUser();
    client.setArgv('domains', 'auto-renew');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:auto-renew',
        value: 'auto-renew',
      },
    ]);
  });

  it('rejects an invalid state', async () => {
    useUser();
    client.setArgv('domains', 'auto-renew', 'example.com', 'maybe');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Invalid state "maybe"');
    await expect(exitCodePromise).resolves.toEqual(1);

    // `state` is only recorded for the `on`/`off` enum, never arbitrary values.
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:auto-renew',
        value: 'auto-renew',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
    ]);
  });

  describe('on', () => {
    it('turns auto-renew on and records the enum value', async () => {
      useUser();
      let body: Record<string, unknown> | undefined;
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (req, res) => {
          body = req.body;
          res.status(204).end();
        }
      );

      client.setArgv('domains', 'auto-renew', 'example.com', 'on');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Automatic renewal turned on for "example.com"'
      );
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(body).toEqual({ autoRenew: true });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:auto-renew',
          value: 'auto-renew',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'argument:state',
          value: 'on',
        },
      ]);
    });
  });

  describe('off', () => {
    it('turns auto-renew off', async () => {
      useUser();
      let body: Record<string, unknown> | undefined;
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (req, res) => {
          body = req.body;
          res.status(204).end();
        }
      );

      client.setArgv('domains', 'auto-renew', 'example.com', 'off');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Automatic renewal turned off for "example.com"'
      );
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(body).toEqual({ autoRenew: false });
    });
  });

  it('maps domain_not_registered to a friendly error', async () => {
    useUser();
    client.scenario.patch(
      '/v1/registrar/domains/example.com/auto-renew',
      (_req, res) => {
        res.status(400).json({
          error: {
            code: 'domain_not_registered',
            message: 'Not registered',
          },
        });
      }
    );

    client.setArgv('domains', 'auto-renew', 'example.com', 'on');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('is not registered with Vercel');
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
