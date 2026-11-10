import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import usage from '../../../../src/commands/usage';
import type { CommitmentUsageResponse } from '../../../../src/commands/usage/types';
import { costsFixture, useBillingCosts } from './billing-costs-mock';

const from = '2025-12-01T08:00:00.000Z';
const to = '2026-01-01T08:00:00.000Z';
const dates = ['--since', from, '--until', to];
const modes = [
  { name: 'aggregate', args: [] },
  { name: 'daily', args: ['--breakdown', 'daily'] },
  { name: 'weekly', args: ['--breakdown', 'weekly'] },
  { name: 'monthly', args: ['--breakdown', 'monthly'] },
  { name: 'project', args: ['--group-by', 'project'] },
  { name: 'region', args: ['--group-by', 'region'] },
];
const currencyModes = modes.flatMap(mode =>
  (['USD', 'managed_infrastructure_units'] as const).map(costUnit => ({
    ...mode,
    costUnit,
  }))
);

function readJson() {
  const stdout = client.stdout.getFullOutput();
  const json = JSON.parse(stdout);
  // Exact serialization proves there is one payload, no prose/ANSI/spinners.
  expect(stdout).toBe(`${JSON.stringify(json, null, 2)}\n`);
  expect(stdout).not.toContain('\u001b');
  expect(client.stderr.getFullOutput()).toBe('');
  expect(json).not.toHaveProperty('schemaVersion');
  expect(stdout).not.toMatch(
    /"(?:effectiveCost|totalEffectiveCost|grandTotals|credit|progress)"\s*:/
  );
  return json;
}

function useCredit(credit: CommitmentUsageResponse) {
  client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
    res.json(credit);
  });
}

function ledger(currency: string, total: number, remaining: number) {
  return {
    currency,
    title: 'Infrastructure credit',
    periodStart: from,
    periodEnd: to,
    total,
    remaining,
  };
}

