import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';

const CONTACT_FLAGS = [
  '--first-name',
  'Jane',
  '--last-name',
  'Doe',
  '--email',
  'jane@example.com',
  '--phone',
  '+15551234567',
  '--address',
  '1 Main St',
  '--city',
  'San Francisco',
  '--state',
  'CA',
  '--zip',
  '94105',
  '--country',
  'us',
];

function usePrice(
  domain = 'example.com',
  overrides: Record<string, unknown> = {}
) {
  client.scenario.get(`/v1/registrar/domains/${domain}/price`, (_req, res) => {
    res.json({
      purchasePrice: 100,
      renewalPrice: 110,
      transferPrice: null,
      years: 1,
      ...overrides,
    });
  });
}

function useAvailability(domain = 'example.com', available = true) {
  client.scenario.get(
    `/v1/registrar/domains/${domain}/availability`,
    (_req, res) => {
      res.json({ available });
    }
  );
}

function usePurchase(domain = 'example.com') {
  let purchased = false;
  client.scenario.post(`/v1/registrar/domains/${domain}/buy`, (_req, res) => {
    purchased = true;
    res.json({ orderId: 'order_123' });
  });
  client.scenario.get('/v1/registrar/orders/order_123', (_req, res) => {
    res.json({
      orderId: 'order_123',
      status: 'completed',
      domains: [{ domainName: domain, status: 'completed' }],
    });
  });
  client.scenario.get(`/v5/domains/${domain}`, (_req, res) => {
    res.json({
      domain: {
        name: domain,
        boughtAt: Date.now(),
        createdAt: Date.now(),
        expiresAt: null,
      },
    });
  });
  return () => purchased;
}

