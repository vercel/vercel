import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import buy from '../../../../src/commands/buy';
import purchaseDomain from '../../../../src/util/domains/purchase-domain';
import {
  APIError,
  DomainChargeOutcomeUnknown,
  DomainPaymentError,
  DomainPriceChanged,
  DomainPurchaseRefundFailed,
  DomainPurchaseRefunded,
} from '../../../../src/util/errors-ts';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';

vi.mock('../../../../src/util/domains/purchase-domain', () => ({
  default: vi.fn(),
}));

const BILLING = {
  plan: 'pro',
  email: 'billing@acme.com',
  name: 'Acme Inc',
  address: {
    line1: '1 Main St',
    city: 'Austin',
    state: 'US-TX',
    postalCode: '78701',
    country: 'US',
  },
};

const NAME_AND_PHONE = [
  '--first-name',
  'Jane',
  '--last-name',
  'Doe',
  '--phone',
  '+11122233344',
];

/** What an approved agent run adds: the price, billing, and choices. */
const APPROVED = [
  '--amount',
  '20',
  '--use-billing-details',
  ...NAME_AND_PHONE,
  '--auto-renew',
];

/** A user, a team with `billing`, and an available $20 domain. */
function useBuyable(billing: object = BILLING) {
  useUser();
  const team = useTeam();
  Object.assign(team, { billing });
  client.config.currentTeam = team.id;
  client.scenario.get('/v1/registrar/domains/example.com/price', (_, res) => {
    res.json({ purchasePrice: 20, renewalPrice: 27, years: 1 });
  });
  client.scenario.get(
    '/v1/registrar/domains/example.com/availability',
    (_, res) => {
      res.json({ available: true });
    }
  );
  return team;
}

/** Runs `domains buy example.com` as an agent; returns the JSON it prints. */
async function runAsAgent(...args: string[]) {
  client.nonInteractive = true;
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('exit');
  }) as () => never);
  client.setArgv('domains', 'buy', 'example.com', ...args, '--non-interactive');
  try {
    await expect(domains(client)).rejects.toThrow('exit');
    return {
      payload: JSON.parse(logSpy.mock.calls[0][0] as string),
      exitCode: exitSpy.mock.calls[0][0],
    };
  } finally {
    logSpy.mockRestore();
    exitSpy.mockRestore();
  }
}

/** Runs `domains buy example.com` without a terminal, like a script. */
function runInScript(...args: string[]) {
  client.stdin.isTTY = false;
  client.setArgv('domains', 'buy', 'example.com', ...args);
  return domains(client);
}

const contactSent = () => vi.mocked(purchaseDomain).mock.calls[0][5];

