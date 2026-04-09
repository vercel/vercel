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
        metrics: [{ id: 'vercel.edge_requests.count', description: 'Count' }],
      });
    });
    client.setArgv('metrics', 'schema');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toMatchSnapshot();
  });

  it('shows prefix detail with --metric', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.edge_requests',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.edge_requests.count',
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
    client.setArgv('metrics', 'schema', '--metric', 'vercel.edge_requests');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(
      'vercel.edge_requests.count'
    );
    expect(client.stderr.getFullOutput()).toContain('sum (default)');
  });

  describe('telemetry', () => {
    it('should track metric option', async () => {
      client.scenario.get(
        '/v2/observability/schema/vercel.edge_requests.count',
        (_req, res) => {
          res.json([
            {
              id: 'vercel.edge_requests.count',
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
      client.setArgv(
        'metrics',
        'schema',
        '--metric',
        'vercel.edge_requests.count'
      );

      await schema(client, new MockTelemetry());

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:metric', value: 'vercel.edge_requests.count' },
      ]);
    });

    it('should track format option', async () => {
      client.scenario.get('/v2/observability/schema', (_req, res) => {
        res.json({
          metrics: [{ id: 'vercel.edge_requests.count', description: 'Count' }],
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
