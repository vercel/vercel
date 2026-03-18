import { describe, expect, it } from 'vitest';
import {
  getEventNames,
  getEvent,
  getDimensions,
  getMeasures,
  getAggregations,
  getDefaultAggregation,
  getQueryEngineEventName,
  type Schema,
} from '../../../../src/commands/metrics/schema-data';

const schema: Schema = {
  edgeRequest: {
    description: 'Edge Requests',
    queryEngineEvent: 'incomingRequest',
    dimensions: [
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: true },
    ],
    measures: [
      {
        name: 'count',
        label: 'Count',
        unit: 'count',
        aggregations: ['sum', 'persecond', 'percent'],
        defaultAggregation: 'sum',
      },
      {
        name: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'min', 'max', 'p95'],
        defaultAggregation: 'avg',
      },
      {
        name: 'fdtOutBytes',
        label: 'Bandwidth',
        unit: 'bytes',
        aggregations: ['sum', 'avg'],
        defaultAggregation: 'sum',
      },
    ],
  },
  functionExecution: {
    description: 'Functions',
    dimensions: [
      { name: 'provider', label: 'Provider', filterOnly: true },
      { name: 'route', label: 'Route', filterOnly: false },
    ],
    measures: [
      {
        name: 'count',
        label: 'Count',
        unit: 'count',
        aggregations: ['sum'],
        defaultAggregation: 'sum',
      },
      {
        name: 'requestDurationMs',
        label: 'Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'p95'],
        defaultAggregation: 'avg',
      },
    ],
  },
};

describe('schema-data', () => {
  it('should return event names in alphabetical order', () => {
    expect(getEventNames(schema)).toEqual(['edgeRequest', 'functionExecution']);
  });

  it('should return correct event for known event', () => {
    expect(getEvent(schema, 'edgeRequest')?.description).toBe('Edge Requests');
  });

  it('should return undefined for unknown event', () => {
    expect(getEvent(schema, 'bogus')).toBeUndefined();
  });

  it('should return dimensions with correct shape', () => {
    const dims = getDimensions(schema, 'edgeRequest');
    expect(dims).toEqual([
      { name: 'httpStatus', label: 'HTTP Status', filterOnly: false },
      { name: 'route', label: 'Route', filterOnly: false },
      { name: 'projectName', label: 'Project', filterOnly: true },
    ]);
  });

  it('should return measures with aggregations and default aggregation', () => {
    const measures = getMeasures(schema, 'functionExecution');
    expect(measures[0]).toHaveProperty('aggregations');
    expect(measures[0]).toHaveProperty('defaultAggregation');
  });

  it('should return measure aggregations from schema', () => {
    expect(getAggregations(schema, 'edgeRequest', 'count')).toEqual([
      'sum',
      'persecond',
      'percent',
    ]);
    expect(getAggregations(schema, 'edgeRequest', 'requestDurationMs')).toEqual(
      ['avg', 'min', 'max', 'p95']
    );
  });

  it('should return empty aggregations for unknown event or measure', () => {
    expect(getAggregations(schema, 'bogus', 'count')).toEqual([]);
    expect(getAggregations(schema, 'edgeRequest', 'bogus')).toEqual([]);
  });

  it('should return default aggregation from schema', () => {
    expect(getDefaultAggregation(schema, 'edgeRequest', 'count')).toBe('sum');
    expect(
      getDefaultAggregation(schema, 'edgeRequest', 'requestDurationMs')
    ).toBe('avg');
  });

  it('should fall back to sum for unknown event or measure', () => {
    expect(getDefaultAggregation(schema, 'bogus', 'count')).toBe('sum');
    expect(getDefaultAggregation(schema, 'edgeRequest', 'bogus')).toBe('sum');
  });

  it('should map CLI aliases back to query-engine names', () => {
    expect(getQueryEngineEventName(schema, 'edgeRequest')).toBe(
      'incomingRequest'
    );
    expect(getQueryEngineEventName(schema, 'functionExecution')).toBe(
      'functionExecution'
    );
  });
});
