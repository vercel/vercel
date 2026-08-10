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

describe('metrics schema v1', () => {
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
    client.scenario.get('/v1/metrics', (req, res) => {
      expect(req.query).toEqual({
        includeLogs: 'false',
        limit: '250',
        teamId: 'team_dummy',
      });
      res.json({
        metrics: [
          {
            id: 'vercel.request.count',
            kind: 'system',
            description: 'Count',
            dimensions: ['route'],
            unit: 'count',
            aggregations: ['count', 'unique'],
            derivedFrom: {
              event: 'vercel.request',
              input: { kind: 'count' },
            },
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
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

  it('follows metric catalog pagination', async () => {
    client.scenario.get('/v1/metrics', (req, res) => {
      if (req.query.cursor === 'next_page') {
        expect(req.query).toEqual({
          includeLogs: 'false',
          limit: '250',
          cursor: 'next_page',
          teamId: 'team_dummy',
        });
        res.json({
          metrics: [
            {
              id: 'vercel.request.count',
              description: 'Request Count',
              dimensions: ['route'],
              unit: 'count',
              aggregations: ['count', 'unique'],
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        });
        return;
      }

      res.json({
        metrics: [
          {
            id: 'vercel.log.count',
            description: 'Log Count',
            dimensions: ['level'],
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
    expect(output).toContain('vercel.log.count');
    expect(output).toContain('vercel.request.count');
  });

  it('returns complete v1 descriptors as JSON', async () => {
    client.scenario.get('/v1/metrics', (_req, res) => {
      res.json({
        metrics: [
          {
            id: 'vercel.request.count',
            kind: 'system',
            description: 'Request Count',
            dimensions: ['route', 'httpStatus'],
            unit: 'count',
            aggregations: ['count', 'unique'],
            derivedFrom: {
              event: 'vercel.request',
              input: { kind: 'count' },
            },
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
        id: 'vercel.request.count',
        kind: 'system',
        description: 'Request Count',
        dimensions: ['route', 'httpStatus'],
        unit: 'count',
        aggregations: ['count', 'unique'],
        derivedFrom: {
          event: 'vercel.request',
          input: { kind: 'count' },
        },
      },
    ]);
  });

  it('shows prefix detail with a positional metric', async () => {
    client.scenario.get('/v1/metrics', (req, res) => {
      expect(req.query).toEqual({
        includeLogs: 'false',
        limit: '250',
        search: 'vercel.request',
        teamId: 'team_dummy',
      });
      res.json({
        metrics: [
          {
            id: 'vercel.request.count',
            description: 'Count',
            dimensions: ['route', 'httpStatus'],
            unit: 'count',
            aggregations: ['count', 'unique'],
          },
          {
            id: 'vercel.request.route_cpu_duration_ms',
            description: 'Request Duration',
            dimensions: ['route', 'httpStatus', 'cacheResult'],
            unit: 'milliseconds',
            aggregations: ['count', 'sum', 'avg', 'p95'],
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', 'vercel.request');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Shared dimensions:');
    expect(output).toContain('route, httpStatus');
    expect(output).toContain('Metric');
    expect(output).toContain('Description');
    expect(output).toContain('Unit');
    expect(output).toContain('Aggregations');
    expect(output).toContain('Dimensions');
    expect(output).toContain('vercel.request.count');
    expect(output).toContain('Count');
    expect(output).toContain('count');
    expect(output).toContain('count, unique');
    expect(output).toContain('vercel.request.route_cpu_duration_ms');
    expect(output).toContain('Request Duration');
    expect(output).toContain('milliseconds');
    expect(output).toContain('count, sum, avg, p95');
    expect(output).toContain('+cacheResult');
    expect(output).toContain('—');
  });

  it('omits the dimensions column when no metric has extra dimensions', async () => {
    client.scenario.get('/v1/metrics', (_req, res) => {
      res.json({
        metrics: [
          {
            id: 'vercel.request.count',
            description: 'Count',
            dimensions: ['route', 'httpStatus'],
            unit: 'count',
            aggregations: ['count', 'unique'],
          },
          {
            id: 'vercel.request.route_cpu_duration_ms',
            description: 'Request Duration',
            dimensions: ['route', 'httpStatus'],
            unit: 'milliseconds',
            aggregations: ['count', 'sum', 'avg', 'p95'],
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
      });
    });
    client.setArgv('metrics', 'schema', 'vercel.request');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Shared dimensions:');
    expect(output).toContain('route, httpStatus');
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
      client.scenario.get('/v1/metrics', (_req, res) => {
        res.json({
          metrics: [
            {
              id: 'vercel.request.count',
              description: 'Count',
              dimensions: ['route', 'httpStatus'],
              unit: 'count',
              aggregations: ['count', 'unique'],
            },
          ],
          pagination: { hasMore: false, nextCursor: null },
        });
      });
      client.setArgv('metrics', 'schema', 'vercel.request.count');

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:metric-id', value: 'vercel.request.count' },
      ]);
    });

    it('should track format option', async () => {
      client.scenario.get('/v1/metrics', (_req, res) => {
        res.json({
          metrics: [
            {
              id: 'vercel.request.count',
              description: 'Count',
              dimensions: ['route'],
              unit: 'count',
              aggregations: ['count', 'unique'],
            },
          ],
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
