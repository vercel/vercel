import { describe, expect, it } from 'vitest';
import {
  formatMetadataHeader,
  formatText,
} from '../../../../src/commands/metrics/text-output';

describe('metrics text output v2', () => {
  it('formats metric metadata header', () => {
    const output = formatMetadataHeader({
      metric: 'vercel.edge_requests.count',
      aggregation: 'sum',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-01-01T01:00:00.000Z',
      granularity: { minutes: 5 },
      scope: { type: 'owner', ownerId: 'team_123' },
    });

    expect(output).toContain('vercel.edge_requests.count sum');
  });

  it('formats empty query responses', () => {
    const output = formatText(
      {
        data: [],
        summary: [],
        statistics: {},
      },
      {
        metric: 'vercel.edge_requests.count',
        metricUnit: 'count',
        aggregation: 'sum',
        groupBy: [],
        scope: { type: 'owner', ownerId: 'team_123' },
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-01-01T01:00:00.000Z',
        granularity: { minutes: 5 },
      }
    );

    expect(output).toContain('No data found for this period.');
  });
});
