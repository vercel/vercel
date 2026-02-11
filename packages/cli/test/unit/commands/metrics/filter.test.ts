import { describe, expect, it } from 'vitest';
import {
  buildStatusFilter,
  buildFilter,
} from '../../../../src/commands/metrics/filter';
import type { MetricsOptions } from '../../../../src/commands/metrics/types';

describe('buildStatusFilter', () => {
  it('should handle 5xx range', () => {
    expect(buildStatusFilter('5xx')).toBe('httpStatus ge 500');
  });

  it('should handle 4xx range', () => {
    expect(buildStatusFilter('4xx')).toBe(
      'httpStatus ge 400 and httpStatus lt 500'
    );
  });

  it('should handle 3xx range', () => {
    expect(buildStatusFilter('3xx')).toBe(
      'httpStatus ge 300 and httpStatus lt 400'
    );
  });

  it('should handle 2xx range', () => {
    expect(buildStatusFilter('2xx')).toBe(
      'httpStatus ge 200 and httpStatus lt 300'
    );
  });

  it('should handle exact status code', () => {
    expect(buildStatusFilter('500')).toBe('httpStatus eq 500');
    expect(buildStatusFilter('404')).toBe('httpStatus eq 404');
  });

  it('should handle comma-separated status codes', () => {
    expect(buildStatusFilter('500,502,503')).toBe(
      '(httpStatus eq 500 or httpStatus eq 502 or httpStatus eq 503)'
    );
  });

  it('should handle mixed ranges and codes', () => {
    expect(buildStatusFilter('5xx,4xx')).toBe(
      '(httpStatus ge 500 or httpStatus ge 400 and httpStatus lt 500)'
    );
  });
});

describe('buildFilter', () => {
  const baseOptions: MetricsOptions = {
    event: 'incomingRequest',
    measure: 'count',
    aggregation: 'sum',
    by: [],
    limit: 100,
    json: false,
    summary: false,
  };

  it('should return undefined when no filters are specified', () => {
    expect(buildFilter(baseOptions)).toBeUndefined();
  });

  it('should build status filter', () => {
    expect(buildFilter({ ...baseOptions, status: '5xx' })).toBe(
      'httpStatus ge 500'
    );
  });

  it('should build error filter', () => {
    expect(
      buildFilter({ ...baseOptions, error: 'FUNCTION_INVOCATION_TIMEOUT' })
    ).toBe("errorCode eq 'FUNCTION_INVOCATION_TIMEOUT'");
  });

  it('should build path filter', () => {
    expect(buildFilter({ ...baseOptions, path: '/api' })).toBe(
      "contains(requestPath, '/api')"
    );
  });

  it('should build method filter', () => {
    expect(buildFilter({ ...baseOptions, method: 'post' })).toBe(
      "requestMethod eq 'POST'"
    );
  });

  it('should build region filter', () => {
    expect(buildFilter({ ...baseOptions, region: 'iad1' })).toBe(
      "(edgeNetworkRegion eq 'iad1' or functionRegion eq 'iad1')"
    );
  });

  it('should build environment filter', () => {
    expect(buildFilter({ ...baseOptions, environment: 'production' })).toBe(
      "environment eq 'production'"
    );
  });

  it('should combine multiple filters with AND', () => {
    expect(
      buildFilter({
        ...baseOptions,
        status: '5xx',
        path: '/api',
        method: 'POST',
      })
    ).toBe(
      "httpStatus ge 500 and contains(requestPath, '/api') and requestMethod eq 'POST'"
    );
  });

  it('should append raw filter at the end', () => {
    expect(
      buildFilter({
        ...baseOptions,
        status: '5xx',
        filter: 'httpStatus in (500, 502, 503)',
      })
    ).toBe('httpStatus ge 500 and httpStatus in (500, 502, 503)');
  });

  it('should escape single quotes in string values', () => {
    expect(buildFilter({ ...baseOptions, path: "/api/o'reilly" })).toBe(
      "contains(requestPath, '/api/o''reilly')"
    );
  });
});
