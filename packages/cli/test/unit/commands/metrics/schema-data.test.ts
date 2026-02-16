import { describe, expect, it } from 'vitest';
import {
  getEventNames,
  getEvent,
  getDimensions,
  getMeasures,
  getAggregations,
  getDefaultAggregation,
} from '../../../../src/commands/metrics/schema-data';

describe('schema-data', () => {
  it('should have all 24 events', () => {
    expect(getEventNames()).toHaveLength(24);
  });

  it('should return event names in alphabetical order', () => {
    const names = getEventNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('should return correct event for known event', () => {
    const event = getEvent('incomingRequest');
    expect(event).toBeDefined();
    expect(event!.description).toBe(
      'All incoming HTTP requests to your deployments'
    );
  });

  it('should return undefined for unknown event', () => {
    expect(getEvent('bogus')).toBeUndefined();
  });

  it('should return dimensions with correct shape', () => {
    const dims = getDimensions('incomingRequest');
    expect(dims.length).toBeGreaterThan(0);
    for (const dim of dims) {
      expect(dim).toHaveProperty('name');
      expect(dim).toHaveProperty('label');
      expect(typeof dim.filterOnly).toBe('boolean');
    }
  });

  it('should return measures with correct shape', () => {
    const measures = getMeasures('functionExecution');
    expect(measures.length).toBeGreaterThan(0);
    for (const m of measures) {
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('unit');
    }
  });

  it('should return count aggregations for count measure', () => {
    const aggs = getAggregations('incomingRequest', 'count');
    expect(aggs).toContain('sum');
    expect(aggs).toContain('persecond');
    expect(aggs).toContain('percent');
    expect(aggs).not.toContain('p95');
    expect(aggs).not.toContain('avg');
  });

  it('should return value aggregations for non-count measure', () => {
    const aggs = getAggregations('incomingRequest', 'requestDurationMs');
    expect(aggs).toContain('sum');
    expect(aggs).toContain('p95');
    expect(aggs).toContain('avg');
    expect(aggs).toContain('min');
    expect(aggs).toContain('max');
    expect(aggs).toContain('unique');
  });

  it('should return empty aggregations for unknown event', () => {
    expect(getAggregations('bogus', 'count')).toEqual([]);
  });

  it('should return empty aggregations for unknown measure', () => {
    expect(getAggregations('incomingRequest', 'bogus')).toEqual([]);
  });

  it('should mark filter-only dimensions correctly', () => {
    const dims = getDimensions('functionExecution');
    const provider = dims.find(d => d.name === 'provider');
    expect(provider).toBeDefined();
    expect(provider!.filterOnly).toBe(true);

    const route = dims.find(d => d.name === 'route');
    expect(route).toBeDefined();
    expect(route!.filterOnly).toBe(false);
  });

  it('should exclude cannot-be-used-in-rollups measures', () => {
    // functionExecution has billedDurationMs which cannot be used in rollups
    const measures = getMeasures('functionExecution');
    const measureNames = measures.map(m => m.name);
    expect(measureNames).not.toContain('billedDurationMs');
    expect(measureNames).not.toContain('cpuThrottleMs');
    expect(measureNames).toContain('count');
    expect(measureNames).toContain('functionDurationMs');
  });

  it('should have empty measures for events with no rollup-able measures', () => {
    // blobStoreState only has measures that cannot be used in rollups
    expect(getMeasures('blobStoreState')).toEqual([]);
    expect(getMeasures('dataCacheState')).toEqual([]);
  });

  it('should return empty dimensions for unknown event', () => {
    expect(getDimensions('bogus')).toEqual([]);
  });

  it('should return empty measures for unknown event', () => {
    expect(getMeasures('bogus')).toEqual([]);
  });

  describe('getDefaultAggregation', () => {
    it('should return sum for count measure', () => {
      expect(getDefaultAggregation('incomingRequest', 'count')).toBe('sum');
    });

    it('should return avg for milliseconds unit', () => {
      expect(
        getDefaultAggregation('functionExecution', 'requestDurationMs')
      ).toBe('avg');
    });

    it('should return sum for bytes unit', () => {
      expect(getDefaultAggregation('incomingRequest', 'fdtOutBytes')).toBe(
        'sum'
      );
    });

    it('should return avg for megabytes unit', () => {
      expect(getDefaultAggregation('functionExecution', 'peakMemoryMb')).toBe(
        'avg'
      );
    });

    it('should return avg for ratio unit', () => {
      expect(
        getDefaultAggregation('imageTransformation', 'compressionRatio')
      ).toBe('avg');
    });

    it('should return sum for tokens unit', () => {
      expect(getDefaultAggregation('aiGatewayRequest', 'inputTokens')).toBe(
        'sum'
      );
    });

    it('should return avg for seconds unit', () => {
      expect(getDefaultAggregation('prReview', 'reviewTimeSeconds')).toBe(
        'avg'
      );
    });

    it('should return avg for gigabyte hours unit', () => {
      expect(
        getDefaultAggregation('middlewareInvocation', 'functionDurationGbhr')
      ).toBe('avg');
    });

    it('should return avg for percent unit', () => {
      expect(
        getDefaultAggregation('imageTransformation', 'sizeChangePercent')
      ).toBe('avg');
    });

    it('should return sum for US dollars unit', () => {
      expect(getDefaultAggregation('aiGatewayRequest', 'cost')).toBe('sum');
    });

    it('should return sum for unknown event', () => {
      expect(getDefaultAggregation('bogus', 'count')).toBe('sum');
    });

    it('should return sum for unknown measure', () => {
      expect(getDefaultAggregation('incomingRequest', 'bogus')).toBe('sum');
    });
  });
});
