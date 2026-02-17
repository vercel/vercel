import { describe, expect, it } from 'vitest';
import {
  escapeCsvValue,
  getRollupColumnName,
  formatCsv,
  formatQueryJson,
  formatSchemaListCsv,
  formatSchemaDetailCsv,
  formatSchemaDetailJson,
  formatSchemaListJson,
  formatErrorJson,
} from '../../../../src/commands/metrics/output';

describe('output', () => {
  describe('escapeCsvValue', () => {
    it('should return plain value as-is', () => {
      expect(escapeCsvValue('hello')).toBe('hello');
    });

    it('should wrap value with comma in quotes', () => {
      expect(escapeCsvValue('hello,world')).toBe('"hello,world"');
    });

    it('should escape double quotes', () => {
      expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap value with newline in quotes', () => {
      expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should return empty string for null', () => {
      expect(escapeCsvValue(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(escapeCsvValue(undefined)).toBe('');
    });

    it('should convert numbers to string', () => {
      expect(escapeCsvValue(42)).toBe('42');
    });
  });

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

  describe('formatCsv', () => {
    it('should format ungrouped data', () => {
      const data = [
        { timestamp: '2025-01-15T10:00:00Z', count_sum: 89 },
        { timestamp: '2025-01-15T10:05:00Z', count_sum: 102 },
      ];
      const result = formatCsv(data, [], 'count_sum');
      expect(result).toBe(
        'timestamp,count_sum\n' +
          '2025-01-15T10:00:00Z,89\n' +
          '2025-01-15T10:05:00Z,102\n'
      );
    });

    it('should format grouped data', () => {
      const data = [
        {
          timestamp: '2025-01-15T10:00:00Z',
          httpStatus: '200',
          count_sum: 4520,
        },
        {
          timestamp: '2025-01-15T10:00:00Z',
          httpStatus: '500',
          count_sum: 89,
        },
      ];
      const result = formatCsv(data, ['httpStatus'], 'count_sum');
      expect(result).toBe(
        'timestamp,httpStatus,count_sum\n' +
          '2025-01-15T10:00:00Z,200,4520\n' +
          '2025-01-15T10:00:00Z,500,89\n'
      );
    });

    it('should format empty data with header only', () => {
      const result = formatCsv([], [], 'count_sum');
      expect(result).toBe('timestamp,count_sum\n');
    });

    it('should handle null values', () => {
      const data = [{ timestamp: '2025-01-15T10:00:00Z', count_sum: null }];
      const result = formatCsv(data, [], 'count_sum');
      expect(result).toBe('timestamp,count_sum\n2025-01-15T10:00:00Z,\n');
    });

    it('should include multiple group-by columns in order', () => {
      const data = [
        {
          timestamp: '2025-01-15T10:00:00Z',
          httpStatus: '200',
          route: '/api/users',
          count_sum: 100,
        },
      ];
      const result = formatCsv(data, ['httpStatus', 'route'], 'count_sum');
      expect(result).toContain('timestamp,httpStatus,route,count_sum\n');
    });
  });

  describe('formatQueryJson', () => {
    it('should format full JSON response', () => {
      const query = {
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
      const query = {
        event: 'test',
        measure: 'count',
        aggregation: 'sum',
        groupBy: [],
        filter: undefined,
        startTime: '2025-01-15T10:00:00Z',
        endTime: '2025-01-15T11:00:00Z',
        granularity: { minutes: 1 } as const,
      };
      const result = JSON.parse(formatQueryJson(query, { statistics: {} }));
      expect(result.data).toEqual([]);
      expect(result.summary).toEqual([]);
    });
  });

  describe('formatSchemaListCsv', () => {
    it('should format event list', () => {
      const events = [
        { name: 'incomingRequest', description: 'HTTP requests' },
        {
          name: 'functionExecution',
          description: 'Function executions',
        },
      ];
      const result = formatSchemaListCsv(events);
      expect(result).toBe(
        'event,description\n' +
          'incomingRequest,HTTP requests\n' +
          'functionExecution,Function executions\n'
      );
    });
  });

  describe('formatSchemaDetailCsv', () => {
    it('should output two blocks separated by blank line', () => {
      const event = {
        name: 'test',
        description: 'Test event',
        dimensions: [
          { name: 'dim1', label: 'Dimension 1', filterOnly: false },
          { name: 'dim2', label: 'Dimension 2', filterOnly: true },
        ],
        measures: [
          { name: 'count', label: 'Count', unit: 'count' },
          { name: 'durationMs', label: 'Duration', unit: 'milliseconds' },
        ],
      };
      const result = formatSchemaDetailCsv(event);
      const blocks = result.split('\n\n');
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain('dimension,label,filterOnly');
      expect(blocks[0]).toContain('dim1,Dimension 1,false');
      expect(blocks[0]).toContain('dim2,Dimension 2,true');
      expect(blocks[1]).toContain('measure,label,unit');
      expect(blocks[1]).toContain('count,Count,count');
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
