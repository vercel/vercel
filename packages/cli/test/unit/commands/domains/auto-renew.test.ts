import { describe, expect, it, vi } from 'vitest';
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

  describe('non-interactive mode', () => {
    it('emits a structured success payload when turning auto-renew on', async () => {
      useUser();
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (_req, res) => {
          res.status(204).end();
        }
      );

      client.nonInteractive = true;
      client.setArgv(
        'domains',
        'auto-renew',
        'example.com',
        'on',
        '--non-interactive'
      );
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'ok',
        domain: 'example.com',
        autoRenew: true,
        message: 'Automatic renewal turned on for example.com',
      });

      client.nonInteractive = false;
    });

    it('emits a structured success payload when turning auto-renew off', async () => {
      useUser();
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (_req, res) => {
          res.status(204).end();
        }
      );

      client.nonInteractive = true;
      client.setArgv(
        'domains',
        'auto-renew',
        'example.com',
        'off',
        '--non-interactive'
      );
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'ok',
        domain: 'example.com',
        autoRenew: false,
        message: 'Automatic renewal turned off for example.com',
      });

      client.nonInteractive = false;
    });

    it('emits a structured error for an invalid state', async () => {
      useUser();
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);
      client.nonInteractive = true;
      client.setArgv(
        'domains',
        'auto-renew',
        'example.com',
        'maybe',
        '--non-interactive'
      );

      await domains(client);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toContain('Invalid state "maybe"');
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });

  describe('--json output', () => {
    it('emits JSON on stdout when turning auto-renew on', async () => {
      useUser();
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (_req, res) => {
          res.status(204).end();
        }
      );

      client.setArgv('domains', 'auto-renew', 'example.com', 'on', '--json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'ok',
        domain: 'example.com',
        autoRenew: true,
        message: 'Automatic renewal turned on for example.com',
      });
    });

    it('emits a JSON error on stdout when the API fails', async () => {
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

      client.setArgv('domains', 'auto-renew', 'example.com', 'on', '--json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'error',
        reason: 'domain_not_registered',
        domain: 'example.com',
        message: 'The domain example.com is not registered with Vercel.',
      });
    });

    it('emits a JSON error on stdout for an invalid state', async () => {
      useUser();
      client.setArgv('domains', 'auto-renew', 'example.com', 'maybe', '--json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.domain).toBe('example.com');
      expect(payload.message).toContain('Invalid state "maybe"');
    });
  });

  describe('non-TTY (piped) accommodation', () => {
    it('emits JSON on stdout when stdin is not a TTY, without --json or --non-interactive', async () => {
      useUser();
      client.scenario.patch(
        '/v1/registrar/domains/example.com/auto-renew',
        (_req, res) => {
          res.status(204).end();
        }
      );

      client.stdin.isTTY = false;
      client.setArgv('domains', 'auto-renew', 'example.com', 'on');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'ok',
        domain: 'example.com',
        autoRenew: true,
        message: 'Automatic renewal turned on for example.com',
      });

      client.stdin.isTTY = true;
    });

    it('emits a JSON error on stdout when stdin is not a TTY', async () => {
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

      client.stdin.isTTY = false;
      client.setArgv('domains', 'auto-renew', 'example.com', 'on');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toEqual({
        status: 'error',
        reason: 'domain_not_registered',
        domain: 'example.com',
        message: 'The domain example.com is not registered with Vercel.',
      });

      client.stdin.isTTY = true;
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

  it('surfaces the server message for an unrecognized API error', async () => {
    useUser();
    client.scenario.patch(
      '/v1/registrar/domains/example.com/auto-renew',
      (_req, res) => {
        res.status(422).json({
          error: {
            code: 'domain_locked_by_registrar',
            message: 'The domain is locked by its registrar.',
          },
        });
      }
    );

    client.setArgv('domains', 'auto-renew', 'example.com', 'on');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput(
      'The domain is locked by its registrar.'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
