import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { fetchMetricDetail } from '../../../../src/commands/metrics/schema-api';

describe('metrics schema api', () => {
  beforeEach(() => {
    client.reset();
  });

  it('adds Web Analytics dimensions omitted by older schema responses', async () => {
    client.scenario.get(
      '/v2/observability/schema/vercel.analytics_event.count',
      (_req, res) => {
        res.json([
          {
            id: 'vercel.analytics_event.count',
            description: 'Analytics Event Count',
            dimensions: [{ name: 'route', label: 'Route' }],
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

    expect(detail.dimensions.map(dimension => dimension.name)).toEqual(
      expect.arrayContaining([
        'browser_name',
        'country',
        'device_type',
        'event_data',
        'event_name',
        'os_name',
        'project_id',
        'request_hostname',
        'utm_campaign',
        'utm_source',
      ])
    );
  });
});
