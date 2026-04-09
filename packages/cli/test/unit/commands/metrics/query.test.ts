import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import query from '../../../../src/commands/metrics/query';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import * as linkModule from '../../../../src/util/projects/link';
import getScope from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScope);

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

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as never,
    user: { id: 'user_dummy' } as never,
  });
}

describe('metrics query v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
  });

  it('queries a metric through the v2 endpoint', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
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

    client.setArgv('metrics', '--metric', 'vercel.edge_requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(postedBody?.metric).toBe('vercel.edge_requests.count');
  });

  it('guides the user when a non-queryable metric is used for querying', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'metric_not_queryable',
          message: 'Metric "vercel.edge_requests" is not directly queryable.',
          allowedValues: ['vercel.edge_requests.count'],
        },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.edge_requests');
    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('not directly queryable');
    expect(client.stderr.getFullOutput()).toContain(
      'Available values: vercel.edge_requests.count'
    );
  });

  it('surfaces the API quota message for 402 responses', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(402).json({
        error: {
          code: 'payment_required',
          message:
            'You have reached the daily observability metrics query limit for your team. Request a higher usage limit from your Vercel account team.',
        },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.edge_requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You have reached the daily observability metrics query limit'
    );
  });

  it('shows a friendly message for 429 responses', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message:
            'Too many requests. Please wait and try again. If you need a higher limit, request one from your Vercel account team.',
        },
      });
    });

    client.setArgv('metrics', '--metric', 'vercel.edge_requests.count');

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Too many requests. Please wait and try again.'
    );
  });

  it('shows available aggregations when the API rejects an aggregation', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'invalid_aggregation',
          message:
            'Aggregation "median" is not valid for metric "vercel.edge_requests.count".',
          allowedValues: ['sum'],
        },
      });
    });

    client.setArgv(
      'metrics',
      '--metric',
      'vercel.edge_requests.count',
      '-a',
      'median'
    );

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Available values: sum');
  });

  it('shows available dimensions when the API rejects a groupBy dimension', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    client.scenario.post('/v2/observability/query', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'invalid_dimension',
          message:
            'Group by uses invalid dimension "not_a_dimension" for metric "vercel.edge_requests.count".',
          allowedValues: ['route', 'request_path'],
        },
      });
    });

    client.setArgv(
      'metrics',
      '--metric',
      'vercel.edge_requests.count',
      '--group-by',
      'not_a_dimension'
    );

    const exitCode = await query(client, new MockTelemetry());

    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Available values: route, request_path'
    );
  });
});
