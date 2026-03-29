import { beforeEach, describe, expect, it } from 'vitest';
import {
  fetchSchema,
  getEventNames,
  getEvent,
  getDimensions,
  getMeasures,
  getAggregations,
  getDefaultAggregation,
  getQueryEngineEventName,
  getApiMeasureName,
  getApiDimensionName,
  convertFilterToApiNames,
  parseEventMeasure,
  camelToSnakeCase,
  snakeToCamelCase,
  toCliEventName,
  toApiEventName,
  type Schema,
} from '../../../../src/commands/metrics/schema-api';
import { client } from '../../../mocks/client';

const schema: Schema = {
  'vercel.edge_request': {
    description: 'Edge Requests',
    queryEngineEvent: 'incomingRequest',
    dimensions: [
      { name: 'http_status', apiName: 'httpStatus', label: 'HTTP Status' },
      { name: 'route', label: 'Route' },
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
        name: 'request_duration_ms',
        apiName: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'min', 'max', 'p95'],
        defaultAggregation: 'avg',
      },
      {
        name: 'fdt_out_bytes',
        apiName: 'fdtOutBytes',
        label: 'Bandwidth',
        unit: 'bytes',
        aggregations: ['sum', 'avg'],
        defaultAggregation: 'sum',
      },
    ],
  },
  'vercel.function_execution': {
    description: 'Functions',
    queryEngineEvent: 'functionExecution',
    dimensions: [{ name: 'route', label: 'Route' }],
    measures: [
      {
        name: 'count',
        label: 'Count',
        unit: 'count',
        aggregations: ['sum'],
        defaultAggregation: 'sum',
      },
      {
        name: 'request_duration_ms',
        apiName: 'requestDurationMs',
        label: 'Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'p95'],
        defaultAggregation: 'avg',
      },
    ],
  },
};

const filterSchema: Schema = {
  'vercel.edge_request': {
    description: 'Edge Requests',
    dimensions: [
      { name: 'http_status', apiName: 'httpStatus', label: 'HTTP Status' },
      { name: 'route_id', apiName: 'routeId', label: 'Route ID' },
    ],
    measures: [],
  },
};

describe('schema-data', () => {
  it('should return event names in alphabetical order', () => {
    expect(getEventNames(schema)).toEqual([
      'vercel.edge_request',
      'vercel.function_execution',
    ]);
  });

  it('should return correct event for known event', () => {
    expect(getEvent(schema, 'vercel.edge_request')?.description).toBe(
      'Edge Requests'
    );
  });

  it('should return undefined for unknown event', () => {
    expect(getEvent(schema, 'bogus')).toBeUndefined();
  });

  it('should return dimensions with correct shape', () => {
    const dims = getDimensions(schema, 'vercel.edge_request');
    expect(dims).toEqual([
      { name: 'http_status', apiName: 'httpStatus', label: 'HTTP Status' },
      { name: 'route', label: 'Route' },
    ]);
  });

  it('should return measures with aggregations and default aggregation', () => {
    const measures = getMeasures(schema, 'vercel.function_execution');
    expect(measures[0]).toHaveProperty('aggregations');
    expect(measures[0]).toHaveProperty('defaultAggregation');
  });

  it('should return measure aggregations from schema', () => {
    expect(getAggregations(schema, 'vercel.edge_request', 'count')).toEqual([
      'sum',
      'persecond',
      'percent',
    ]);
    expect(
      getAggregations(schema, 'vercel.edge_request', 'request_duration_ms')
    ).toEqual(['avg', 'min', 'max', 'p95']);
  });

  it('should return empty aggregations for unknown event or measure', () => {
    expect(getAggregations(schema, 'bogus', 'count')).toEqual([]);
    expect(getAggregations(schema, 'vercel.edge_request', 'bogus')).toEqual([]);
  });

  it('should return default aggregation from schema', () => {
    expect(getDefaultAggregation(schema, 'vercel.edge_request', 'count')).toBe(
      'sum'
    );
    expect(
      getDefaultAggregation(
        schema,
        'vercel.edge_request',
        'request_duration_ms'
      )
    ).toBe('avg');
  });

  it('should fall back to sum for unknown event or measure', () => {
    expect(getDefaultAggregation(schema, 'bogus', 'count')).toBe('sum');
    expect(getDefaultAggregation(schema, 'vercel.edge_request', 'bogus')).toBe(
      'sum'
    );
  });

  it('should map aliased events and pass through non-aliased events', () => {
    expect(getQueryEngineEventName(schema, 'vercel.edge_request')).toBe(
      'incomingRequest'
    );
    expect(getQueryEngineEventName(schema, 'vercel.function_execution')).toBe(
      'functionExecution'
    );
  });

  it('should resolve API measure names', () => {
    expect(
      getApiMeasureName(schema, 'vercel.edge_request', 'request_duration_ms')
    ).toBe('requestDurationMs');
    expect(getApiMeasureName(schema, 'vercel.edge_request', 'count')).toBe(
      'count'
    );
  });

  it('should resolve API dimension names', () => {
    expect(
      getApiDimensionName(schema, 'vercel.edge_request', 'http_status')
    ).toBe('httpStatus');
    expect(getApiDimensionName(schema, 'vercel.edge_request', 'route')).toBe(
      'route'
    );
  });

  it('should convert filter dimension names to API names', () => {
    expect(
      convertFilterToApiNames(
        schema,
        'vercel.edge_request',
        'http_status ge 500'
      )
    ).toBe('httpStatus ge 500');
  });

  it('should not rewrite dimension names inside quoted strings', () => {
    expect(
      convertFilterToApiNames(
        filterSchema,
        'vercel.edge_request',
        "contains(route, '/http_status') and http_status ge 500"
      )
    ).toBe("contains(route, '/http_status') and httpStatus ge 500");
  });

  it('should not rewrite partial identifier matches', () => {
    expect(
      convertFilterToApiNames(
        filterSchema,
        'vercel.edge_request',
        "route_id eq 'x' and route_identifier eq 'y'"
      )
    ).toBe("routeId eq 'x' and route_identifier eq 'y'");
  });

  it('should leave malformed quoted filters unchanged', () => {
    const filter = "http_status eq '500";
    expect(
      convertFilterToApiNames(filterSchema, 'vercel.edge_request', filter)
    ).toBe(filter);
  });
});