describe('usage billing costs API', () => {
  let team: Record<string, unknown>;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    Object.assign(team, {
      slug: 'usage-test-team',
      billing: { plan: 'pro', planIteration: 'unbundled' },
    });
    client.config.currentTeam = 'team_dummy';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(
    currencyModes
  )('uses peak licenses and additive costs in $name $costUnit JSON', async ({
    name,
    args,
    costUnit,
  }) => {
    useBillingCosts(costsFixture(costUnit));
    client.setArgv('usage', ...dates, ...args, '--format', 'json');
    expect(await usage(client)).toBe(0);
    const json = readJson();
    expect(json.costUnit).toBe(costUnit);
    expect(json).not.toHaveProperty('creditBalance');
    const seats = {
      name: 'Developer seats',
      product: 'seats',
      quantity: 3,
      unit: 'licenses',
      category: 'subscription',
      cost: 60,
      included: false,
    };
    expect(json.services).toEqual([
      seats,
      {
        name: 'Function Invocations',
        product: 'functions',
        quantity: 300,
        unit: 'invocations',
        category: 'usage',
        cost: 3,
        included: false,
      },
      {
        name: 'Edge Requests',
        product: 'edge',
        quantity: 900,
        unit: 'requests',
        category: 'usage',
        cost: 0,
        included: true,
      },
    ]);
    expect(json.totals).toEqual({ cost: 63 });
    if (name === 'daily') {
      expect(json.breakdown.data).toEqual([
        expect.objectContaining({
          periodKey: '2025-12-01',
          services: expect.arrayContaining([
            { ...seats, quantity: 1, cost: 20 },
          ]),
          totals: { cost: 21 },
        }),
        expect.objectContaining({
          periodKey: '2025-12-02',
          services: expect.arrayContaining([
            { ...seats, quantity: 3, cost: 40 },
          ]),
          totals: { cost: 42 },
        }),
        expect.objectContaining({
          periodKey: '2025-12-03',
          services: expect.arrayContaining([
            { ...seats, quantity: 2, cost: 0 },
          ]),
          totals: { cost: 0 },
        }),
      ]);
    } else if (name === 'weekly' || name === 'monthly') {
      expect(json.breakdown.data).toEqual([
        {
          periodKey: name === 'weekly' ? '2025-W49' : '2025-12',
          services: json.services,
          totals: json.totals,
        },
      ]);
    } else if (name === 'project' || name === 'region') {
      expect(json.groupBy).toEqual({
        dimension: name,
        data: [
          {
            name: name === 'project' ? 'web-app' : 'Washington, D.C., USA',
            services: json.services,
            totals: json.totals,
          },
        ],
      });
    }
  });

  it.each(
    currencyModes
  )('renders included services in $name $costUnit output', async ({
    args,
    costUnit,
  }) => {
    useBillingCosts(costsFixture(costUnit));
    client.setArgv('usage', ...dates, ...args);
    expect(await usage(client)).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Edge Requests (Flat Rate CDN)');
    expect(output).toMatch(/Edge Requests \(Flat Rate CDN\).*Included/);
    expect(output).not.toContain('Cost unit:');
    expect(output).not.toContain('(included)');
    expect(output).toContain(
      `Accrued through Dec 15, 2025 in ${costUnit === 'USD' ? 'USD' : 'MIUs'}, before credits and discounts.`
    );
    expect(output).not.toMatch(
      /Effective Cost|Usage through:|Cost unit:|Costs are accrued through this date|Before credits and discounts; not a final invoice\./
    );
    expect(output).toMatch(/Service\s+Usage\s+Cost\s*$/m);
    if (costUnit !== 'USD') expect(output).not.toContain('$');
    expect(output).not.toContain('Estimated bill');
    expect(output).not.toContain('Accrued cost');
    expect(output).not.toContain('Credits applied');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  describe.each([
    { format: 'human', formatArgs: [] },
    { format: 'JSON', formatArgs: ['--json'] },
    { format: 'format JSON', formatArgs: ['--format', 'json'] },
  ])('$format currency coverage', ({ formatArgs }) => {
    it.each(
      currencyModes
    )('rejects mixed-currency $name with $costUnit selected', async ({
      args,
      costUnit,
    }) => {
      const fixture = costsFixture(costUnit);
      fixture.availableCurrencies = ['USD', 'managed_infrastructure_units'];
      useBillingCosts(fixture);
      client.stdout.isTTY = false;
      client.stderr.isTTY = false;
      client.setArgv('usage', ...dates, ...args, ...formatArgs);

      expect(await usage(client)).toBe(1);
      expect(client.stdout.getFullOutput()).toBe('');
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        "Can't show complete costs for this date range because some costs use a different billing currency."
      );
      expect(stderr).toContain(
        'Choose a date range within the current billing currency or view usage in the dashboard.'
      );
      expect(stderr).not.toContain('Estimated total');
      expect(stderr).not.toContain('Usage for');
    });
  });

  describe.each([
    'USD',
    'managed_infrastructure_units',
  ] as const)('%s available currencies', costUnit => {
    it.each([
      { name: 'missing', availableCurrencies: undefined },
      { name: 'empty', availableCurrencies: [] },
    ])('accepts $name metadata', async ({ availableCurrencies }) => {
      const fixture = costsFixture(costUnit);
      fixture.availableCurrencies = availableCurrencies;
      useBillingCosts(fixture);
      client.setArgv('usage', ...dates, '--json');

      expect(await usage(client)).toBe(0);
      const json = readJson();
      expect(json.costUnit).toBe(costUnit);
      expect(json.totals).toEqual({ cost: 63 });
    });

    it('accepts repeated metadata for the selected currency', async () => {
      const fixture = costsFixture(costUnit);
      fixture.availableCurrencies = [costUnit, costUnit];
      useBillingCosts(fixture);
      client.setArgv('usage', ...dates, '--json');

      expect(await usage(client)).toBe(0);
      expect(readJson().totals).toEqual({ cost: 63 });
    });

    it('rejects metadata naming only a currency other than the selected one', async () => {
      const fixture = costsFixture(costUnit);
      fixture.availableCurrencies = [
        costUnit === 'USD' ? 'managed_infrastructure_units' : 'USD',
      ];
      useBillingCosts(fixture);
      client.setArgv('usage', ...dates, '--json');

      expect(await usage(client)).toBe(1);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(client.stderr.getFullOutput()).toContain(
        "Can't show complete costs"
      );
    });
  });

  it.each([
    'project',
    'region',
  ])('requests detail before summary to preserve %s attribution', async dimension => {
    const requests = useBillingCosts(costsFixture());
    client.setArgv('usage', ...dates, '--group-by', dimension, '--json');
    expect(await usage(client)).toBe(0);
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0].views)).toEqual([
      'byProductRegionProject',
      'byProduct',
    ]);
    expect(requests[0].views).toEqual({
      byProductRegionProject: { groupBy: ['product', 'region', 'project'] },
      byProduct: { groupBy: ['product'] },
    });
    const json = readJson();
    expect(
      json.groupBy.data.map((group: { name: string }) => group.name)
    ).toEqual([dimension === 'project' ? 'web-app' : 'Washington, D.C., USA']);
    expect(json.groupBy.data[0].totals).toEqual(json.totals);
  });

  it.each(
    modes
  )('resolves metrics by slug rather than position in $name', async ({
    args,
  }) => {
    const fixture = costsFixture();
    fixture.metrics.reverse();
    for (const result of Object.values(fixture.results.views).flatMap(
      view => view.results
    )) {
      result.metrics.reverse();
      result.values.forEach(sample => sample.reverse());
      result.totalValue.reverse();
    }
    useBillingCosts(fixture);
    client.setArgv('usage', ...dates, ...args, '--json');
    expect(await usage(client)).toBe(0);
    const json = readJson();
    expect(json.services[0]).toMatchObject({
      product: 'seats',
      quantity: 3,
      cost: 60,
    });
    expect(json.services[1]).toMatchObject({
      product: 'functions',
      quantity: 300,
      cost: 3,
      unit: 'invocations',
    });
    expect(json.totals).toEqual({ cost: 63 });
    if (json.groupBy)
      expect(json.groupBy.data[0].services).toEqual(json.services);
    if (json.breakdown) {
      expect(json.breakdown.data[0].services[0]).toMatchObject({
        quantity: args[1] === 'daily' ? 1 : 3,
        cost: args[1] === 'daily' ? 20 : 60,
      });
    }
  });

  describe.each([
    'zero',
    'missing metric',
    'missing samples',
  ] as const)('%s quantity', variant => {
    it.each(
      modes
    )('does not invent a license or usage quantity in $name', async ({
      args,
    }) => {
      const fixture = costsFixture();
      for (const result of Object.values(fixture.results.views).flatMap(
        view => view.results
      )) {
        if (variant === 'missing metric') result.metrics = ['gross_cost'];
        result.values = result.values.map(([cost]) =>
          variant === 'zero' ? [cost, 0] : [cost]
        );
        result.totalValue =
          variant === 'zero'
            ? [result.totalValue[0], 0]
            : [result.totalValue[0]];
      }
      useBillingCosts(fixture);
      client.setArgv('usage', ...dates, ...args, '--json');
      expect(await usage(client)).toBe(0);
      const json = readJson();
      const services = [
        ...json.services,
        ...(json.breakdown?.data.flatMap(
          (period: { services: unknown[] }) => period.services
        ) ?? []),
        ...(json.groupBy?.data.flatMap(
          (group: { services: unknown[] }) => group.services
        ) ?? []),
      ];
      expect(services.length).toBeGreaterThanOrEqual(3);
      for (const service of services) expect(service.quantity).toBe(0);
      expect(json.services[0]).toMatchObject({
        product: 'seats',
        cost: 60,
        quantity: 0,
      });
      expect(json.totals).toEqual({ cost: 63 });
    });
  });

  it.each(
    modes
  )('includes hidden zero-usage services with --json in $name', async ({
    args,
  }) => {
    const fixture = costsFixture();
    for (const result of Object.values(fixture.results.views).flatMap(
      view => view.results
    )) {
      result.values = result.values.map(() => [0, 0]);
      result.totalValue = [0, 0];
    }
    useBillingCosts(fixture);
    client.setArgv('usage', ...dates, ...args, '--json');
    expect(await usage(client)).toBe(0);
    const json = readJson();
    expect(json.services).toHaveLength(3);
    expect(
      json.services.map((service: { product: string }) => service.product)
    ).toEqual(['seats', 'functions', 'edge']);
    for (const service of json.services) {
      expect(service).toMatchObject({ quantity: 0, cost: 0 });
    }
    for (const entry of [
      ...(json.breakdown?.data ?? []),
      ...(json.groupBy?.data ?? []),
    ]) {
      expect(entry.services).toEqual(json.services);
    }
    expect(client.stdout.getFullOutput()).not.toContain('Add --json');
  });

  it('uses billing.period timestamps as the default API and JSON period', async () => {
    Object.assign(team, {
      billing: {
        plan: 'pro',
        period: {
          start: Date.parse('2025-11-19T17:23:45.123Z'),
          end: Date.parse('2025-12-19T17:23:45.123Z'),
        },
      },
    });
    const requests = useBillingCosts(costsFixture());
    client.setArgv('usage', '--json');
    expect(await usage(client)).toBe(0);
    expect(requests[0]).toEqual({
      from: '2025-11-19T17:23:45.123Z',
      to: '2025-12-19T17:23:45.123Z',
      metrics: ['gross_cost', 'quantity'],
      format: 'timeseries',
      views: { byProduct: { groupBy: ['product'] } },
      userAgent: 'vercel-cli.usage',
    });
    expect(readJson().period).toEqual({
      from: requests[0].from,
      to: requests[0].to,
    });
  });

  describe('monthly usage subscription', () => {
    const annualPeriod = {
      start: Date.parse('2025-01-01T08:00:00.000Z'),
      end: Date.parse(to),
    };
    const monthlyPeriod = {
      start: Date.parse(from),
      end: Date.parse(to),
    };
    const otherSubscriptions = [
      {
        frequency: { interval: 'year', intervalCount: 1 },
        period: annualPeriod,
      },
      {
        frequency: { interval: 'month', intervalCount: 3 },
        period: annualPeriod,
      },
    ];

    beforeEach(() => {
      Object.assign(team, {
        billing: {
          plan: 'pro',
          period: annualPeriod,
          subscriptions: [
            ...otherSubscriptions,
            {
              frequency: { interval: 'month', intervalCount: 1 },
              period: monthlyPeriod,
            },
          ],
        },
      });
    });

    it.each([
      true,
      false,
    ])('prefers the monthly usage period (primary period present: %s)', async hasPrimaryPeriod => {
      if (!hasPrimaryPeriod) {
        delete (team.billing as { period?: unknown }).period;
      }
      const requests = useBillingCosts(costsFixture());
      client.setArgv('usage', '--json');

      expect(await usage(client)).toBe(0);
      expect(requests[0]).toMatchObject({ from, to });
      expect(readJson().period).toEqual({ from, to });
    });

    it('shows the monthly usage period in the human header', async () => {
      useBillingCosts(costsFixture());
      client.setArgv('usage');

      expect(await usage(client)).toBe(0);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Billing cycle:');
      expect(stderr).toContain('Dec 1, 2025–Jan 1, 2026');
      expect(stderr).not.toContain('Jan 1, 2025');
    });

    it.each([
      { name: 'empty', subscriptions: [] },
      { name: 'non-monthly', subscriptions: otherSubscriptions },
    ])('falls back to billing.period with $name subscriptions', async ({
      subscriptions,
    }) => {
      Object.assign(team, {
        billing: { plan: 'pro', period: annualPeriod, subscriptions },
      });
      const requests = useBillingCosts(costsFixture());
      const expected = { from: new Date(annualPeriod.start).toISOString(), to };
      client.setArgv('usage', '--json');

      expect(await usage(client)).toBe(0);
      expect(requests[0]).toMatchObject(expected);
      expect(readJson().period).toEqual(expected);
    });

    it('preserves explicit dates instead of the monthly usage period', async () => {
      const requests = useBillingCosts(costsFixture());
      client.setArgv(
        'usage',
        '--since',
        '2025-11-01',
        '--until',
        '2025-11-30',
        '--json'
      );
      const expected = {
        from: '2025-11-01T07:00:00.000Z',
        to: '2025-12-01T08:00:00.000Z',
      };

      expect(await usage(client)).toBe(0);
      expect(requests[0]).toMatchObject(expected);
      expect(readJson().period).toEqual(expected);
    });
  });

  it('falls back to the Pacific month start and current ISO time without billing.period', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.parse('2025-12-15T12:34:56.789Z')
    );
    const requests = useBillingCosts(costsFixture());
    client.setArgv('usage', '--json');
    expect(await usage(client)).toBe(0);
    expect(requests[0]).toMatchObject({ from, to: '2025-12-15T12:34:56.789Z' });
    expect(readJson().period).toEqual({ from, to: '2025-12-15T12:34:56.789Z' });
  });

  it.each(
    modes
  )('fails instead of reporting zero usage when summary is missing in $name', async ({
    args,
  }) => {
    const fixture = costsFixture();
    delete fixture.results.views.byProduct;
    useBillingCosts(fixture);
    client.setArgv('usage', ...dates, ...args, '--json');
    expect(await usage(client)).toBe(1);
    expect(client.stdout.getFullOutput()).toBe('');
    expect(client.stderr.getFullOutput()).toContain(
      'The billing API did not return the requested usage summary.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('No usage data found');
  });

  describe.each([
    { flag: '--json', args: ['--json'] },
    { flag: '--format json', args: ['--format', 'json'] },
  ])('$flag empty output', ({ args: jsonArgs }) => {
    it.each(modes)('keeps $name stdout clean without legacy fields', async ({
      args,
    }) => {
      const fixture = costsFixture();
      fixture.results.times = [];
      for (const view of Object.values(fixture.results.views)) {
        view.results = [];
      }
      useBillingCosts(fixture);
      client.stdout.isTTY = false;
      client.stderr.isTTY = false;
      client.setArgv('usage', ...dates, ...args, ...jsonArgs);
      expect(await usage(client)).toBe(0);
      const json = readJson();
      expect(json.services).toEqual([]);
      expect(json.totals).toEqual({ cost: 0 });
      if (json.breakdown) expect(json.breakdown.data).toEqual([]);
      if (json.groupBy) expect(json.groupBy.data).toEqual([]);
    });
  });

  describe.each([
    'USD',
    'managed_infrastructure_units',
  ] as const)('%s credit ledgers', currency => {
    it.each([
      false,
      true,
    ])('selects only the matching currency (reordered: %s)', async reversed => {
      Object.assign(team, { billing: { plan: 'enterprise' } });
      const fixture = costsFixture(currency);
      useBillingCosts(fixture);
      const creditLedgers = [
        ledger('EUR', 500, 400),
        ledger('USD', 20, 5),
        ledger('managed_infrastructure_units', 1000, 750),
      ];
      useCredit({
        cadence: 'monthly',
        creditLedgers: reversed ? creditLedgers.reverse() : creditLedgers,
      });
      client.setArgv('usage', '--json');
      expect(await usage(client)).toBe(0);
      const json = readJson();
      expect(json.costUnit).toBe(currency);
      expect(json.creditBalance).toEqual(
        currency === 'USD'
          ? {
              cadence: 'monthly',
              currency,
              allocated: 20,
              used: 15,
              remaining: 5,
            }
          : {
              cadence: 'monthly',
              currency,
              allocated: 1000,
              used: 250,
              remaining: 750,
            }
      );
      expect(json.totals).toEqual({ cost: 63 });
    });

    describe.each(['monthly', 'annual'] as const)('%s credits', cadence => {
      it.each([
        0, 750,
      ])('does not apply active-block consumption to accrued cost (remaining: %s)', async remaining => {
        Object.assign(team, { billing: { plan: 'enterprise' } });
        const fixture = costsFixture(currency);
        useBillingCosts(fixture);
        useCredit({
          cadence,
          creditLedgers: [ledger(currency, 1000, remaining)],
        });
        client.setArgv('usage');
        expect(await usage(client)).toBe(0);
        const output = client.stderr.getFullOutput();
        expect(output).toContain('Current credit balance');
        expect(output).toContain(cadence === 'monthly' ? 'Monthly' : 'Annual');
        expect(output).toMatch(
          currency === 'USD'
            ? /Estimated total\s+\$63\.00/
            : /Estimated total\s+63 MIUs/
        );
        expect(output).toContain(
          `Accrued through Dec 15, 2025 in ${currency === 'USD' ? 'USD' : 'MIUs'}, before credits and discounts.`
        );
        expect(output).toMatch(
          new RegExp(`Progress\\s+${remaining === 0 ? 100 : 25}%`)
        );
        expect(output).not.toContain('Credits applied');
        expect(output).not.toContain('Estimated bill');
        expect(client.stdout.getFullOutput()).toBe('');
      });
    });
  });

  it('omits creditBalance when no ledger matches the account cost unit', async () => {
    Object.assign(team, { billing: { plan: 'enterprise' } });
    useBillingCosts(costsFixture());
    useCredit({
      cadence: 'monthly',
      creditLedgers: [
        ledger('managed_infrastructure_units', 1000, 0),
        ledger('EUR', 200, 10),
      ],
    });
    client.setArgv('usage', '--json');
    expect(await usage(client)).toBe(0);
    const json = readJson();
    expect(json).not.toHaveProperty('creditBalance');
    expect(json.totals).toEqual({ cost: 63 });
  });
});