describe('domains buy', () => {
  let origCI: string | undefined;

  // Force the `CI` env var to not be set, because CI runs get the
  // structured non-interactive output instead of prompts.
  beforeAll(() => {
    origCI = process.env.CI;
  });

  beforeEach(() => {
    delete process.env.CI;
    useUser();
  });

  afterEach(() => {
    if (origCI === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = origCI;
    }
    client.nonInteractive = false;
  });

  it('should track subcommand usage', async () => {
    client.setArgv('domains', 'buy');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:buy',
        value: 'buy',
      },
    ]);
  });

  it('errors when no domain argument is given', async () => {
    client.setArgv('domains', 'buy');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Missing domain name');
    expect(await exitCodePromise).toBe(1);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'buy';

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

  describe('non-interactive mode', () => {
    it('prepares the purchase and hands off a prefilled interactive command (exit 0, never purchases)', async () => {
      usePrice();
      useAvailability();
      const didPurchase = usePurchase();
      client.nonInteractive = true;

      client.setArgv('domains', 'buy', 'example.com', '--non-interactive');
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('purchase_requires_user');
      expect(payload.action).toBe('confirmation_required');
      expect(payload.userActionRequired).toBe(true);
      expect(payload.domain).toBe('example.com');
      expect(payload.available).toBe(true);
      expect(payload.purchasePrice).toBe(100);
      expect(payload.renewalPrice).toBe(110);
      expect(payload.years).toBe(1);
      expect(payload.missingContactFields).toContain('--first-name');
      expect(payload.hint).toContain('interactively');

      const [handoff, dashboard] = payload.next;
      expect(handoff.command).toContain('domains buy example.com');
      expect(handoff.command).toContain('--years 1');
      expect(handoff.command).toContain('--expected-price 100');
      expect(handoff.command).not.toContain('--non-interactive');
      expect(handoff.when).toContain('interactively');
      expect(dashboard.command).toContain(
        'https://vercel.com/dashboard/domains'
      );

      expect(didPurchase()).toBe(false);
    });

    it('carries agent-provided contact flags into the prefilled command', async () => {
      usePrice();
      useAvailability();
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--auto-renew',
        ...CONTACT_FLAGS,
        '--non-interactive'
      );
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('action_required');
      expect(payload.missingContactFields).toEqual([]);
      expect(payload.autoRenew).toBe(true);
      expect(payload.hint).toContain('All purchase details are prefilled');

      const handoff = payload.next[0].command as string;
      expect(handoff).toContain('--first-name Jane');
      expect(handoff).toContain('--email jane@example.com');
      expect(handoff).toContain("--address '1 Main St'");
      expect(handoff).toContain('--country US');
      expect(handoff).toContain('--auto-renew');
      expect(handoff).not.toContain('--non-interactive');
    });

    it('errors with domain_not_available when the domain is taken', async () => {
      usePrice();
      useAvailability('example.com', false);
      client.nonInteractive = true;

      client.setArgv('domains', 'buy', 'example.com', '--non-interactive');
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('domain_not_available');
      expect(
        payload.next.some((step: { command: string }) =>
          step.command.includes('domains search')
        )
      ).toBe(true);
      expect(
        payload.next.some((step: { command: string }) =>
          step.command.includes('domains transfer-in')
        )
      ).toBe(true);
    });

    it('errors with tld_not_supported for unsupported TLDs', async () => {
      client.scenario.get(
        '/v1/registrar/domains/example.wat/price',
        (_req, res) => {
          res.status(400).json({
            error: { code: 'tld_not_supported', message: 'Unsupported TLD' },
          });
        }
      );
      useAvailability('example.wat');
      client.nonInteractive = true;

      client.setArgv('domains', 'buy', 'example.wat', '--non-interactive');
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('tld_not_supported');
      expect(payload.next[0].command).toContain('domains search');
    });

    it('errors with invalid_arguments when more than one domain is given', async () => {
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        'other.com',
        '--non-interactive'
      );
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toContain('one domain');
      expect(payload.next[0].command).toContain('domains buy example.com');
      expect(payload.next[0].command).not.toContain('other.com');
    });

    it('single-quotes contact values so history expansion cannot fire when pasted', async () => {
      usePrice();
      useAvailability();
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--address',
        '1 Main St!',
        '--non-interactive'
      );
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      const handoff = payload.next[0].command as string;
      expect(handoff).toContain("--address '1 Main St!'");
      expect(handoff).not.toContain('"1 Main St!"');
    });

    it('errors with invalid_domain for subdomains', async () => {
      client.nonInteractive = true;

      client.setArgv('domains', 'buy', 'www.example.com', '--non-interactive');
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_domain');
    });

    it('errors with price_changed when --expected-price no longer matches', async () => {
      usePrice();
      useAvailability();
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--expected-price',
        '90',
        '--non-interactive'
      );
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('price_changed');
      expect(payload.next[0].command).toContain('--expected-price 100');
    });

    it('errors with invalid_arguments for invalid contact flags', async () => {
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--email',
        'not-an-email',
        '--non-interactive'
      );
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toContain('--email');
    });

    it('errors with invalid_arguments when --years does not match the quoted term', async () => {
      usePrice();
      useAvailability();
      client.nonInteractive = true;

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--years',
        '3',
        '--non-interactive'
      );
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.next[0].command).toContain('--years 1');
    });
  });

  describe('--format json', () => {
    it('emits the same prepare-only payload without --non-interactive', async () => {
      usePrice();
      useAvailability();

      client.setArgv('domains', 'buy', 'example.com', '--format', 'json');
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('purchase_requires_user');
      expect(payload.next[0].command).toContain('domains buy example.com');
    });

    it('errors on an unsupported format', async () => {
      client.setArgv('domains', 'buy', 'example.com', '--format', 'yaml');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Invalid output format');
      expect(await exitCodePromise).toBe(1);
    });
  });

  describe('CI mode', () => {
    it('emits the structured payload instead of a prose error', async () => {
      usePrice();
      useAvailability();
      process.env.CI = '1';

      client.setArgv('domains', 'buy', 'example.com');
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('purchase_requires_user');
    });
  });

  describe('interactive mode', () => {
    it('shows an order summary and asks a single purchase confirmation when everything is prefilled', async () => {
      usePrice();
      useAvailability();
      const didPurchase = usePurchase();

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--years',
        '1',
        '--auto-renew',
        ...CONTACT_FLAGS
      );
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput('Buy "example.com" for $100?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('purchased');
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(didPurchase()).toBe(true);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Order summary');
      expect(stderr).toContain('Jane Doe <jane@example.com>');
      expect(stderr).toContain('$110 (auto-renews)');
      // Single consent prompt: the old disjoint confirmation is gone.
      expect(stderr).not.toContain('Buy now for');
    });

    it('does not purchase when the user declines the confirmation', async () => {
      usePrice();
      useAvailability();
      const didPurchase = usePurchase();

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--auto-renew',
        ...CONTACT_FLAGS
      );
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput('Buy "example.com" for $100?');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(didPurchase()).toBe(false);
    });

    it('still prompts for auto-renew when the flag is missing', async () => {
      usePrice();
      useAvailability();
      const didPurchase = usePurchase();

      client.setArgv('domains', 'buy', 'example.com', ...CONTACT_FLAGS);
      const exitCodePromise = domains(client);

      await expect(client.stderr).toOutput('Auto renew yearly for $110?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Buy "example.com" for $100?');
      client.stdin.write('n\n');

      await expect(exitCodePromise).resolves.toEqual(0);
      expect(didPurchase()).toBe(false);
    });

    it('errors in prose when the domain is unavailable', async () => {
      usePrice();
      useAvailability('example.com', false);

      client.setArgv('domains', 'buy', 'example.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'The domain example.com is not available to buy.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('rejects contradictory auto-renew flags', async () => {
      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--auto-renew',
        '--no-auto-renew'
      );
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Use either --auto-renew or --no-auto-renew, not both.'
      );
      expect(await exitCodePromise).toBe(1);
    });

    it('should track redacted flag and argument values', async () => {
      usePrice();
      useAvailability();

      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--years',
        '1',
        '--auto-renew',
        '--expected-price',
        '100',
        ...CONTACT_FLAGS
      );
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Buy "example.com" for $100?');
      client.stdin.write('n\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:buy',
          value: 'buy',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
        {
          key: 'option:years',
          value: '1',
        },
        {
          key: 'flag:auto-renew',
          value: 'TRUE',
        },
        {
          key: 'option:expected-price',
          value: '[REDACTED]',
        },
        {
          key: 'option:first-name',
          value: '[REDACTED]',
        },
        {
          key: 'option:last-name',
          value: '[REDACTED]',
        },
        {
          key: 'option:email',
          value: '[REDACTED]',
        },
        {
          key: 'option:phone',
          value: '[REDACTED]',
        },
        {
          key: 'option:address',
          value: '[REDACTED]',
        },
        {
          key: 'option:city',
          value: '[REDACTED]',
        },
        {
          key: 'option:state',
          value: '[REDACTED]',
        },
        {
          key: 'option:zip',
          value: '[REDACTED]',
        },
        {
          key: 'option:country',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
