import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import schema from '../../../../src/commands/metrics/schema';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import getScope from '../../../../src/util/get-scope';

import { vi } from 'vitest';

vi.mock('../../../../src/util/get-scope');
const mockedGetScope = vi.mocked(getScope);
type ScopeResult = Awaited<ReturnType<typeof getScope>>;

class MockTelemetry extends MetricsTelemetryClient {
  constructor() {
    super({ opts: { store: client.telemetryEventStore } });
  }
}

describe('metrics schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: { id: 'team_dummy', slug: 'my-team' },
      user: { id: 'user_dummy' },
    } as ScopeResult);
  });

  it('lists metrics by default', async () => {
    client.scenario.get('/v2/observability/schema', (_req, res) => {
      res.json({
        metrics: [{ id: 'vercel.request.count', description: 'Count' }],
      });
    });
    client.scenario.get('/v1/metrics', (req, res) => {
      expect(req.query).toEqual({
        kind: 'custom',
        limit: '250',
        teamId: 'team_dummy',
      });
      res.json({
        metrics: [
          {
            id: 'checkout.duration',
            description: 'Checkout duration',
            dimensions: ['source'],
            unit: 'milliseconds',
            aggregations: ['count', 'sum', 'avg', 'p95'],
          },
          {
            id: 'vercel.accidental.custom',
            description: 'Must not be listed from the custom catalog',
            dimensions: [],
            unit: 'count',
            aggregations: ['count'],
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('2 Metrics found');
    expect(output).toContain('Metric');
    expect(output).toContain('Description');
    expect(output).toContain('vercel.request.count');
    expect(output).toContain('Count');
    expect(output).toContain('checkout.duration');
    expect(output).toContain('Checkout duration');
    expect(output).not.toContain('vercel.accidental.custom');
  });

  it('follows metric catalog pagination', async () => {
    client.scenario.get('/v2/observability/schema', (_req, res) => {
      res.json({ metrics: [] });
    });
    client.scenario.get('/v1/metrics', (req, res) => {
      if (req.query.cursor === 'next_page') {
        expect(req.query).toEqual({
          kind: 'custom',
          limit: '250',
          cursor: 'next_page',
          teamId: 'team_dummy',
        });
        res.json({
          metrics: [
            {
              id: 'checkout.revenue',
              description: 'Checkout revenue',
              dimensions: ['source'],
              unit: 'count',
              aggregations: ['count', 'sum'],
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        });
        return;
      }

      res.json({
        metrics: [
          {
            id: 'checkout.duration',
            description: 'Checkout duration',
            dimensions: ['source'],
            unit: 'count',
            aggregations: ['count', 'unique'],
          },
        ],
        pagination: { hasMore: true, nextCursor: 'next_page' },
      });
    });
    client.setArgv('metrics', 'schema');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('2 Metrics found');
    expect(output).toContain('checkout.duration');
    expect(output).toContain('checkout.revenue');
  });

  it('returns the combined legacy list shape as JSON', async () => {
    client.scenario.get('/v2/observability/schema', (_req, res) => {
      res.json({
        metrics: [{ id: 'vercel.request.count', description: 'Request Count' }],
      });
    });
    client.scenario.get('/v1/metrics', (_req, res) => {
      res.json({
        metrics: [
          {
            id: 'checkout.duration',
            description: 'Checkout duration',
            dimensions: ['source'],
            unit: 'milliseconds',
            aggregations: ['count', 'sum', 'avg'],
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', '--format=json');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const result = JSON.parse(client.stdout.getFullOutput());
    expect(result).toEqual([
      {
        id: 'checkout.duration',
        description: 'Checkout duration',
      },
      {
        id: 'vercel.request.count',
        description: 'Request Count',
      },
    ]);
  });

  it('reports an unknown metric prefix', async () => {
    client.scenario.get('/v1/metrics', (_req, res) => {
      res.json({
        metrics: [],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', 'checkout.unknown');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'No metrics match "checkout.unknown". Run `vercel metrics schema` to see available metrics.'
    );
  });

  it('reports an unknown metric prefix as JSON', async () => {
    client.scenario.get('/v1/metrics', (_req, res) => {
      res.json({
        metrics: [],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', 'checkout.unknown', '--format=json');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: {
        code: 'METRIC_NOT_FOUND',
        message:
          'No metrics match "checkout.unknown". Run `vercel metrics schema` to see available metrics.',
      },
    });
  });

  it('shows prefix detail with a positional metric', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.request',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.request.count',
            description: 'Count',
            dimensions: [
              { name: 'route', label: 'Route' },
              { name: 'http_status', label: 'HTTP Status' },
            ],
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
          {
            id: 'vercel.request.route_cpu_duration_ms',
            description: 'Request Duration',
            dimensions: [
              { name: 'route', label: 'Route' },
              { name: 'http_status', label: 'HTTP Status' },
              { name: 'cache_result', label: 'Cache Result' },
            ],
            unit: 'milliseconds',
            aggregations: ['avg', 'p95'],
            defaultAggregation: 'avg',
          },
        ]);
      }
    );
    client.setArgv('metrics', 'schema', 'vercel.request');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Shared dimensions:');
    expect(output).toContain('route, http_status');
    expect(output).toContain('Metric');
    expect(output).toContain('Description');
    expect(output).toContain('Unit');
    expect(output).toContain('Aggregations');
    expect(output).toContain('Dimensions');
    expect(output).toContain('vercel.request.count');
    expect(output).toContain('Count');
    expect(output).toContain('count');
    expect(output).toContain('sum (default)');
    expect(output).toContain('vercel.request.route_cpu_duration_ms');
    expect(output).toContain('Request Duration');
    expect(output).toContain('milliseconds');
    expect(output).toContain('avg (default), p95');
    expect(output).toContain('+cache_result');
    expect(output).toContain('—');
  });

  it('reads custom metric detail from the v1 catalog', async () => {
    client.scenario.get('/v1/metrics', (req, res) => {
      expect(req.query).toEqual({
        kind: 'custom',
        limit: '250',
        search: 'checkout.duration',
        teamId: 'team_dummy',
      });
      res.json({
        metrics: [
          {
            id: 'checkout.duration',
            description: 'Checkout duration',
            dimensions: ['source', 'functionRegion'],
            unit: 'milliseconds',
            aggregations: ['count', 'sum', 'avg', 'p95'],
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', 'checkout.duration');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('checkout.duration');
    expect(output).toContain('Checkout duration');
    expect(output).toContain('count, sum, avg, p95');
    expect(output).toContain('source, functionRegion');
  });

  it('omits the dimensions column when no metric has extra dimensions', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.request',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.request.count',
            description: 'Count',
            dimensions: [
              { name: 'route', label: 'Route' },
              { name: 'http_status', label: 'HTTP Status' },
            ],
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
          {
            id: 'vercel.request.route_cpu_duration_ms',
            description: 'Request Duration',
            dimensions: [
              { name: 'route', label: 'Route' },
              { name: 'http_status', label: 'HTTP Status' },
            ],
            unit: 'milliseconds',
            aggregations: ['avg', 'p95'],
            defaultAggregation: 'avg',
          },
        ]);
      }
    );
    client.setArgv('metrics', 'schema', 'vercel.request');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Shared dimensions:');
    expect(output).toContain('route, http_status');
    expect(output).toContain('Metric');
    expect(output).toContain('Description');
    expect(output).toContain('Unit');
    expect(output).toContain('Aggregations');
    expect(output).not.toContain('Dimensions');
    expect(output).toContain('Count');
    expect(output).toContain('Request Duration');
    expect(output).toContain('count');
    expect(output).toContain('milliseconds');
    expect(output).not.toContain('—');
  });

  describe('telemetry', () => {
    it('should track metric argument', async () => {
      client.scenario.get(
        '/v2/observability/schema/vercel.request.count',
        (_req, res) => {
          res.json([
            {
              id: 'vercel.request.count',
              description: 'Count',
              dimensions: [{ name: 'route', label: 'Route' }],
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ]);
        }
      );
      client.setArgv('metrics', 'schema', 'vercel.request.count');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
      ]);
    });

    it('should track format option', async () => {
      client.scenario.get('/v2/observability/schema', (_req, res) => {
        res.json({
          metrics: [{ id: 'vercel.request.count', description: 'Count' }],
        });
      });
      client.scenario.get('/v1/metrics', (_req, res) => {
        res.json({
          metrics: [],
          pagination: { hasMore: false, nextCursor: null },
        });
      });
      client.setArgv('metrics', 'schema', '--format=json');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:format', value: 'json' },
      ]);
    });
  });
});
