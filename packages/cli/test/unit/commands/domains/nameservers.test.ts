import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDomain } from '../../../mocks/domains';

describe('domains nameservers', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'nameservers';

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
    client.setArgv('domains', 'nameservers');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:nameservers',
        value: 'nameservers',
      },
    ]);
  });

  it('rejects --set together with --restore', async () => {
    useUser();
    client.setArgv(
      'domains',
      'nameservers',
      'example.com',
      '--set',
      'ns1.example.com',
      '--restore'
    );
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Cannot use');
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  describe('view', () => {
    it('shows the current nameservers', async () => {
      useUser();
      const domain = useDomain('one');
      client.setArgv('domains', 'nameservers', 'example-one.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Nameservers for "example-one.com"');
      await expect(client.stderr).toOutput(domain.nameservers[0]);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:nameservers',
          value: 'nameservers',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });

    it('outputs pure JSON with --json', async () => {
      useUser();
      const domain = useDomain('one');
      client.setArgv('domains', 'nameservers', 'example-one.com', '--json');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed).toEqual({
        domain: 'example-one.com',
        nameservers: domain.nameservers,
        intendedNameservers: domain.intendedNameservers,
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:nameservers',
          value: 'nameservers',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'flag:json',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--set', () => {
    it('confirms before changing and cancels on decline (exit 0)', async () => {
      useUser();
      let called = false;
      client.scenario.patch(
        '/v1/registrar/domains/example.com/nameservers',
        (_req, res) => {
          called = true;
          res.status(204).end();
        }
      );

      client.setArgv(
        'domains',
        'nameservers',
        'example.com',
        '--set',
        'ns1.example.com,ns2.example.com'
      );
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Set nameservers for "example.com" to ns1.example.com, ns2.example.com?'
      );
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(called).toBe(false);
    });

    it('changes nameservers with --yes and sends the parsed list', async () => {
      useUser();
      let body: Record<string, unknown> | undefined;
      client.scenario.patch(
        '/v1/registrar/domains/example.com/nameservers',
        (req, res) => {
          body = req.body;
          res.status(204).end();
        }
      );

      client.setArgv(
        'domains',
        'nameservers',
        'example.com',
        '--set',
        'ns1.example.com, ns2.example.com',
        '--yes'
      );
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Nameservers for "example.com" set to ns1.example.com, ns2.example.com'
      );
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(body).toEqual({
        nameservers: ['ns1.example.com', 'ns2.example.com'],
      });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:nameservers',
          value: 'nameservers',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'option:set',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('rejects an empty --set list', async () => {
      useUser();
      client.setArgv('domains', 'nameservers', 'example.com', '--set', ' , ');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('No nameservers provided');
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('--restore', () => {
    it('sends an empty list to restore defaults', async () => {
      useUser();
      let body: Record<string, unknown> | undefined;
      client.scenario.patch(
        '/v1/registrar/domains/example.com/nameservers',
        (req, res) => {
          body = req.body;
          res.status(204).end();
        }
      );

      client.setArgv(
        'domains',
        'nameservers',
        'example.com',
        '--restore',
        '--yes'
      );
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        `Restored Vercel's default nameservers for "example.com"`
      );
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(body).toEqual({ nameservers: [] });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:nameservers',
          value: 'nameservers',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'flag:restore',
          value: 'TRUE',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  it('maps domain_not_registered to a friendly error', async () => {
    useUser();
    client.scenario.patch(
      '/v1/registrar/domains/example.com/nameservers',
      (_req, res) => {
        res.status(400).json({
          error: {
            code: 'domain_not_registered',
            message: 'Not registered',
          },
        });
      }
    );

    client.setArgv(
      'domains',
      'nameservers',
      'example.com',
      '--set',
      'ns1.example.com',
      '--yes'
    );
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('is not registered with Vercel');
    await expect(exitCodePromise).resolves.toEqual(1);
  });
});
