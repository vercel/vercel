import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  getRollupColumnName,
  formatQueryJson,
  formatErrorJson,
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

      expect(result.query).toEqual(query);
      expect(result.data).toEqual(response.data);
      expect(result.summary).toEqual(response.summary);
      expect(result.statistics).toEqual(response.statistics);
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

      expect(result.data).toEqual([]);
      expect(result.summary).toEqual([]);
      expect(result.statistics).toEqual({});
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
  });
});
