import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

function useRenewalPrice(
  domain: string,
  price: { renewalPrice: number | null; years: number } = {
    renewalPrice: 20,
    years: 1,
  }
) {
  client.scenario.get(`/v1/registrar/domains/${domain}/price`, (_req, res) => {
    res.json({
      purchasePrice: 20,
      renewalPrice: price.renewalPrice,
      transferPrice: null,
      years: price.years,
    });
  });
}

describe('domains renew', () => {
  let origCI: string | undefined;

  beforeAll(() => {
    origCI = process.env.CI;
    delete process.env.CI;
  });

  afterAll(() => {
    process.env.CI = origCI;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'renew';

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
    client.setArgv('domains', 'renew');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:renew',
        value: 'renew',
      },
    ]);
  });

  describe('confirmation', () => {
    it('shows the renewal price and cancels on decline (exit 0)', async () => {
      useUser();
      useRenewalPrice('example.com');

      client.setArgv('domains', 'renew', 'example.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Renew "example.com" now for $20 (1yr)?'
      );
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:renew',
          value: 'renew',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--yes', () => {
    it('renews without prompting and sends expectedPrice and years', async () => {
      useUser();
      useRenewalPrice('example.com', { renewalPrice: 20, years: 2 });

      let renewBody: Record<string, unknown> | undefined;
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (req, res) => {
          renewBody = req.body;
          res.json({ orderId: 'order_1' });
        }
      );
      client.scenario.get('/v1/registrar/orders/order_1', (_req, res) => {
        res.json({
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'completed' }],
          status: 'completed',
        });
      });

      client.setArgv('domains', 'renew', 'example.com', '--yes');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      expect(renewBody).toEqual({ expectedPrice: 20, years: 2 });

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:renew',
          value: 'renew',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });

    it('maps expected_price_mismatch to a friendly error (exit 1)', async () => {
      useUser();
      useRenewalPrice('example.com');
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (_req, res) => {
          res.status(400).json({
            error: {
              code: 'expected_price_mismatch',
              message: 'Price changed',
            },
          });
        }
      );

      client.setArgv('domains', 'renew', 'example.com', '--yes');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('renewal price');
      await expect(exitCodePromise).resolves.toEqual(1);
    });
  });

  describe('non-interactive mode', () => {
    it('emits confirmation_required and does not prompt without --yes', async () => {
      useUser();
      useRenewalPrice('example.com');
      client.nonInteractive = true;
      const logSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => undefined as unknown as void);
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('domains', 'renew', 'example.com', '--non-interactive');
      await expect(domains(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('confirmation_required');
      expect(payload.message).toContain('--yes');

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });
  });
});
