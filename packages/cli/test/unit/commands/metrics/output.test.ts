import { describe, expect, it } from 'vitest';
import {
  formatQueryJson,
  formatSchemaDetailJson,
  formatSchemaListJson,
} from '../../../../src/commands/metrics/output';

describe('metrics output', () => {
  it('formats v2 schema list output', () => {
    const result = JSON.parse(
      formatSchemaListJson([
        { id: 'vercel.edge_requests.count', description: 'Count' },
      ])
    );
    expect(result[0].id).toBe('vercel.edge_requests.count');
  });

  it('formats prefix schema detail output', () => {
    const result = JSON.parse(
      formatSchemaDetailJson({
        id: 'vercel.edge_requests',
        description: 'Request metrics',
        dimensions: [{ name: 'route', label: 'Route' }],
        metrics: [
          {
            id: 'vercel.edge_requests.count',
            description: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ],
      })
    );
    expect(result.metrics[0].id).toBe('vercel.edge_requests.count');
  });

  it('formats query output with metric metadata', () => {
    const result = JSON.parse(
      formatQueryJson(
        {
          metric: 'vercel.edge_requests.count',
          aggregation: 'sum',
          groupBy: ['route'],
          filter: undefined,
          startTime: '2026-01-01T00:00:00.000Z',
          endTime: '2026-01-01T01:00:00.000Z',
          granularity: { minutes: 5 },
        },
        {
          summary: [],
          data: [],
          statistics: {},
        }
      )
    );
    expect(result.query.metric).toBe('vercel.edge_requests.count');
  });
});
