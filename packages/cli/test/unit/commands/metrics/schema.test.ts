import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import schema from '../../../../src/commands/metrics/schema';
import { MetricsTelemetryClient } from '../../../../src/util/telemetry/commands/metrics';
import getScope from '../../../../src/util/get-scope';

import { vi } from 'vitest';

vi.mock('../../../../src/util/get-scope');
const mockedGetScope = vi.mocked(getScope);

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
      team: { id: 'team_dummy', slug: 'my-team' } as never,
      user: { id: 'user_dummy' } as never,
    });
  });

  it('lists metrics by default', async () => {
    client.scenario.get('/v2/observability/schema', (_req, res) => {
      res.json({
        metrics: [{ id: 'vercel.requests.count', description: 'Count' }],
      });
    });
    client.setArgv('metrics', 'schema');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('vercel.requests.count');
  });

  it('shows prefix detail with --metric', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.requests',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );
    client.setArgv('metrics', 'schema', '--metric', 'vercel.requests');

    const exitCode = await schema(client, new MockTelemetry());

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('vercel.requests.count');
  });
});
