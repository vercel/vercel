import { describe, expect, it } from 'vitest';
import {
  getRollupColumnName,
  formatQueryJson,
  formatSchemaDetailJson,
  formatSchemaListJson,
  formatErrorJson,
} from '../../../../src/commands/metrics/output';
import type { QueryMetadata } from '../../../../src/commands/metrics/types';

describe('output', () => {
  describe('getRollupColumnName', () => {
    it('should return default column name', () => {
      expect(getRollupColumnName('count', 'sum')).toBe('count_sum');
    });

    it('should return custom column name', () => {
      expect(getRollupColumnName('requestDurationMs', 'p95')).toBe(
        'requestDurationMs_p95'
      );
    });
  });

  describe('formatQueryJson', () => {
    it('should format full JSON response', () => {
      const query: QueryMetadata = {
        event: 'incomingRequest',
        measure: 'count',
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
        event: 'test',
        measure: 'count',
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
    });
  });

  describe('formatSchemaDetailJson', () => {
    it('should format event detail as JSON', () => {
      const event = {
        name: 'functionExecution',
        description: 'Serverless function execution details',
        dimensions: [
          { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
          { name: 'provider', label: 'Provider', filterOnly: true },
        ],
        measures: [{ name: 'count', label: 'Count', unit: 'count' }],
      };
      const aggregations = ['sum', 'persecond', 'percent'];
      const result = JSON.parse(formatSchemaDetailJson(event, aggregations));
      expect(result.event).toBe('functionExecution');
      expect(result.description).toBe('Serverless function execution details');
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[1].filterOnly).toBe(true);
      expect(result.dimensions[0]).not.toHaveProperty('filterOnly');
      expect(result.measures).toHaveLength(1);
      expect(result.aggregations).toEqual(aggregations);
    });
  });

  describe('formatSchemaListJson', () => {
    it('should format event list as JSON', () => {
      const events = [
        { name: 'event1', description: 'Desc 1' },
        { name: 'event2', description: 'Desc 2' },
      ];
      const result = JSON.parse(formatSchemaListJson(events));
      expect(result).toEqual(events);
    });
  });

  describe('formatErrorJson', () => {
    it('should format error with code and message', () => {
      const result = JSON.parse(
        formatErrorJson('UNKNOWN_EVENT', 'Unknown event')
      );
      expect(result.error.code).toBe('UNKNOWN_EVENT');
      expect(result.error.message).toBe('Unknown event');
      expect(result.error).not.toHaveProperty('allowedValues');
    });

    it('should include allowedValues when provided', () => {
      const result = JSON.parse(
        formatErrorJson('UNKNOWN_EVENT', 'Unknown event', ['event1', 'event2'])
      );
      expect(result.error.allowedValues).toEqual(['event1', 'event2']);
    });
  });
});
