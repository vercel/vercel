import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import renewDomain from '../../../../src/util/domains/renew-domain';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

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
      client.setArgv('domains', 'renew', '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'domains:renew' },
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
  });

  describe('confirmation', () => {
    it('renews after confirmation and sends expectedPrice and years', async () => {
      useUser();
      useRenewalPrice('example.com', { renewalPrice: 20, years: 2 });
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);

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

      client.setArgv('domains', 'renew', 'example.com');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      expect(confirmSpy).toHaveBeenCalled();
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
      ]);

      confirmSpy.mockRestore();
    });

    it.each([
      {
        name: 'reports a declined card when the order fails with payment-failed (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'failed' as const }],
          status: 'failed' as const,
          error: { code: 'payment-failed' as const },
        },
        expected: 'Your card was declined.',
        exitCode: 1,
      },
      {
        name: 'warns and exits 0 when order polling times out',
        outcome: null,
        expected: 'still processing',
        exitCode: 0,
      },
      {
        name: 'maps expected_price_mismatch to a friendly error (exit 1)',
        outcome: Object.assign(new Error('Price changed'), {
          status: 400,
          code: 'expected_price_mismatch',
        }),
        expected: 'renewal price',
        exitCode: 1,
      },
      {
        name: 'fails when the order completes but the domain item was refunded (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'refunded' as const }],
          status: 'completed' as const,
        },
        expected: 'refunded',
        exitCode: 1,
      },
      {
        name: 'fails when the order completes but the domain item did not (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'failed' as const }],
          status: 'completed' as const,
        },
        expected: 'did not complete',
        exitCode: 1,
      },
    ])('$name', async ({ outcome, expected, exitCode }) => {
      useUser();
      useRenewalPrice('example.com');
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);
      if (outcome instanceof Error) {
        vi.mocked(renewDomain).mockRejectedValueOnce(outcome);
      } else {
        vi.mocked(renewDomain).mockResolvedValueOnce(outcome);
      }

      client.setArgv('domains', 'renew', 'example.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(expected);
      await expect(exitCodePromise).resolves.toEqual(exitCode);

      confirmSpy.mockRestore();
    });
  });

  describe('non-interactive mode', () => {
    it('refuses with an action_required confirmation_required payload and never charges', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      client.nonInteractive = true;
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('exit');
      }) as () => never);

      client.setArgv('domains', 'renew', 'example.com', '--non-interactive');
      await expect(domains(client)).rejects.toThrow('exit');

      const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        action: 'confirmation_required',
      });
      expect(payload.message).not.toContain('--yes');
      expect(renewDomain).not.toHaveBeenCalled();

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('does not prompt and exits non-zero on non-TTY stdin', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      const confirmSpy = vi.spyOn(client.input, 'confirm');
      client.stdin.isTTY = false;

      client.setArgv('domains', 'renew', 'example.com');
      const exitCode = await domains(client);

      expect(exitCode).toEqual(1);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(renewDomain).not.toHaveBeenCalled();
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('interactively');
      expect(stderr).not.toContain('--yes');

      confirmSpy.mockRestore();
      client.stdin.isTTY = true;
    });

    it('emits parseable JSON on success with --json and does not print human prose', async () => {
      useUser();
      useRenewalPrice('example.com', { renewalPrice: 20, years: 2 });
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (_req, res) => {
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

      client.setArgv('domains', 'renew', 'example.com', '--json');
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        domain: 'example.com',
        term: '2yrs',
        years: 2,
        price: 20,
        orderId: 'order_1',
      });
      expect(client.stderr.getFullOutput()).not.toContain('renewed');

      confirmSpy.mockRestore();
    });
  });
});
