import { describe, it, expect, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import usage from '../../../../src/commands/usage';
import type { FocusCharge } from '../../../../src/util/billing/focus-charge';

function createMockCharge(overrides: Partial<FocusCharge> = {}): FocusCharge {
  return {
    ServiceName: 'Serverless Function Execution',
    PricingQuantity: 100,
    PricingUnit: 'MIUs',
    PricingCategory: 'Committed',
    PricingCurrency: 'USD',
    EffectiveCost: 0,
    BilledCost: 0,
    ChargePeriodStart: '2025-12-01T08:00:00.000Z',
    ChargePeriodEnd: '2025-12-02T08:00:00.000Z',
    ConsumedQuantity: 1000000,
    ConsumedUnit: 'GB-Seconds',
    ChargeCategory: 'Usage',
    BillingCurrency: 'USD',
    RegionId: 'iad1',
    RegionName: 'Washington, D.C., USA',
    ServiceCategory: 'Compute',
    ServiceProviderName: 'Vercel',
    Tags: {},
    ...overrides,
  };
}

function useCommitmentUsage({
  total = 20,
  remaining = 17.96,
  cadence = 'monthly',
  currency = 'USD',
}: {
  total?: number;
  remaining?: number;
  cadence?: 'one_time' | 'annual' | 'monthly' | 'quarterly' | 'semi_annual';
  currency?: string;
} = {}) {
  client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
    res.json({
      creditLedgers: [
        {
          currency,
          title: 'Infrastructure credit',
          periodStart: '2025-12-01T08:00:00.000Z',
          periodEnd: '2026-01-01T08:00:00.000Z',
          total,
          remaining,
        },
      ],
      cadence,
    });
  });
}

function useBillingCharges(
  charges: FocusCharge[] = [],
  quantityUnit: 'inferred' | 'none' = 'inferred',
  onRequest?: (request: { body: unknown; query: unknown }) => void,
  detailGroupBy = ['product', 'region', 'project'],
  costUnit: 'USD' | 'managed_infrastructure_units' = 'USD'
) {
  client.scenario.post('/v2/billing/costs', (req, res) => {
    onRequest?.({ body: req.body, query: req.query });
    const products = Object.fromEntries(
      charges.map(charge => [
        charge.ServiceName,
        {
          title: charge.ServiceName,
          category:
            charge.Tags.Category === 'Subscription Licenses'
              ? 'Subscription Licenses'
              : 'Vercel Functions',
        },
      ])
    );
    const projects = Object.fromEntries(
      charges.flatMap(charge =>
        charge.Tags.ProjectId
          ? [[charge.Tags.ProjectId, { title: charge.Tags.ProjectName }]]
          : []
      )
    );
    const regions = Object.fromEntries(
      charges.flatMap(charge =>
        charge.RegionId ? [[charge.RegionId, { title: charge.RegionName }]] : []
      )
    );
    const times = [
      ...new Set(charges.map(charge => charge.ChargePeriodStart)),
    ].sort();
    const quantityMetricSlug = (charge: FocusCharge) =>
      `usage_${charge.ServiceName.replaceAll(' ', '_').toLowerCase()}`;

    res.json({
      metrics: [
        {
          slug: 'gross_cost',
          title: 'Cost',
          unit:
            costUnit === 'USD'
              ? { kind: 'custom', singular: 'dollar', plural: 'dollars' }
              : { kind: 'custom', singular: 'MIU', plural: 'MIUs' },
        },
        ...charges.map(charge => ({
          slug: quantityMetricSlug(charge),
          title: charge.ServiceName,
          unit:
            quantityUnit === 'none' ||
            charge.Tags.Category === 'Subscription Licenses'
              ? null
              : charge.ConsumedUnit === 'byte'
                ? { kind: 'digitalStorage', name: 'byte' }
                : {
                    kind: 'custom',
                    singular: charge.ConsumedUnit.replace(/s$/, ''),
                    plural: charge.ConsumedUnit,
                  },
        })),
      ],
      from: times.at(0) ?? '2025-12-01T08:00:00.000Z',
      to: '2026-01-01T08:00:00.000Z',
      queriedAt: '2025-12-15T12:00:00.000Z',
      results: {
        granularity: { unit: 'day', step: 1 },
        times,
        dimensionsMeta: {
          product: { values: products },
          project: { values: projects },
          region: { values: regions },
        },
        views: {
          byProduct: {
            groupBy: ['product'],
            results: charges.map(charge => ({
              dimensionValues: { product: charge.ServiceName },
              metrics: ['gross_cost', quantityMetricSlug(charge)],
              values: times.map(time =>
                time === charge.ChargePeriodStart
                  ? [charge.BilledCost, charge.ConsumedQuantity]
                  : [0, 0]
              ),
              totalValue: [charge.BilledCost, charge.ConsumedQuantity],
              flatRate: charge.Tags.FlatRate === 'true',
            })),
          },
          byProductRegionProject: {
            groupBy: detailGroupBy,
            results: charges.map(charge => ({
              dimensionValues: {
                product: charge.ServiceName,
                project: charge.Tags.ProjectId ?? null,
                region: charge.RegionId ?? null,
              },
              metrics: ['gross_cost', quantityMetricSlug(charge)],
              values: times.map(time =>
                time === charge.ChargePeriodStart
                  ? [charge.BilledCost, charge.ConsumedQuantity]
                  : [0, 0]
              ),
              totalValue: [charge.BilledCost, charge.ConsumedQuantity],
              flatRate: charge.Tags.FlatRate === 'true',
            })),
          },
        },
      },
    });
  });
}

