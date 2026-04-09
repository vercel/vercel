import { describe, expect, it } from 'vitest';
import { formatQueryJson } from '../../../../src/commands/metrics/output';

describe('metrics output', () => {
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