describe('parseEventMeasure', () => {
  it('should return event only when no measure is embedded', () => {
    expect(parseEventMeasure('vercel.edge_request')).toEqual({
      event: 'vercel.edge_request',
    });
  });

  it('should extract embedded measure from third segment', () => {
    expect(parseEventMeasure('vercel.edge_request.count')).toEqual({
      event: 'vercel.edge_request',
      measure: 'count',
    });
  });

  it('should handle multi-word measure names', () => {
    expect(
      parseEventMeasure('vercel.edge_request.request_duration_ms')
    ).toEqual({
      event: 'vercel.edge_request',
      measure: 'request_duration_ms',
    });
  });

  it('should pass through non-prefixed input unchanged', () => {
    expect(parseEventMeasure('bogus')).toEqual({ event: 'bogus' });
  });
});

describe('camelToSnakeCase', () => {
  it('should convert simple camelCase', () => {
    expect(camelToSnakeCase('functionExecution')).toBe('function_execution');
  });

  it('should handle leading lowercase acronym', () => {
    expect(camelToSnakeCase('aiGatewayRequest')).toBe('ai_gateway_request');
  });

  it('should handle multi-word names', () => {
    expect(camelToSnakeCase('speedInsightsMetric')).toBe(
      'speed_insights_metric'
    );
  });

  it('should pass through already-lowercase names', () => {
    expect(camelToSnakeCase('count')).toBe('count');
    expect(camelToSnakeCase('route')).toBe('route');
  });

  it('should handle names with numbers', () => {
    expect(camelToSnakeCase('requestDurationMs')).toBe('request_duration_ms');
    expect(camelToSnakeCase('fdtOutBytes')).toBe('fdt_out_bytes');
  });
});

describe('snakeToCamelCase', () => {
  it('should convert snake_case to camelCase', () => {
    expect(snakeToCamelCase('function_execution')).toBe('functionExecution');
    expect(snakeToCamelCase('ai_gateway_request')).toBe('aiGatewayRequest');
    expect(snakeToCamelCase('edge_request')).toBe('edgeRequest');
  });

  it('should pass through single-word names', () => {
    expect(snakeToCamelCase('count')).toBe('count');
    expect(snakeToCamelCase('route')).toBe('route');
  });
});

describe('toCliEventName / toApiEventName', () => {
  it('should convert API event names to CLI format', () => {
    expect(toCliEventName('incomingRequest')).toBe('vercel.edge_request');
    expect(toCliEventName('functionExecution')).toBe(
      'vercel.function_execution'
    );
    expect(toCliEventName('aiGatewayRequest')).toBe(
      'vercel.ai_gateway_request'
    );
    expect(toCliEventName('speedInsightsMetric')).toBe(
      'vercel.speed_insights_metric'
    );
  });

  it('should convert CLI event names to API format', () => {
    expect(toApiEventName('vercel.edge_request')).toBe('incomingRequest');
    expect(toApiEventName('vercel.function_execution')).toBe(
      'functionExecution'
    );
    expect(toApiEventName('vercel.ai_gateway_request')).toBe(
      'aiGatewayRequest'
    );
  });
});

describe('fetchSchema', () => {
  beforeEach(() => {
    client.reset();
  });

  it('should preserve the canonical API event name for queries', async () => {
    client.scenario.get('/v1/observability/schema', (_req, res) => {
      res.json({
        events: [{ name: 'CPUUsage', description: 'CPU Usage' }],
      });
    });

    client.scenario.get('/v1/observability/schema/CPUUsage', (_req, res) => {
      res.json({
        name: 'CPUUsage',
        description: 'CPU Usage',
        dimensions: [],
        measures: [
          {
            name: 'count',
            label: 'Count',
            unit: 'count',
            aggregations: ['sum'],
            defaultAggregation: 'sum',
          },
        ],
      });
    });

    const fetched = await fetchSchema(client, 'team_dummy');

    expect(fetched).toHaveProperty('vercel.cpu_usage');
    expect(fetched['vercel.cpu_usage']?.queryEngineEvent).toBe('CPUUsage');
  });
});
