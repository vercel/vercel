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

describe('metrics schema v2', () => {
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
    client.setArgv('metrics', 'schema');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('1 Metric found');
    expect(output).toContain('Metric');
    expect(output).toContain('Description');
    expect(output).toContain('vercel.request.count');
    expect(output).toContain('Count');
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
              dimensions: [
                { name: 'route', label: 'Route' },
                { name: 'http_status', label: 'HTTP Status' },
              ],
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
      client.setArgv('metrics', 'schema', '--format=json');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:format', value: 'json' },
      ]);
    });
  });
});
