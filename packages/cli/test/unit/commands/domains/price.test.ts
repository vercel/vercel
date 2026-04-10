import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

describe('domains price', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'price';

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

  describe('[name]', () => {
    it('should track subcommand usage and domain argument', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 15,
            renewalPrice: 20,
            transferPrice: 10,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:price',
          value: 'price',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });

    it('should display price information for a domain', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 15,
            renewalPrice: 20,
            transferPrice: 10,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com');
      const exitCode = await domains(client);

      await expect(client.stderr).toOutput('Registrar pricing for example.com');
      await expect(client.stderr).toOutput('Purchase: $15');
      await expect(client.stderr).toOutput('Renewal:  $20');
      await expect(client.stderr).toOutput('Transfer: $10');
      await expect(client.stderr).toOutput('Term:     1 year(s)');
      expect(exitCode).toEqual(0);
    });

    it('should display n/a for null prices', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 15,
            renewalPrice: 20,
            transferPrice: null,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com');
      const exitCode = await domains(client);

      await expect(client.stderr).toOutput('Transfer: n/a');
      expect(exitCode).toEqual(0);
    });
  });

  describe('--format json', () => {
    it('should output JSON to stdout', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 15,
            renewalPrice: 20,
            transferPrice: 10,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com', '--format', 'json');
      const exitCode = await domains(client);

      const output = client.stdout.read();
      const parsed = JSON.parse(output);
      expect(parsed).toEqual({
        domain: 'example.com',
        purchasePrice: 15,
        renewalPrice: 20,
        transferPrice: 10,
        years: 1,
      });
      expect(exitCode).toEqual(0);
    });

    it('should output error JSON for unsupported TLD', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.xyz/price',
        (req, res) => {
          return res.status(400).json({
            error: {
              code: 'tld_not_supported',
              message: 'TLD not supported',
            },
          });
        }
      );

      client.setArgv('domains', 'price', 'example.xyz', '--format', 'json');
      const exitCode = await domains(client);

      const output = client.stdout.read();
      const parsed = JSON.parse(output);
      expect(parsed.error).toEqual('unsupported_tld');
      expect(parsed.message).toContain('TLD not supported');
      expect(exitCode).toEqual(1);
    });

    it('should output error JSON for invalid domain', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/invalid%20domain/price',
        (req, res) => {
          return res.status(400).json({
            error: {
              code: 'invalid_domain',
              message: 'Invalid domain name',
            },
          });
        }
      );

      client.setArgv('domains', 'price', 'invalid domain', '--format', 'json');
      const exitCode = await domains(client);

      const output = client.stdout.read();
      const parsed = JSON.parse(output);
      expect(parsed.error).toBeDefined();
      expect(exitCode).toEqual(1);
    });

    it('tracks telemetry for --format json', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (req, res) => {
          return res.json({
            purchasePrice: 15,
            renewalPrice: 20,
            transferPrice: 10,
            years: 1,
          });
        }
      );

      client.setArgv('domains', 'price', 'example.com', '--format', 'json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:price',
          value: 'price',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'option:format',
          value: 'json',
        },
      ]);
    });
  });

  describe('errors', () => {
    it('should error when domain argument is missing', async () => {
      useUser();
      client.setArgv('domains', 'price');
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput(
        'Missing domain name. Usage: `vercel domains price <domain>`'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should handle unsupported TLD error', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.xyz/price',
        (req, res) => {
          return res.status(400).json({
            error: {
              code: 'tld_not_supported',
              message: 'TLD not supported',
            },
          });
        }
      );

      client.setArgv('domains', 'price', 'example.xyz');
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput(
        'TLD not supported for price lookup: example.xyz'
      );
      expect(await exitCodePromise).toEqual(1);
    });

    it('should handle invalid domain error', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/invalid%20domain/price',
        (req, res) => {
          return res.status(400).json({
            error: {
              code: 'invalid_domain',
              message: 'Invalid domain name',
            },
          });
        }
      );

      client.setArgv('domains', 'price', 'invalid domain');
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput('Invalid domain: invalid domain');
      expect(await exitCodePromise).toEqual(1);
    });
  });
});
