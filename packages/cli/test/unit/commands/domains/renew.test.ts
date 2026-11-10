import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import renewDomain from '../../../../src/util/domains/renew-domain';
import { DomainChargeOutcomeUnknown } from '../../../../src/util/errors-ts';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

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
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'domains:renew' },
      ]);
    });
  });

  it('errors and tracks subcommand usage when no domain is given', async () => {
    useUser();
    client.setArgv('domains', 'renew');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(2);

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
      'Renew "example.com" now for $20.00 (1 year)?'
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
        name: 'says to inspect, not retry, when order polling times out (exit 1)',
        outcome: new DomainChargeOutcomeUnknown('example.com', 'renew'),
        expected: "Can't confirm whether example.com was renewed",
        exitCode: 1,
      },
      {
        name: 'maps expected_price_mismatch to price_changed (exit 1)',
        outcome: Object.assign(new Error('Price changed'), {
          status: 400,
          code: 'expected_price_mismatch',
        }),
        expected: 'Its price changed from $20.00. Nothing was charged.',
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
        name: 'says the refund also failed when it did (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [
            { domainName: 'example.com', status: 'refund-failed' as const },
          ],
          status: 'completed' as const,
        },
        expected: 'refunding the charge also failed',
        exitCode: 1,
      },
      {
        name: 'fails when the order completes but the domain item failed (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'failed' as const }],
          status: 'completed' as const,
        },
        expected: 'Renewal for example.com failed.',
        exitCode: 1,
      },
      {
        name: 'says to inspect, not retry, when the domain item is still pending (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'pending' as const }],
          status: 'completed' as const,
        },
        expected: 'domains inspect example.com',
        exitCode: 1,
      },
      {
        name: 'reports a failed order as failed, not as an unknown outcome (exit 1)',
        outcome: {
          orderId: 'order_1',
          domains: [{ domainName: 'example.com', status: 'failed' as const }],
          status: 'failed' as const,
        },
        expected: 'Renewal for example.com failed.',
        exitCode: 1,
      },
      {
        name: "keeps the API's explanation when it rejects the renewal (exit 1)",
        outcome: Object.assign(
          new Error('This domain is locked and cannot be renewed.'),
          {
            status: 400,
            code: 'domain_locked',
            serverMessage: 'This domain is locked and cannot be renewed.',
          }
        ),
        expected: 'This domain is locked and cannot be renewed.',
        exitCode: 1,
      },
    ])('$name', async ({ outcome, expected, exitCode }) => {
      useUser();
      useRenewalPrice('example.com');
      const confirmSpy = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(true);
      // An unknown outcome is returned, not thrown; other errors are thrown.
      if (
        outcome instanceof Error &&
        !(outcome instanceof DomainChargeOutcomeUnknown)
      ) {
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
    function useRenewOrder() {
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
      return () => renewBody;
    }

    it('returns the price and the command to approve, and never charges', async () => {
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
        userActionRequired: true,
        data: { domain: 'example.com', amount: 20, currency: 'USD', years: 1 },
        missing: ['--amount'],
      });
      expect(payload.message).not.toContain('--yes');
      expect(payload.next[0].command).toContain(
        'domains renew example.com --amount 20.00'
      );
      expect(payload.next[0].when).toContain('Only after a human approves');
      expect(renewDomain).not.toHaveBeenCalled();

      logSpy.mockRestore();
      exitSpy.mockRestore();
      client.nonInteractive = false;
    });

    it('does not prompt on non-TTY stdin and prints the command to run', async () => {
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
      expect(stderr).toContain('Price: $20.00 for 1 year, charged to');
      expect(stderr).toContain('domains renew example.com --amount 20.00');
      expect(stderr).not.toContain('--yes');

      confirmSpy.mockRestore();
      client.stdin.isTTY = true;
    });

    it('renews without prompting when --amount matches the price', async () => {
      useUser();
      useRenewalPrice('example.com', { renewalPrice: 20, years: 2 });
      const getRenewBody = useRenewOrder();
      const confirmSpy = vi.spyOn(client.input, 'confirm');
      client.stdin.isTTY = false;

      client.setArgv('domains', 'renew', 'example.com', '--amount', '20');
      const exitCode = await domains(client);

      expect(exitCode).toEqual(0);
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(getRenewBody()).toEqual({ expectedPrice: 20, years: 2 });
      // stdout carries the renewed domain.
      expect(client.stdout.getFullOutput()).toEqual('example.com\n');

      confirmSpy.mockRestore();
    });

    it('never prompts with --json, even with a terminal', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      const confirmSpy = vi.spyOn(client.input, 'confirm');

      client.setArgv('domains', 'renew', 'example.com', '--json');
      expect(await domains(client)).toEqual(1);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(renewDomain).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
      });
      confirmSpy.mockRestore();
    });

    it('never prompts in CI, even with a terminal', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      const confirmSpy = vi.spyOn(client.input, 'confirm');
      process.env.CI = 'true';

      try {
        client.setArgv('domains', 'renew', 'example.com');
        const exitCode = await domains(client);

        expect(exitCode).toEqual(1);
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(renewDomain).not.toHaveBeenCalled();
        expect(client.stderr.getFullOutput()).toContain('--amount 20.00');
      } finally {
        delete process.env.CI;
        confirmSpy.mockRestore();
      }
    });

    it("doesn't take vercel.json or another team's VERCEL_ORG_ID as naming the team", async () => {
      useUser();
      const team = useTeam();
      client.config.currentTeam = team.id;
      client.localConfig = { scope: team.slug };
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      client.stdin.isTTY = false;

      client.setArgv(
        'domains',
        'renew',
        'example.com',
        '--amount',
        '20',
        '--json'
      );
      expect(await domains(client)).toEqual(1);
      expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
        'missing_scope'
      );

      process.env.VERCEL_ORG_ID = 'team_someone_else';
      try {
        client.setArgv(
          'domains',
          'renew',
          'example.com',
          '--scope',
          team.slug,
          '--amount',
          '20'
        );
        expect(await domains(client)).toEqual(1);
        expect(client.stderr.getFullOutput()).toContain(
          'VERCEL_ORG_ID names a different team'
        );
      } finally {
        delete process.env.VERCEL_ORG_ID;
      }
      expect(renewDomain).not.toHaveBeenCalled();
    });

    it('asks for the team to be named before charging it', async () => {
      useUser();
      const team = useTeam();
      client.config.currentTeam = team.id;
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      client.stdin.isTTY = false;

      client.setArgv(
        'domains',
        'renew',
        'example.com',
        '--amount',
        '20',
        '--json'
      );
      const exitCode = await domains(client);

      expect(exitCode).toEqual(1);
      expect(renewDomain).not.toHaveBeenCalled();
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        reason: 'missing_scope',
        data: { domain: 'example.com', team: team.slug },
      });
      expect(payload.next[0].command).toContain(
        `domains renew example.com --scope ${team.slug} --amount 20.00`
      );
    });

    it('sends the renewal once and says to inspect when the API fails', async () => {
      useUser();
      useRenewalPrice('example.com');
      let calls = 0;
      client.scenario.post(
        '/v1/registrar/domains/example.com/renew',
        (_req, res) => {
          calls++;
          res.status(503).json({ error: { code: 'service_unavailable' } });
        }
      );
      client.stdin.isTTY = false;

      client.setArgv(
        'domains',
        'renew',
        'example.com',
        '--amount',
        '20',
        '--json'
      );
      const exitCode = await domains(client);

      expect(exitCode).toEqual(1);
      expect(calls).toEqual(1);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.reason).toBe('unknown_outcome');
      expect(payload.next[0].command).toContain('domains inspect example.com');
    });

    it('charges nothing when --amount does not match the price', async () => {
      useUser();
      useRenewalPrice('example.com');
      vi.mocked(renewDomain).mockClear();
      client.stdin.isTTY = false;

      client.setArgv('domains', 'renew', 'example.com', '--amount', '15');
      const exitCode = await domains(client);

      expect(exitCode).toEqual(1);
      expect(renewDomain).not.toHaveBeenCalled();
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('$20.00, not $15.00');
      expect(stderr).toContain('--amount 20.00');
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

      client.setArgv(
        'domains',
        'renew',
        'example.com',
        '--amount',
        '20',
        '--json'
      );
      const exitCode = await domains(client);
      expect(exitCode).toEqual(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        domain: 'example.com',
        term: '2yrs',
        years: 2,
        price: 20,
        charge: { amount: 20, currency: 'USD' },
        orderId: 'order_1',
      });
      expect(client.stderr.getFullOutput()).not.toContain('renewed');

      confirmSpy.mockRestore();
    });
  });
});
