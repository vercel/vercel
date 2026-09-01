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
}: {
  total?: number;
  remaining?: number;
  cadence?: 'one_time' | 'annual' | 'monthly' | 'quarterly' | 'semi_annual';
} = {}) {
  client.scenario.get('/v1/invoices/pre-commitment-usage', (_req, res) => {
    res.json({
      creditLedgers: [
        {
          currency: 'USD',
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
  quantityUnit: 'inferred' | 'none' = 'inferred'
) {
  client.scenario.post('/v2/billing/costs', (_req, res) => {
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

    res.json({
      metrics: [
        {
          slug: 'gross_cost',
          title: 'Cost',
          unit: { kind: 'standard', name: 'USD' },
        },
        {
          slug: 'quantity',
          title: 'Usage',
          unit:
            quantityUnit === 'none'
              ? null
              : charges.some(
                    charge => charge.Tags.Category !== 'Subscription Licenses'
                  )
                ? { kind: 'custom', singular: 'unit', plural: 'units' }
                : null,
        },
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
              metrics: ['gross_cost', 'quantity'],
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
            groupBy: ['product', 'region', 'project'],
            results: charges.map(charge => ({
              dimensionValues: {
                product: charge.ServiceName,
                project: charge.Tags.ProjectId ?? null,
                region: charge.RegionId ?? null,
              },
              metrics: ['gross_cost', 'quantity'],
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
      expect(output).toContain('--all');
      expect(output).toContain('--format');
    });
  });

  describe('with team context', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
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

    it('should identify a selected team as the billing target', async () => {
      client.config.currentTeam = 'team_dummy';
      useBillingCharges([]);

      client.setArgv('usage', '--from', '2025-12-01', '--to', '2025-12-31');
      expect(await usage(client)).toEqual(0);

      expect(client.getFullOutput()).toContain('Usage for team');
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

    it('should hide empty services by default and show them with --all', async () => {
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
      let output = client.getFullOutput();
      expect(output).toContain('Used Service');
      expect(output).not.toContain('Flat Rate CDN Advanced');
      expect(output).toContain('1 service with no usage hidden');

      const previousOutputLength = output.length;
      client.setArgv(
        'usage',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31',
        '--all'
      );
      expect(await usage(client)).toEqual(0);
      output = client.getFullOutput().slice(previousOutputLength);
      expect(output).toContain('Flat Rate CDN Advanced');
      expect(output).toContain('1 license');
      expect(output).not.toContain('1 licenses');
      expect(output).not.toContain('with no usage hidden');
    });

    it('should singularize license units regardless of service category', async () => {
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
      expect(output).toMatch(/v0 Enterprise\s+1 license/);
      expect(output).toMatch(/Standard Enterprise Support\s+1 license/);
      expect(output).not.toContain('1 licenses');
    });

    it('should preserve an explicit scope in the show-all command', async () => {
      useBillingCharges([
        createMockCharge({
          ServiceName: 'Unused Service',
          ConsumedQuantity: 0,
          BilledCost: 0,
        }),
      ]);

      client.setArgv(
        'usage',
        '--scope',
        'team_dummy',
        '--from',
        '2025-12-01',
        '--to',
        '2025-12-31'
      );
      expect(await usage(client)).toEqual(0);
      expect(client.getFullOutput()).toContain(
        'Show all with: vc usage --scope team_dummy --all'
      );
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
      expect(output).toContain('12.04K units');
      expect(output).toContain('Edge Requests (Flat Rate CDN)');
      expect(output).toContain('Effective Cost');
      expect(output).toContain('$0.00');
      expect(output).not.toContain('Net Cost');
      expect(output).not.toContain('Amount due');
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
      expect(json.pricingUnit).toEqual('USD');
      expect(json.services[0].name).toEqual('Serverless Function Execution');
      expect(json.services[0].quantity).toEqual(1000000);
      expect(json.services[0].unit).toEqual('units');
      expect(json.totals.cost).toEqual(10);
      expect(json.totals.billedCost).toEqual(10);
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
      expect(json.breakdown.data[0].totals.billedCost).toEqual(10);
      expect(json.breakdown.data[1].totals.billedCost).toEqual(20);
      // Grand totals should still be present
      expect(json.totals.billedCost).toEqual(30);
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
      // Sorted by billedCost descending
      expect(json.groupBy.data[0].name).toEqual('my-api');
      expect(json.groupBy.data[0].totals.billedCost).toEqual(20);
      expect(json.groupBy.data[1].name).toEqual('my-web-app');
      expect(json.groupBy.data[1].totals.billedCost).toEqual(10);
      // Grand totals should still be present
      expect(json.totals.billedCost).toEqual(30);
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
