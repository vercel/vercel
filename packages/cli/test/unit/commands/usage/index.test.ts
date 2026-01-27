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

function useBillingCharges(charges: FocusCharge[] = []) {
  client.scenario.get('/v1/billing/charges', (_req, res) => {
    res.setHeader('Content-Type', 'application/jsonl');
    // Stream JSONL response
    for (const charge of charges) {
      res.write(JSON.stringify(charge) + '\n');
    }
    res.end();
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
      expect(json.services[0].name).toEqual('Serverless Function Execution');
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
      // Should show Grand Total section
      expect(output).toContain('Grand Total');
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
      // Should show Grand Total section
      expect(output).toContain('Grand Total');
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
      // Should show Grand Total section
      expect(output).toContain('Grand Total');
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
  });
});