describe('domains buy', () => {
  beforeEach(() => {
    vi.mocked(purchaseDomain).mockReset();
    vi.mocked(purchaseDomain).mockResolvedValue({ orderId: 'order_1' });
    // A charge never prompts in CI, so the terminal tests must not run as CI.
    vi.stubEnv('CI', '');
  });

  // Runs even when an assertion fails, so a stubbed env var or prompt can't
  // leak into the next test.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('tracks subcommand usage and needs a domain', async () => {
    client.setArgv('domains', 'buy');
    expect(await domains(client)).toEqual(2);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:buy', value: 'buy' },
    ]);
  });

  it('tracks --help', async () => {
    client.setArgv('domains', 'buy', '--help');
    await expect(domains(client)).resolves.toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'domains:buy' },
    ]);
  });

  describe('in a terminal', () => {
    it('asks to confirm the price and buys nothing on decline', async () => {
      useBuyable();
      client.setArgv('domains', 'buy', 'example.com');
      const exitCode = domains(client);
      await expect(client.stderr).toOutput('Buy now for $20.00 (1 year)?');
      client.stdin.write('n\n');
      await expect(exitCode).resolves.toEqual(0);
      expect(purchaseDomain).not.toHaveBeenCalled();
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:buy', value: 'buy' },
        { key: 'argument:domain', value: '[REDACTED]' },
      ]);
    });

    it('skips the price question with a matching --amount, but still asks about auto-renew', async () => {
      useBuyable();
      const confirm = vi
        .spyOn(client.input, 'confirm')
        .mockResolvedValue(false);
      const text = vi.spyOn(client.input, 'text').mockResolvedValue('');
      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--amount',
        '20',
        '--use-billing-details',
        '--first-name',
        'Jane',
        '--last-name',
        'Doe'
      );

      expect(await domains(client)).toEqual(0);
      // --amount is consent to the price, not to the recurring charge.
      expect(confirm.mock.calls.map(([m]) => m)).toEqual([
        expect.stringContaining('Auto renew yearly'),
      ]);
      expect(vi.mocked(purchaseDomain).mock.calls[0][4]).toBe(false);
      // Billing fills the rest; the company is optional and never from billing.
      expect(text.mock.calls.map(([opts]) => opts.message)).toEqual([
        'Phone (include country code, e.g., +15551234567):',
        'Company name (optional):',
      ]);
    });

    it('skips the auto-renew question with --auto-renew', async () => {
      useBuyable();
      const confirm = vi.spyOn(client.input, 'confirm');
      vi.spyOn(client.input, 'text').mockResolvedValue('');
      client.setArgv('domains', 'buy', 'example.com', ...APPROVED);

      expect(await domains(client)).toEqual(0);
      expect(confirm).not.toHaveBeenCalled();
      expect(vi.mocked(purchaseDomain).mock.calls[0][4]).toBe(true);
    });

    it('offers billing values as prompt defaults', async () => {
      useBuyable();
      const text = vi
        .spyOn(client.input, 'text')
        .mockImplementation(async opts => String(opts.default ?? 'value'));
      client.setArgv(
        'domains',
        'buy',
        'example.com',
        '--amount',
        '20',
        ...NAME_AND_PHONE,
        '--auto-renew'
      );

      expect(await domains(client)).toEqual(0);
      const defaults = Object.fromEntries(
        text.mock.calls.map(([opts]) => [opts.message, opts.default])
      );
      expect(defaults['Email:']).toBe('billing@acme.com');
      expect(defaults['Address:']).toBe('1 Main St');
      expect(defaults['State/Province:']).toBe('TX');
    });

    it("doesn't ask for a company after --company ''", async () => {
      useBuyable();
      const text = vi.spyOn(client.input, 'text');
      client.setArgv(
        'domains',
        'buy',
        'example.com',
        ...APPROVED,
        '--company',
        ''
      );

      expect(await domains(client)).toEqual(0);
      expect(text).not.toHaveBeenCalled();
      expect(contactSent().companyName).toBeUndefined();
    });

    it('never prompts with --json, and returns the approval document', async () => {
      useBuyable();
      const confirm = vi.spyOn(client.input, 'confirm');
      const text = vi.spyOn(client.input, 'text');
      client.setArgv('domains', 'buy', 'example.com', '--json');

      expect(await domains(client)).toEqual(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
      });
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it('never prompts in CI', async () => {
      useBuyable();
      vi.stubEnv('CI', 'true');
      const confirm = vi.spyOn(client.input, 'confirm');
      client.setArgv('domains', 'buy', 'example.com');

      expect(await domains(client)).toEqual(1);
      expect(confirm).not.toHaveBeenCalled();
      expect(purchaseDomain).not.toHaveBeenCalled();
    });
  });

  describe('approval (nothing is charged)', () => {
    it('returns the price, the team, both auto-renew choices, and the billing details', async () => {
      const team = useBuyable();
      const { payload, exitCode } = await runAsAgent();

      expect(exitCode).toEqual(1);
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'confirmation_required',
        userActionRequired: true,
        data: {
          domain: 'example.com',
          team: team.slug,
          amount: 20,
          currency: 'USD',
          autoRenew: null,
          renewalAmount: 27,
          billingDetails: {
            email: 'billing@acme.com',
            address1: '1 Main St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            country: 'US',
          },
        },
        missing: [
          '--amount',
          '--auto-renew|--no-auto-renew',
          '--use-billing-details',
          '--first-name',
          '--last-name',
          '--phone',
        ],
      });
      // The billing name can be a person, so it's never used as the company.
      expect(payload.data.billingDetails.companyName).toBeUndefined();
      // One command per auto-renew choice; the person picks one.
      expect(payload.next.map((n: { command: string }) => n.command)).toEqual([
        expect.stringContaining(
          `domains buy example.com --scope ${team.slug} --amount 20.00 --use-billing-details --first-name <first-name> --last-name <last-name> --phone <phone> --auto-renew`
        ),
        expect.stringContaining('--no-auto-renew'),
      ]);
      // Billing values stay in data, out of the message and commands.
      expect(payload.message).not.toContain('1 Main St');
      expect(payload.next[0].command).not.toContain('Austin');
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it('asks for every field when the team has no billing details', async () => {
      useBuyable({ plan: 'pro' });
      const { payload } = await runAsAgent();

      expect(payload.data.billingDetails).toBeUndefined();
      expect(payload.missing).toEqual([
        '--amount',
        '--auto-renew|--no-auto-renew',
        '--first-name',
        '--last-name',
        '--email',
        '--phone',
        '--address',
        '--city',
        '--state',
        '--zip',
        '--country',
      ]);
    });

    it('never turns on auto-renew without a choice, even with --amount', async () => {
      const team = useBuyable();
      const { payload } = await runAsAgent(
        '--scope',
        team.slug,
        '--amount',
        '20',
        '--use-billing-details',
        ...NAME_AND_PHONE
      );

      expect(payload.reason).toBe('confirmation_required');
      expect(payload.missing).toEqual(['--auto-renew|--no-auto-renew']);
      expect(payload.next).toHaveLength(2);
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it('lists --use-billing-details when billing would fill the rest', async () => {
      useBuyable();
      const { payload } = await runAsAgent(
        '--amount',
        '20',
        ...NAME_AND_PHONE,
        '--auto-renew'
      );

      expect(payload.reason).toBe('missing_requirements');
      expect(payload.missing).toEqual(['--use-billing-details']);
    });

    it.each([
      { state: 'California', country: 'US', expected: undefined },
      { state: 'CA-ON', country: 'CA', expected: 'ON' },
    ])('reads a billing state of $state as $expected', async ({
      state,
      country,
      expected,
    }) => {
      useBuyable({
        ...BILLING,
        address: { ...BILLING.address, state, country },
      });
      const { payload } = await runAsAgent();
      expect(payload.data.billingDetails.state).toBe(expected);
    });

    it('drops the whole billing address when a flag replaces part of it', async () => {
      useBuyable();
      const { payload } = await runAsAgent(
        ...APPROVED,
        '--address',
        '5 Oak Ave'
      );

      expect(payload.missing).toEqual([
        '--city',
        '--state',
        '--zip',
        '--country',
      ]);
      expect(payload.data.billingDetails).toEqual({
        email: 'billing@acme.com',
      });
      expect(payload.next[0].command).toContain(
        "--address '5 Oak Ave' --city <city>"
      );
    });

    it.each([
      { name: 'not named at all', localScope: false },
      // Any contributor can change vercel.json, so it never authorizes a charge.
      { name: 'only named in vercel.json', localScope: true },
    ])('asks for the team when it is $name', async ({ localScope }) => {
      const team = useBuyable();
      if (localScope) client.localConfig = { scope: team.slug };
      const { payload } = await runAsAgent(...APPROVED);

      expect(payload).toMatchObject({
        reason: 'missing_scope',
        data: { domain: 'example.com', team: team.slug },
      });
      expect(payload.next[0].command).toContain(`--scope ${team.slug}`);
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'alone', args: [] as string[] },
      { name: 'with --scope', args: ['--scope'] },
    ])('refuses when VERCEL_ORG_ID names another team, $name', async ({
      args,
    }) => {
      const team = useBuyable();
      vi.stubEnv('VERCEL_ORG_ID', 'team_someone_else');
      const scope = args.length ? [...args, team.slug] : [];
      const { payload } = await runAsAgent(...scope, ...APPROVED);

      expect(payload).toMatchObject({
        reason: 'conflict',
        data: { domain: 'example.com', team: team.slug },
      });
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it('charges nothing when --amount does not match the price', async () => {
      const team = useBuyable();
      const { payload } = await runAsAgent(
        '--scope',
        team.slug,
        ...APPROVED.slice(2),
        '--amount',
        '1.99'
      );

      expect(payload).toMatchObject({
        reason: 'price_changed',
        data: { amount: 20 },
      });
      expect(payload.next[0].command).toContain('--amount 20.00');
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it('prints the price, billing details, and command for a script', async () => {
      const team = useBuyable();
      expect(await runInScript()).toEqual(1);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(`$20.00 for 1 year, charged to ${team.slug}.`);
      expect(stderr).toContain('1 Main St');
      expect(stderr).toContain('--amount 20.00 --use-billing-details');
      expect(purchaseDomain).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'an invalid phone', args: ['--phone', '1122233'] },
      { name: 'a non-USD amount', args: ['--amount', '$20'] },
      {
        name: 'both auto-renew flags',
        args: ['--auto-renew', '--no-auto-renew'],
      },
      // The parser would read each of these as true.
      { name: '--auto-renew=false', args: ['--auto-renew=false'] },
      // `false` would otherwise be dropped as an extra argument.
      { name: '--auto-renew false', args: ['--auto-renew', 'false'] },
      {
        name: '--use-billing-details false',
        args: ['--use-billing-details', 'false'],
      },
      {
        name: 'an unquoted value with a space',
        args: ['--last-name', 'Doe', 'Smith'],
      },
      { name: '--no-auto-renew=false', args: ['--no-auto-renew=false'] },
      {
        name: '--use-billing-details=false',
        args: ['--use-billing-details=false'],
      },
    ])('rejects $name before calling the API', async ({ args }) => {
      useUser();
      const { payload, exitCode } = await runAsAgent(...args);

      expect(exitCode).toEqual(2);
      expect(payload.reason).toBe('invalid_arguments');
      // Contact values are personal, so errors never echo them.
      expect(payload.message).not.toContain('1122233');
      expect(payload.message).not.toContain('Smith');
      expect(purchaseDomain).not.toHaveBeenCalled();
    });
  });

  describe('charging', () => {
    it('buys with billing details plus the given name and phone, and prints the domain', async () => {
      const team = useBuyable();
      expect(await runInScript('--scope', team.slug, ...APPROVED)).toEqual(0);

      expect(purchaseDomain).toHaveBeenCalledWith(
        client,
        'example.com',
        20,
        1,
        true,
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'billing@acme.com',
          phone: '+11122233344',
          address1: '1 Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          country: 'US',
        }
      );
      expect(client.stdout.getFullOutput()).toEqual('example.com\n');
      expect(client.stderr.getFullOutput()).toContain(
        'Registered to Jane Doe (billing@acme.com).'
      );
    });

    it('accepts VERCEL_ORG_ID set to the team being charged', async () => {
      const team = useBuyable();
      vi.stubEnv('VERCEL_ORG_ID', team.id);
      expect(await runInScript(...APPROVED)).toEqual(0);
      expect(purchaseDomain).toHaveBeenCalled();
    });

    it('lets contact options replace billing values, and --no-auto-renew turn renewal off', async () => {
      const team = useBuyable();
      const exitCode = await runInScript(
        '--scope',
        team.slug,
        '--amount',
        '20',
        '--use-billing-details',
        ...NAME_AND_PHONE,
        '--email',
        'jane@example.com',
        '--company',
        'Doe LLC',
        '--no-auto-renew'
      );

      expect(exitCode).toEqual(0);
      expect(vi.mocked(purchaseDomain).mock.calls[0][4]).toBe(false);
      expect(contactSent()).toMatchObject({
        email: 'jane@example.com',
        companyName: 'Doe LLC',
        address1: '1 Main St',
      });
    });

    it('keeps the billing address when --state only fills a gap', async () => {
      const team = useBuyable({
        ...BILLING,
        address: { ...BILLING.address, state: 'California' },
      });
      const exitCode = await runInScript(
        '--scope',
        team.slug,
        ...APPROVED,
        '--state',
        'CA'
      );

      expect(exitCode).toEqual(0);
      expect(contactSent()).toMatchObject({
        address1: '1 Main St',
        city: 'Austin',
        state: 'CA',
      });
    });

    it("treats --company '' as no company", async () => {
      const team = useBuyable();
      expect(
        await runInScript('--scope', team.slug, ...APPROVED, '--company', '')
      ).toEqual(0);
      // Undefined is dropped from the request body, so no company is sent.
      expect(contactSent().companyName).toBeUndefined();
    });

    it('includes the order ID and charge in --json', async () => {
      const team = useBuyable();
      expect(
        await runInScript('--scope', team.slug, ...APPROVED, '--json')
      ).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'ok',
        domain: 'example.com',
        orderId: 'order_1',
        charge: { amount: 20, currency: 'USD' },
        autoRenew: true,
      });
    });

    it.each([
      {
        name: 'a declined card',
        result: new DomainPaymentError(),
        reason: 'payment_failed',
        message: 'Nothing was charged',
      },
      {
        name: 'a refund',
        result: new DomainPurchaseRefunded('example.com'),
        reason: 'api_error',
        message: 'the charge was refunded',
      },
      {
        name: 'a failed refund',
        result: new DomainPurchaseRefundFailed('example.com'),
        reason: 'api_error',
        message: 'Contact Vercel support',
      },
      {
        name: 'an unknown outcome',
        result: new DomainChargeOutcomeUnknown('example.com', 'buy'),
        reason: 'unknown_outcome',
        message: 'charged twice',
      },
      {
        name: 'a price change at checkout',
        result: new DomainPriceChanged('example.com'),
        reason: 'price_changed',
        message: 'Nothing was charged',
      },
      {
        name: 'an API rejection',
        error: new APIError(
          'The registrant email is not allowed for this TLD.',
          new Response(null, { status: 400 }),
          { code: 'bad_request' }
        ),
        reason: 'api_error',
        message: 'Nothing was charged',
      },
      {
        name: 'a failure before the order is sent',
        error: Object.assign(new Error('socket hang up'), {
          code: 'ECONNRESET',
        }),
        reason: 'api_error',
        message: "wasn't sent",
      },
    ])('reports $name', async ({ result, error, reason, message }) => {
      const team = useBuyable();
      if (error) vi.mocked(purchaseDomain).mockRejectedValue(error);
      else vi.mocked(purchaseDomain).mockResolvedValue(result as never);

      const { payload } = await runAsAgent('--scope', team.slug, ...APPROVED);

      expect(payload.reason).toBe(reason);
      expect(payload.message).toContain(message);
    });

    it("keeps the API's explanation out of the message, in data.apiMessage", async () => {
      const team = useBuyable();
      vi.mocked(purchaseDomain).mockRejectedValue(
        new APIError(
          'Not allowed for this TLD.',
          new Response(null, { status: 400 }),
          {
            code: 'bad_request',
          }
        )
      );
      const { payload } = await runAsAgent('--scope', team.slug, ...APPROVED);

      expect(payload.message).not.toContain('Not allowed for this TLD.');
      expect(payload.data.apiMessage).toBe('Not allowed for this TLD.');
    });

    it('points an unknown outcome at inspect, and a checkout price change at a new quote', async () => {
      const team = useBuyable();
      vi.mocked(purchaseDomain).mockResolvedValueOnce(
        new DomainChargeOutcomeUnknown('example.com', 'buy')
      );
      expect(await runInScript('--scope', team.slug, ...APPROVED)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'domains inspect example.com'
      );

      vi.mocked(purchaseDomain).mockResolvedValueOnce(
        new DomainPriceChanged('example.com')
      );
      const { payload } = await runAsAgent('--scope', team.slug, ...APPROVED);
      expect(payload.next[0].command).not.toContain('--amount');
    });

    it('writes a JSON error on --json when the domain is unavailable', async () => {
      useUser();
      client.scenario.get(
        '/v1/registrar/domains/example.com/price',
        (_, res) => {
          res.json({ purchasePrice: 20, renewalPrice: 27, years: 1 });
        }
      );
      client.scenario.get(
        '/v1/registrar/domains/example.com/availability',
        (_, res) => {
          res.json({ available: false });
        }
      );
      client.setArgv('domains', 'buy', 'example.com', '--json');

      expect(await domains(client)).toEqual(1);
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'domain_not_available',
      });
    });
  });

  it('`buy domain` takes the same options', async () => {
    const team = useBuyable();
    client.stdin.isTTY = false;
    client.setArgv(
      'buy',
      'domain',
      'example.com',
      '--scope',
      team.slug,
      ...APPROVED
    );
    expect(await buy(client)).toEqual(0);
    expect(purchaseDomain).toHaveBeenCalled();
  });
});