describe('usage', () => {
  describe('--help', () => {
    it('should display help and track telemetry', async () => {
      client.setArgv('usage', '--help');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'usage',
        },
      ]);
    });

    it('should display help with options', async () => {
      client.setArgv('usage', '--help');
      await usage(client);

      const output = client.getFullOutput();
      expect(output).toContain('Show billing usage');
      expect(output).toContain('--from');
      expect(output).toContain('--to');
      expect(output).toContain('--breakdown');
      expect(output).not.toContain('--all');
      expect(output).toContain('--format');
    });
  });

  describe('with team context', () => {
    let team: Record<string, unknown>;

    beforeEach(() => {
      useUser();
      const teams = useTeams('team_dummy');
      team = Array.isArray(teams) ? teams[0] : teams.teams[0];
      Object.assign(team, {
        billing: { plan: 'enterprise', planIteration: 'unbundled' },
      });
    });

    it('should fetch and display usage data', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
        }),
        createMockCharge({
          ServiceName: 'Edge Middleware Invocations',
          PricingQuantity: 50,
          BilledCost: 5,
          EffectiveCost: 4,
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Serverless Function Execution');
      expect(output).toContain('Edge Middleware Invocations');
      expect(output).toContain('Usage for personal account');
      expect(output).toContain('Usage through: Dec 15, 2025');
      expect(output).toContain('Infrastructure subtotal');
      expect(output).toContain('Infrastructure usage    $15.00');
      expect(output).toContain('Estimated bill          $15.00');
    });

    it('should use the account cost currency and only request the detail view for group-by', async () => {
      const requests: Array<{ body: any; query: any }> = [];
      useBillingCharges([], 'inferred', request => requests.push(request));

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      expect(requests[0].body).not.toHaveProperty('currency');
      expect(requests[0].body.views).toEqual({
        byProduct: { groupBy: ['product'] },
      });
      expect(requests[0].query).not.toHaveProperty('from');
      expect(requests[0].query).not.toHaveProperty('to');

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project'
      );
      expect(await usage(client)).toEqual(0);
      expect(requests[1].body.views.byProductRegionProject).toEqual({
        groupBy: ['product', 'region', 'project'],
      });
    });

    it('should reject group-by when the API strips the requested dimension', async () => {
      useBillingCharges([], 'inferred', undefined, ['product']);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project'
      );
      expect(await usage(client)).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'Usage cannot be grouped by project for this team.'
      );
    });

    it('should identify a selected team as the billing target', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);

      expect(client.getFullOutput()).toContain('Usage for team');
    });

    it('should skip the precommitment request for teams without precommitment', async () => {
      client.config.currentTeam = 'team_dummy';
      Object.assign(team, {
        billing: { plan: 'pro', planIteration: 'unbundled' },
      });
      useBillingCharges([]);
      let requested = false;
      client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
        requested = true;
        res.json({ creditLedgers: [] });
      });

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);
      expect(requested).toEqual(false);
    });

    it.each([
      ['plus', { plan: 'pro', planIteration: 'plus' }],
      ['Pro Flex', { plan: 'pro', planIteration: 'flex' }],
    ])('should request precommitment usage for %s teams', async (_name, billing) => {
      client.config.currentTeam = 'team_dummy';
      Object.assign(team, { billing });
      useBillingCharges([]);
      let requested = false;
      client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
        requested = true;
        res.json({ creditLedgers: [] });
      });

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);
      expect(requested).toEqual(true);
    });

    it('should display the current monthly infrastructure credit for a team', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);
      useCommitmentUsage();

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('Credit');
      expect(output).toContain('Cadence    Monthly');
      expect(output).toContain('Used       $2.04 of $20.00');
      expect(output).toContain('Remaining  $17.96');
      expect(output).toContain('Progress   10%');
    });

    it('should display and apply MIU credits to MIU costs', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges(
        [
          createMockCharge({
            ServiceName: 'Infrastructure usage',
            BilledCost: 10,
          }),
        ],
        'inferred',
        undefined,
        ['product', 'region', 'project'],
        'managed_infrastructure_units'
      );
      useCommitmentUsage({
        total: 1000,
        remaining: 750,
        currency: 'managed_infrastructure_units',
      });

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('Used       250 MIUs of 1,000 MIUs');
      expect(output).toContain('Remaining  750 MIUs');
      expect(output).toMatch(/Infrastructure usage\s+10 MIUs/);
      expect(output).toMatch(/Credits applied\s+-10 MIUs/);
      expect(output).toMatch(/Estimated bill\s+0 MIUs/);
    });

    it('should explain how credits affect the estimated bill', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Infrastructure usage',
          BilledCost: 2.04,
        }),
        createMockCharge({
          ServiceName: 'Subscriptions',
          ConsumedQuantity: 1,
          BilledCost: 115,
          Tags: { Category: 'Subscription Licenses' },
        }),
      ]);
      useCommitmentUsage();

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toMatch(/Subscriptions\s+\$115\.00/);
      expect(output).toMatch(/Infrastructure usage\s+\$2\.04/);
      expect(output).toMatch(/Credits applied\s+-\$2\.04/);
      expect(output).toMatch(/Estimated bill\s+\$115\.00/);
    });

    it('should include the current infrastructure credit in JSON output', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);
      useCommitmentUsage();

      client.setArgv('usage', '--format', 'json');
      expect(await usage(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.credit).toEqual({
        cadence: 'monthly',
        currency: 'USD',
        allocated: 20,
        used: 2.04,
        remaining: 17.96,
        progress: 10.2,
      });
    });

    it('should include the account MIU cost unit in JSON output', async () => {
      useBillingCharges(
        [createMockCharge({ BilledCost: 10 })],
        'inferred',
        undefined,
        ['product', 'region', 'project'],
        'managed_infrastructure_units'
      );

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      expect(await usage(client)).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput()).costUnit).toEqual(
        'managed_infrastructure_units'
      );
    });

    it('should continue when current infrastructure credit is unavailable', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);
      client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
        res.status(500).json({ error: { message: 'Unavailable' } });
      });

      client.setArgv('usage');
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).toContain('No usage data found');
      expect(client.getFullOutput()).not.toContain('Cadence    Monthly');
    });

    it('should omit current infrastructure credit for a custom date range', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).not.toContain('Cadence    Monthly');
    });

    it('should distinguish small nonzero usage from exact zero', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Small Positive Usage',
          ConsumedQuantity: 0.004,
          BilledCost: 1,
        }),
        createMockCharge({
          ServiceName: 'Small Negative Usage',
          ConsumedQuantity: -0.004,
          BilledCost: 1,
        }),
        createMockCharge({
          ServiceName: 'Fixed Fee',
          ConsumedQuantity: 0,
          BilledCost: 1,
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toMatch(
        /Small Positive Usage\s+<0\.01 GB-Seconds\s+\$1\.00/
      );
      expect(output).toMatch(
        /Small Negative Usage\s+>-0\.01 GB-Seconds\s+\$1\.00/
      );
      expect(output).toMatch(/Fixed Fee\s+0 GB-Seconds\s+\$1\.00/);
    });

    it('should preserve small nonzero usage in JSON output', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Small Usage',
          ConsumedQuantity: 0.004,
          BilledCost: 1,
        }),
      ]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      expect(await usage(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.services[0].quantity).toEqual(0.004);
    });

    it('should hide empty services', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Used Service',
          ConsumedQuantity: 10,
          BilledCost: 2,
          EffectiveCost: 1,
        }),
        createMockCharge({
          ServiceName: 'Flat Rate CDN Advanced',
          ConsumedQuantity: 0,
          BilledCost: 0,
          EffectiveCost: 0,
          Tags: { Category: 'Subscription Licenses' },
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Used Service');
      expect(output).not.toContain('Flat Rate CDN Advanced');
      expect(output).toContain('1 service with no usage hidden');
      expect(output).not.toContain('Show all with:');
    });

    it('should pluralize the hidden services hint', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Empty Usage',
          ConsumedQuantity: 0,
        }),
        createMockCharge({
          ServiceName: 'Empty Subscription',
          ConsumedQuantity: 0,
          Tags: { Category: 'Subscription Licenses' },
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).toContain(
        '2 services with no usage hidden'
      );
    });

    it('should omit unknown product units', async () => {
      useBillingCharges(
        [
          createMockCharge({
            ServiceName: 'v0 Enterprise',
            ConsumedQuantity: 1,
            BilledCost: 100,
          }),
          createMockCharge({
            ServiceName: 'Standard Enterprise Support',
            ConsumedQuantity: 1,
            BilledCost: 50,
          }),
        ],
        'none'
      );

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toMatch(/v0 Enterprise\s+1\s+\$100\.00/);
      expect(output).toMatch(/Standard Enterprise Support\s+1\s+\$50\.00/);
      expect(output).not.toContain('unit');
      expect(output).not.toContain('license');
    });

    it('should display included Flat Rate CDN usage in consumed units', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 12040,
          ConsumedUnit: 'requests',
          PricingQuantity: 2,
          EffectiveCost: 0,
          BilledCost: 2,
          Tags: { FlatRate: 'true' },
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('12.04K requests');
      expect(output).toContain('Edge Requests');
      expect(output).not.toContain('Edge Requests (Flat Rate CDN)');
      expect(output).toContain('Effective Cost');
      expect(output).toContain('$0.00');
      expect(output).not.toContain('Net Cost');
      expect(output).not.toContain('Amount due');
    });

    it('should use singular custom units', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 1,
          ConsumedUnit: 'requests',
          BilledCost: 1,
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).toMatch(
        /Edge Requests\s+1 request\s+\$1\.00/
      );
    });

    it('should format digital storage while preserving raw JSON quantities', async () => {
      const charge = createMockCharge({
        ServiceName: 'Data Transfer',
        ConsumedQuantity: 1_500_000_000,
        ConsumedUnit: 'byte',
        BilledCost: 1,
      });
      useBillingCharges([charge]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).toMatch(
        /Data Transfer\s+1\.5 GB\s+\$1\.00/
      );

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      expect(await usage(client)).toEqual(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.services[0]).toEqual(
        expect.objectContaining({ quantity: 1_500_000_000, unit: 'byte' })
      );
    });

    it('should merge flat-rate and metered usage into one product row', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 12000,
          BilledCost: 0,
          Tags: { FlatRate: 'true' },
        }),
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 40,
          BilledCost: 2,
        }),
      ]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      expect(await usage(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.services).toEqual([
        expect.objectContaining({
          name: 'Edge Requests',
          product: 'Edge Requests',
          quantity: 12040,
          cost: 2,
          effectiveCost: 2,
          included: false,
        }),
      ]);
    });

    it('should preserve included status when the metered quantity is zero', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 12000,
          BilledCost: 0,
          Tags: { FlatRate: 'true' },
        }),
        createMockCharge({
          ServiceName: 'Edge Requests',
          ConsumedQuantity: 0,
          BilledCost: 0,
        }),
      ]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      expect(await usage(client)).toEqual(0);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.services).toEqual([
        expect.objectContaining({
          product: 'Edge Requests',
          quantity: 12000,
          included: true,
        }),
      ]);
    });

    it('should handle subscription metrics with a null unit', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Flat Rate CDN Standard',
          ConsumedQuantity: 1,
          BilledCost: 25,
          EffectiveCost: 25,
          Tags: { Category: 'Subscription Licenses' },
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Flat Rate CDN Standard');
      expect(output).toContain('1 license');
      expect(output).toContain('$25.00');
    });

    it('should separate subscription licenses from infrastructure usage', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Pro',
          ConsumedQuantity: 1,
          BilledCost: 20,
          Tags: { Category: 'Subscription Licenses' },
        }),
        createMockCharge({
          ServiceName: 'Function Invocations',
          ConsumedQuantity: 8340,
          BilledCost: 0.01,
        }),
      ]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Infrastructure');
      expect(output).toContain('Subscription licenses');
      expect(output).toContain('Estimated bill');
    });

    it('should output JSON with --format json', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--format',
        'json'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);
      expect(json.services).toHaveLength(1);
      expect(json.costUnit).toEqual('USD');
      expect(json.services[0].name).toEqual('Serverless Function Execution');
      expect(json.services[0].quantity).toEqual(1000000);
      expect(json.services[0].unit).toEqual('GB-Seconds');
      expect(json.services[0]).not.toHaveProperty('pricingQuantity');
      expect(json.services[0]).not.toHaveProperty('billedCost');
      expect(json.totals).toEqual({ cost: 10, effectiveCost: 10 });
      expect(json).not.toHaveProperty('chargeCount');
    });

    it('should track telemetry for date options', async () => {
      useBillingCharges([]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      await usage(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:from', value: '[REDACTED]' },
        { key: 'option:to', value: '[REDACTED]' },
      ]);
    });

    it('should handle empty response', async () => {
      useBillingCharges([]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('No usage data found');
    });

    it('should display daily breakdown with --breakdown daily', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          ChargePeriodStart: '2025-12-01T08:00:00.000Z',
        }),
        createMockCharge({
          ServiceName: 'Edge Middleware Invocations',
          PricingQuantity: 50,
          BilledCost: 5,
          EffectiveCost: 4,
          ChargePeriodStart: '2025-12-01T08:00:00.000Z',
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          ChargePeriodStart: '2025-12-02T08:00:00.000Z',
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'daily'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      // Should show daily breakdown with dates
      expect(output).toContain('2025-12-01');
      expect(output).toContain('2025-12-02');
      // Should show services
      expect(output).toContain('Serverless Function Execution');
      expect(output).toContain('Edge Middleware Invocations');
    });

    it('should treat subscription quantities as gauges in breakdowns', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Pro',
          ConsumedQuantity: 1,
          BilledCost: 20,
          ChargePeriodStart: '2025-12-01T08:00:00.000Z',
          Tags: { Category: 'Subscription Licenses' },
        }),
        createMockCharge({
          ServiceName: 'Pro',
          ConsumedQuantity: 1,
          BilledCost: 0,
          ChargePeriodStart: '2025-12-02T08:00:00.000Z',
          Tags: { Category: 'Subscription Licenses' },
        }),
      ]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'weekly'
      );
      expect(await usage(client)).toEqual(0);

      expect(client.getFullOutput()).toMatch(/Pro\s+1 license\s+\$20\.00/);
      expect(client.getFullOutput()).not.toContain('2 licenses');
    });

    it('should display weekly breakdown with --breakdown weekly', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          ChargePeriodStart: '2025-12-01T08:00:00.000Z',
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          ChargePeriodStart: '2025-12-08T08:00:00.000Z',
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'weekly'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      // Should show weekly breakdown with week identifiers
      expect(output).toContain('2025-W49');
      expect(output).toContain('2025-W50');
    });

    it('should display monthly breakdown with --breakdown monthly', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          ChargePeriodStart: '2025-11-15T08:00:00.000Z',
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          ChargePeriodStart: '2025-12-15T08:00:00.000Z',
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-11-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'monthly'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      // Should show monthly breakdown
      expect(output).toContain('2025-11');
      expect(output).toContain('2025-12');
    });

    it('should output JSON with breakdown data when --breakdown daily and --format json', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          ChargePeriodStart: '2025-12-01T08:00:00.000Z',
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          ChargePeriodStart: '2025-12-02T08:00:00.000Z',
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'daily',
        '--format',
        'json'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);
      expect(json.breakdown).toBeDefined();
      expect(json.breakdown.period).toEqual('daily');
      expect(json.breakdown.data).toHaveLength(2);
      expect(json.breakdown.data[0].periodKey).toEqual('2025-12-01');
      expect(json.breakdown.data[1].periodKey).toEqual('2025-12-02');
      expect(json.breakdown.data[0].totals).toEqual({
        cost: 10,
        effectiveCost: 10,
      });
      expect(json.breakdown.data[1].totals).toEqual({
        cost: 20,
        effectiveCost: 20,
      });
      expect(json.totals).toEqual({ cost: 30, effectiveCost: 30 });
    });

    it('should track telemetry for --breakdown option', async () => {
      useBillingCharges([]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'daily'
      );
      await usage(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:from', value: '[REDACTED]' },
        { key: 'option:to', value: '[REDACTED]' },
        { key: 'option:breakdown', value: 'daily' },
      ]);
    });

    it('should error on invalid breakdown period', async () => {
      useBillingCharges([]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'yearly'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(1);
      const output = client.getFullOutput();
      expect(output).toContain('Invalid breakdown period');
      expect(output).toContain('daily, weekly, monthly');
    });

    it('should display usage grouped by project with --group-by project', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          Tags: { ProjectId: 'prj_abc', ProjectName: 'my-web-app' },
        }),
        createMockCharge({
          ServiceName: 'Edge Middleware Invocations',
          PricingQuantity: 50,
          BilledCost: 5,
          EffectiveCost: 4,
          Tags: { ProjectId: 'prj_abc', ProjectName: 'my-web-app' },
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          Tags: { ProjectId: 'prj_def', ProjectName: 'my-api' },
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('my-web-app');
      expect(output).toContain('my-api');
      expect(output).toContain('Usage by Project');
    });

    it('should display usage grouped by region with --group-by region', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          RegionId: 'iad1',
          RegionName: 'Washington, D.C., USA',
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          RegionId: 'sfo1',
          RegionName: 'San Francisco, CA, USA',
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'region'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Washington, D.C., USA');
      expect(output).toContain('San Francisco, CA, USA');
      expect(output).toContain('Usage by Region');
    });

    it('should show (unattributed) for charges without project data', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          Tags: { ProjectId: 'prj_abc', ProjectName: 'my-web-app' },
        }),
        createMockCharge({
          ServiceName: 'Edge Middleware Invocations',
          PricingQuantity: 50,
          BilledCost: 5,
          EffectiveCost: 4,
          Tags: {},
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('my-web-app');
      expect(output).toContain('(unattributed)');
    });

    it('should show (global) for charges without region data', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          RegionId: 'iad1',
          RegionName: 'Washington, D.C., USA',
        }),
        createMockCharge({
          ServiceName: 'Edge Middleware Invocations',
          PricingQuantity: 50,
          BilledCost: 5,
          EffectiveCost: 4,
          RegionId: undefined,
          RegionName: undefined,
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'region'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain('Washington, D.C., USA');
      expect(output).toContain('(global)');
    });

    it('should output JSON with group-by data when --group-by project and --format json', async () => {
      const mockCharges = [
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 100,
          BilledCost: 10,
          EffectiveCost: 8,
          Tags: { ProjectId: 'prj_abc', ProjectName: 'my-web-app' },
        }),
        createMockCharge({
          ServiceName: 'Serverless Function Execution',
          PricingQuantity: 200,
          BilledCost: 20,
          EffectiveCost: 16,
          Tags: { ProjectId: 'prj_def', ProjectName: 'my-api' },
        }),
      ];
      useBillingCharges(mockCharges);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project',
        '--format',
        'json'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(0);
      const output = client.stdout.getFullOutput();
      const json = JSON.parse(output);
      expect(json.groupBy).toBeDefined();
      expect(json.groupBy.dimension).toEqual('project');
      expect(json.groupBy.data).toHaveLength(2);
      // Sorted by cost descending
      expect(json.groupBy.data[0].name).toEqual('my-api');
      expect(json.groupBy.data[0].totals).toEqual({
        cost: 20,
        effectiveCost: 20,
      });
      expect(json.groupBy.data[1].name).toEqual('my-web-app');
      expect(json.groupBy.data[1].totals).toEqual({
        cost: 10,
        effectiveCost: 10,
      });
      expect(json.totals).toEqual({ cost: 30, effectiveCost: 30 });
    });

    it('should error when --breakdown and --group-by are used together', async () => {
      useBillingCharges([]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--breakdown',
        'daily',
        '--group-by',
        'project'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(1);
      const output = client.getFullOutput();
      expect(output).toContain(
        '--breakdown and --group-by cannot be used together'
      );
    });

    it('should error on invalid group-by dimension', async () => {
      useBillingCharges([]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'user'
      );
      const exitCode = await usage(client);

      expect(exitCode).toEqual(1);
      const output = client.getFullOutput();
      expect(output).toContain('Invalid group-by dimension');
      expect(output).toContain('project, region');
    });

    it('should track telemetry for --group-by option', async () => {
      useBillingCharges([]);

      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--group-by',
        'project'
      );
      await usage(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:from', value: '[REDACTED]' },
        { key: 'option:to', value: '[REDACTED]' },
        { key: 'option:group-by', value: 'project' },
      ]);
    });
  });
});
