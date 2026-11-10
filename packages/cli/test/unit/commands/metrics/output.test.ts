import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  formatErrorJson,
  formatQueryJson,
  getRollupColumnName,
  handleApiError,
} from '../../../../src/commands/metrics/output';
import type { QueryMetadata } from '../../../../src/commands/metrics/types';

describe('output', () => {
  describe('getRollupColumnName', () => {
    it('should return metric-based column name', () => {
      expect(getRollupColumnName('vercel.request.count', 'sum')).toBe(
        'vercel_request_count_sum'
      );
    });

    it('should return custom column name', () => {
      expect(
        getRollupColumnName('vercel.request.route_cpu_duration_ms', 'p95')
      ).toBe('vercel_request_route_cpu_duration_ms_p95');
    });

    it('should flatten field-qualified aggregations', () => {
      expect(
        getRollupColumnName(
          'vercel.analytics_pageview.count',
          'unique/visitor_id'
        )
      ).toBe('vercel_analytics_pageview_count_unique_visitor_id');
    });
  });

  describe('formatQueryJson', () => {
    it('should format full JSON response', () => {
      const query: QueryMetadata = {
        metric: 'vercel.request.count',
        aggregation: 'sum',
        groupBy: [],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 5 } as const,
      };
      const response = {
        data: [{ timestamp: '2025-01-15T10:00:00Z', value: 42 }],
        summary: [{ value: 42 }],
        statistics: { rowsRead: 100 },
      };

      const result = JSON.parse(formatQueryJson(query, response));

      expect(result).toEqual({
        query,
        data: response.data,
        summary: response.summary,
      });
    });

    it('should handle missing optional fields', () => {
      const query: QueryMetadata = {
        metric: 'vercel.request.count',
        aggregation: 'sum',
        groupBy: [],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };

      const result = JSON.parse(
        formatQueryJson(query, { summary: [], statistics: {} })
      );

      expect(result).toEqual({ query, data: [], summary: [] });
    });

    it('should include returned ordering metadata', () => {
      const query: QueryMetadata = {
        metric: 'vercel.request.count',
        aggregation: 'sum',
        groupBy: [],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };

      const result = JSON.parse(
        formatQueryJson(query, {
          summary: [],
          statistics: {},
          orderBy: 'defaultOrderingRollup',
          orderDirection: 'desc',
        })
      );

      expect(result.orderBy).toBe('count');
      expect(result.orderDirection).toBe('desc');
      expect(result.query.orderBy).toBe('count');
      expect(result.query.orderDirection).toBe('desc');
    });

    it('should include returned count ordering metadata for Speed Insights', () => {
      const query: QueryMetadata = {
        metric: 'vercel.speed_insights.lcp_ms',
        aggregation: 'p75',
        groupBy: ['route'],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };

      const result = JSON.parse(
        formatQueryJson(query, {
          summary: [],
          statistics: {},
          orderBy: 'vercel_speed_insights_lcp_count_sum',
          orderDirection: 'desc',
        })
      );

      expect(result.orderBy).toBe('count');
      expect(result.orderDirection).toBe('desc');
      expect(result.query.orderBy).toBe('count');
      expect(result.query.orderDirection).toBe('desc');
    });

    it('should display default response ordering as count', () => {
      const query: QueryMetadata = {
        metric: 'vercel.speed_insights.lcp_ms',
        aggregation: 'p75',
        groupBy: ['route'],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };

      const result = JSON.parse(
        formatQueryJson(query, {
          summary: [],
          statistics: {},
          orderBy: 'vercel_speed_insights_lcp_ms_p75',
          orderDirection: 'desc',
        })
      );

      expect(result.orderBy).toBe('count');
      expect(result.orderDirection).toBe('desc');
      expect(result.query.orderBy).toBe('count');
      expect(result.query.orderDirection).toBe('desc');
    });

    it('should display implicit default ordering as event count for non-count metrics', () => {
      const query: QueryMetadata = {
        metric: 'vercel.request.route_cpu_duration_ms',
        aggregation: 'p95',
        groupBy: ['route'],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };

      const result = JSON.parse(
        formatQueryJson(query, {
          summary: [],
          statistics: {},
          orderBy: 'defaultOrderingRollup',
          orderDirection: 'desc',
        })
      );

      expect(result.orderBy).toBe('count');
      expect(result.orderDirection).toBe('desc');
      expect(result.query.orderBy).toBe('count');
      expect(result.query.orderDirection).toBe('desc');
    });

    it('should keep explicit requested ordering metadata compact', () => {
      const query: QueryMetadata = {
        metric: 'vercel.request.count',
        aggregation: 'sum',
        groupBy: [],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
        orderBy: 'value',
      };

      const result = JSON.parse(
        formatQueryJson(query, {
          summary: [],
          statistics: {},
          orderBy: 'vercel_request_count_sum',
          orderDirection: 'desc',
        })
      );

      expect(result.orderBy).toBe('value');
      expect(result.orderDirection).toBe('desc');
      expect(result.query.orderBy).toBe('value');
      expect(result.query.orderDirection).toBe('desc');
    });
  });

  describe('formatErrorJson', () => {
    it('should format error with code and message', () => {
      const result = JSON.parse(
        formatErrorJson('UNKNOWN_METRIC', 'Unknown metric')
      );

      expect(result.error.code).toBe('UNKNOWN_METRIC');
      expect(result.error.message).toBe('Unknown metric');
      expect(result.error).not.toHaveProperty('allowedValues');
    });

    it('should include allowedValues when provided', () => {
      const result = JSON.parse(
        formatErrorJson('UNKNOWN_METRIC', 'Unknown metric', [
          'vercel.request.count',
          'vercel.function_invocation.count',
        ])
      );

      expect(result.error.allowedValues).toEqual([
        'vercel.request.count',
        'vercel.function_invocation.count',
      ]);
    });
  });

  describe('handleApiError', () => {
    it('should format API errors as JSON when requested', () => {
      client.reset();

      const exitCode = handleApiError(
        {
          status: 400,
          code: 'UNKNOWN_METRIC',
          serverMessage: 'Unknown metric "vercel.request".',
          allowedValues: ['vercel.request.count'],
        },
        true,
        client
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.code).toBe('UNKNOWN_METRIC');
      expect(result.error.message).toBe('Unknown metric "vercel.request".');
      expect(result.error.allowedValues).toEqual(['vercel.request.count']);
    });

    it('should honor override messages while preserving allowedValues', () => {
      client.reset();

      const exitCode = handleApiError(
        {
          status: 403,
          code: 'FORBIDDEN',
          serverMessage: 'ignored',
          allowedValues: ['value1'],
        },
        true,
        client,
        {
          403: {
            code: 'SCHEMA_UNAUTHORIZED',
            message:
              'The metrics schema API request was not authorized. Log in and try again, or use `vercel switch` to select a team with access.',
          },
        }
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.code).toBe('SCHEMA_UNAUTHORIZED');
      expect(result.error.message).toContain(
        'The metrics schema API request was not authorized.'
      );
      expect(result.error.allowedValues).toEqual(['value1']);
    });

    it('prefers meta.reason over a generic Observability Plus 402 message', () => {
      client.reset();

      const exitCode = handleApiError(
        {
          status: 402,
          serverMessage: 'Observability Plus is required for this query.',
          meta: { reason: 'project_excluded' },
        },
        true,
        client
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.next[0].command).toContain(
        'project observability enable'
      );
      expect(result.error.next[0].command).not.toContain('buy addon');
    });

    it('does not suggest an Observability command from a generic plan reason', () => {
      client.reset();

      const exitCode = handleApiError(
        {
          status: 402,
          serverMessage: 'This feature requires a higher plan.',
          meta: { reason: 'project_excluded' },
        },
        true,
        client
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.next).toBeUndefined();
      expect(result.error.hint).not.toContain('Observability Plus');
    });

    it('converts --project to a positional Priority recovery target', () => {
      client.reset();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--project',
        'my-app',
        '--non-interactive'
      );

      const exitCode = handleApiError(
        {
          status: 402,
          serverMessage: 'A Priority project is required for this query.',
        },
        true,
        client
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.next[0].command).toBe(
        'vercel project priority enable my-app'
      );
      expect(result.error.next[0].command).not.toContain('--project');
      expect(result.error.next[0].command).not.toContain('--non-interactive');
      expect(result.error.next[0].when).toContain('interactive terminal');
      expect(result.error.hint).toBeUndefined();
    });

    it('prints the Priority command once for a person', () => {
      client.reset();
      client.setArgv('metrics', 'vercel.request.count', '--project', 'my-app');

      const exitCode = handleApiError(
        {
          status: 402,
          serverMessage: 'A Priority project is required for this query.',
        },
        false,
        client
      );

      expect(exitCode).toBe(1);
      const output = client.stderr.getFullOutput();
      expect(output).toContain('A Priority project is required');
      expect(output).toContain('vercel project priority enable my-app');
      expect(output).not.toContain('A person must');
      expect(output.match(/project priority enable/g)).toHaveLength(1);
    });

    it('converts --project=value to a positional Observability recovery target', () => {
      client.reset();
      client.setArgv(
        'metrics',
        'vercel.request.count',
        '--project=my-app',
        '--non-interactive'
      );

      const exitCode = handleApiError(
        {
          status: 402,
          serverMessage:
            'Observability Plus is enabled for team acme, but this project is excluded from it. Include the project in Observability Plus to query its data.',
        },
        true,
        client
      );

      expect(exitCode).toBe(1);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect(result.error.next[0].command).toBe(
        'vercel project observability enable my-app'
      );
      expect(result.error.next[0].command).not.toContain('--project');
      expect(result.error.next[0].command).not.toContain('--non-interactive');
    });
  });
});
