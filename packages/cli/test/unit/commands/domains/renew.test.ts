import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import renewDomain from '../../../../src/util/domains/renew-domain';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

// Wrap the renew util so individual tests can simulate order-polling
// timeouts without waiting for the real 10s poll window. By default the
// real implementation runs.
vi.mock('../../../../src/util/domains/renew-domain', async importOriginal => {
  const mod =
    await importOriginal<
      typeof import('../../../../src/util/domains/renew-domain')
    >();
  return { ...mod, default: vi.fn(mod.default) };
});

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
      let called = false;
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (_req, res) => {
          called = true;
          res.json({ orderId: 'order_never' });
        }
      );

      client.setArgv('domains', 'renew', 'example.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Renew "example.com" now for $20 (1yr)?'
      );
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(called).toBe(false);

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

    it('reports a declined card when the order fails with payment-failed (exit 1)', async () => {
      useUser();
      useRenewalPrice('example.com');
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (_req, res) => {
          res.json({ orderId: 'order_pay' });
        }
      );
      client.scenario.get('/v1/registrar/orders/order_pay', (_req, res) => {
        res.json({
          orderId: 'order_pay',
          domains: [{ domainName: 'example.com', status: 'failed' }],
          status: 'failed',
          error: { code: 'payment-failed' },
        });
      });

      client.setArgv('domains', 'renew', 'example.com', '--yes');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Your card was declined.');
      await expect(exitCodePromise).resolves.toEqual(1);
    });

    it('warns and exits 0 when order polling times out', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockResolvedValueOnce(null);

      client.setArgv('domains', 'renew', 'example.com', '--yes');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('still processing');
      await expect(exitCodePromise).resolves.toEqual(0);
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
