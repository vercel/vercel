import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query from '../../../../src/commands/metrics/query';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

class MockTelemetry extends MetricsTelemetryClient {
  constructor() {
    super({ opts: { store: client.telemetryEventStore } });
  }
}

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_metricstest',
      name: 'my-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'team_dummy', slug: 'my-team', type: 'team' },
  });
}

describe('metrics query v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
  });

  it('queries a leaf metric through the v2 endpoint', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.requests.count',
      (_req, res) => {
        res.json({
          id: 'vercel.requests.count',
          description: 'Count',
          dimensions: [{ name: 'route', label: 'Route' }],
          metrics: [
            {
              id: 'vercel.requests.count',
              description: 'Count',
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ],
        });
      }
    );

    let postedBody: Record<string, unknown> | undefined;
    client.scenario.post('/v2/observability/query', (req, res) => {
      postedBody =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : (req.body as Record<string, unknown>);
      res.json({
        data: [],
        summary: [],
        statistics: { rowsRead: 10 },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(postedBody?.metric).toBe('vercel.requests.count');
  });

  it('guides the user when a non-queryable metric is used for querying', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.requests',
      (_req, res) => {
        res.json({
          id: 'vercel.requests',
          description: 'Request metrics',
          dimensions: [{ name: 'route', label: 'Route' }],
          metrics: [
            {
              id: 'vercel.requests.count',
              description: 'Count',
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ],
        });
      }
    );

    client.setArgv('metrics', '--metric', 'vercel.requests');
    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('not directly queryable');
    expect(client.stderr.getFullOutput()).toContain(
      'vercel metrics schema --metric vercel.requests'
    );
  });

  it('surfaces the API quota message for 402 responses', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.requests.count',
      (_req, res) => {
        res.json({
          id: 'vercel.requests.count',
          description: 'Count',
          dimensions: [{ name: 'route', label: 'Route' }],
          metrics: [
            {
              id: 'vercel.requests.count',
              description: 'Count',
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ],
        });
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(402).json({
        error: {
          code: 'payment_required',
          message:
            'You have reached the daily observability metrics query limit for your team. Please try again later or contact support if you need a higher limit.',
        },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You have reached the daily observability metrics query limit'
    );
  });

  it('shows a friendly message for 429 responses', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.requests.count',
      (_req, res) => {
        res.json({
          id: 'vercel.requests.count',
          description: 'Count',
          dimensions: [{ name: 'route', label: 'Route' }],
          metrics: [
            {
              id: 'vercel.requests.count',
              description: 'Count',
              unit: 'count',
              aggregations: ['sum'],
              defaultAggregation: 'sum',
            },
          ],
        });
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message:
            'Too many requests. Please wait and try again. If you need a higher limit, contact support.',
        },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Too many requests. Please wait and try again.'
    );
  });
});
