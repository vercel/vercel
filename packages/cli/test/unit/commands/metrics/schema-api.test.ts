import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { fetchMetricDetail } from '../../../../src/commands/metrics/schema-api';

describe('metrics schema api', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns the dimensions reported by the schema endpoint as-is', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.analytics_event.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.analytics_event.count',
            description: 'Analytics Event Count',
            dimensions: [
              { name: 'route', label: 'Route' },
              { name: 'event_name', label: 'Analytics event name' },
            ],
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ]);
      }
    );

    const [detail] = await fetchMetricDetail(
      client,
      'team_dummy',
      'vercel.analytics_event.count'
    );

    expect(detail.dimensions.map(dimension => dimension.name)).toEqual([
      'route',
      'event_name',
    ]);
  });
});
