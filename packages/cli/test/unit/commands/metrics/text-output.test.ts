import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import {
  getMeasureType,
  getEffectiveDisplay,
  formatCount,
  formatDecimal,
  formatMinMaxTimestamp,
  extractGroupedSeries,
  computeGroupStats,
  downsample,
  generateSparkline,
  formatMetadataHeader,
  formatSparklineSection,
  formatText,
  ellipsizeMiddle,
} from '../../../../src/commands/metrics/text-output';
import type {
  MetricsQueryResponse,
  Scope,
} from '../../../../src/commands/metrics/types';

const projectScope: Scope = {
  type: 'project',
  ownerId: 'team_dummy',
  projectIds: ['prj_metricstest'],
};

describe('text-output', () => {
  describe('number formatting', () => {
    it('should classify measure types from schema units and fallback units', () => {
      expect(getMeasureType('count')).toBe('count');
      expect(getMeasureType('unknown_unit')).toBe('ratio');
      expect(getMeasureType('US dollars')).toBe('count');
      expect(getMeasureType('milliseconds')).toBe('duration');
      expect(getMeasureType('bytes')).toBe('bytes');
      expect(getMeasureType('gigabyte hours')).toBe('bytes');
      expect(getMeasureType('ratio')).toBe('ratio');
      expect(getMeasureType('percent')).toBe('ratio');
    });

    it('should format count values with grouping', () => {
      expect(formatCount(0)).toBe('0');
      expect(formatCount(42)).toBe('42');
      expect(formatCount(17880)).toBe('17,880');
      expect(formatCount(724402795)).toBe('724,402,795');
    });

    it('should format decimal values with adaptive precision', () => {
      expect(formatDecimal(0)).toBe('0');
      expect(formatDecimal(42)).toBe('42.0');
      expect(formatDecimal(4213.7)).toBe('4213.7');
      expect(formatDecimal(1)).toBe('1.0');
      expect(formatDecimal(0.87)).toBe('0.87');
      expect(formatDecimal(0.042)).toBe('0.042');
      expect(formatDecimal(0.003)).toBe('0.003');
    });
  });

  describe('getEffectiveDisplay', () => {
    it('should return percent display for percent aggregation', () => {
      expect(getEffectiveDisplay('bytes', 'percent')).toEqual({
        displayUnit: '%',
        measureType: 'ratio',
      });
      expect(getEffectiveDisplay('count', 'percent')).toEqual({
        displayUnit: '%',
        measureType: 'ratio',
      });
      expect(getEffectiveDisplay('milliseconds', 'percent')).toEqual({
        displayUnit: '%',
        measureType: 'ratio',
      });
    });

    it('should return rate display for persecond aggregation', () => {
      expect(getEffectiveDisplay('bytes', 'persecond')).toEqual({
        displayUnit: 'bytes/s',
        measureType: 'bytes',
      });
      expect(getEffectiveDisplay('count', 'persecond')).toEqual({
        displayUnit: 'count/s',
        measureType: 'count',
      });
      expect(getEffectiveDisplay('milliseconds', 'persecond')).toEqual({
        displayUnit: 'ms/s',
        measureType: 'duration',
      });
    });

    it('should return count display with hidden unit for unique aggregation', () => {
      expect(getEffectiveDisplay('count', 'unique')).toEqual({
        displayUnit: undefined,
        measureType: 'count',
      });
      expect(getEffectiveDisplay('bytes', 'unique')).toEqual({
        displayUnit: undefined,
        measureType: 'count',
      });
    });

    it('should pass through base unit for standard aggregations', () => {
      expect(getEffectiveDisplay('bytes', 'sum')).toEqual({
        displayUnit: 'bytes',
        measureType: 'bytes',
      });
      expect(getEffectiveDisplay('milliseconds', 'avg')).toEqual({
        displayUnit: 'milliseconds',
        measureType: 'duration',
      });
      expect(getEffectiveDisplay('count', 'sum')).toEqual({
        displayUnit: 'count',
        measureType: 'count',
      });
      expect(getEffectiveDisplay(undefined, 'avg')).toEqual({
        displayUnit: undefined,
        measureType: 'ratio',
      });
    });
  });

  describe('ellipsizeMiddle', () => {
    it('should return the string unchanged when within max length', () => {
      expect(ellipsizeMiddle('short', 60)).toBe('short');
      expect(ellipsizeMiddle('/api/status', 60)).toBe('/api/status');
    });

    it('should return the string unchanged when exactly at max length', () => {
      const str = 'a'.repeat(60);
      expect(ellipsizeMiddle(str, 60)).toBe(str);
    });

    it('should ellipsize long strings with equal start/end portions', () => {
      const result = ellipsizeMiddle('a'.repeat(100), 60);
      expect(result).toHaveLength(60);
      expect(result).toContain('…');
      // With maxLength=60: endLength=29, startLength=30
      expect(result).toBe('a'.repeat(30) + '…' + 'a'.repeat(29));
    });

    it('should handle odd max length correctly', () => {
      const result = ellipsizeMiddle('abcdefghij', 5);
      // endLength=2, startLength=2
      expect(result).toBe('ab…ij');
      expect(result).toHaveLength(5);
    });

    it('should handle even max length correctly', () => {
      const result = ellipsizeMiddle('abcdefghij', 6);
      // endLength=2, startLength=3
      expect(result).toBe('abc…ij');
      expect(result).toHaveLength(6);
    });
  });

  describe('timestamp formatting', () => {
    it('should format same-day period timestamps as HH:MM', () => {
      const start = new Date('2026-02-17T15:00:00Z');
      const end = new Date('2026-02-17T16:00:00Z');
      const ts = new Date('2026-02-17T15:12:00Z');
      expect(formatMinMaxTimestamp(ts, start, end)).toBe('15:12');
    });

    it('should format multi-day same-year timestamps as MM-DD HH:MM', () => {
      const start = new Date('2026-02-18T14:00:00Z');
      const end = new Date('2026-02-19T15:00:00Z');
      const ts = new Date('2026-02-19T14:00:00Z');
      expect(formatMinMaxTimestamp(ts, start, end)).toBe('02-19 14:00');
    });

    it('should format cross-year timestamps as YYYY-MM-DD HH:MM', () => {
      const start = new Date('2025-12-28T00:00:00Z');
      const end = new Date('2026-01-02T00:00:00Z');
      const ts = new Date('2025-12-28T14:00:00Z');
      expect(formatMinMaxTimestamp(ts, start, end)).toBe('2025-12-28 14:00');
    });
  });

  describe('series extraction and stats', () => {
    it('should extract grouped series and fill missing points with null', () => {
      const result = extractGroupedSeries(
        [
          {
            timestamp: '2026-02-19T10:00:00.000Z',
            httpStatus: '200',
            count_sum: 10,
          },
          {
            timestamp: '2026-02-19T10:10:00.000Z',
            httpStatus: '200',
            count_sum: 30,
          },
        ],
        ['httpStatus'],
        'count_sum',
        '2026-02-19T10:00:00.000Z',
        '2026-02-19T10:15:00.000Z',
        5 * 60 * 1000
      );

      expect(result.groups).toEqual(['200']);
      expect(result.series.get('200')).toEqual([
        { timestamp: '2026-02-19T10:00:00.000Z', value: 10 },
        { timestamp: '2026-02-19T10:05:00.000Z', value: null },
        { timestamp: '2026-02-19T10:10:00.000Z', value: 30 },
      ]);
    });

    it('should use [start,end) semantics for expected timestamps', () => {
      const result = extractGroupedSeries(
        [
          { timestamp: '2026-02-19T10:00:00.000Z', count_sum: 10 },
          { timestamp: '2026-02-19T10:05:00.000Z', count_sum: 20 },
          { timestamp: '2026-02-19T10:10:00.000Z', count_sum: 30 },
          { timestamp: '2026-02-19T10:15:00.000Z', count_sum: 40 },
        ],
        [],
        'count_sum',
        '2026-02-19T10:00:00.000Z',
        '2026-02-19T10:15:00.000Z',
        5 * 60 * 1000
      );

      expect(result.groups).toEqual(['']);
      expect(result.series.get('')!.map(point => point.timestamp)).toEqual([
        '2026-02-19T10:00:00.000Z',
        '2026-02-19T10:05:00.000Z',
        '2026-02-19T10:10:00.000Z',
      ]);
      expect(result.series.get('')!.map(point => point.value)).toEqual([
        10, 20, 30,
      ]);
    });

    it('should match API timestamps without milliseconds to expected buckets', () => {
      const result = extractGroupedSeries(
        [
          { timestamp: '2026-02-19T10:00:00Z', count_sum: 10 },
          { timestamp: '2026-02-19T10:05:00Z', count_sum: 20 },
          { timestamp: '2026-02-19T10:10:00Z', count_sum: 30 },
        ],
        [],
        'count_sum',
        '2026-02-19T10:00:00.000Z',
        '2026-02-19T10:15:00.000Z',
        5 * 60 * 1000
      );

      expect(result.groups).toEqual(['']);
      expect(result.series.get('')!.map(point => point.timestamp)).toEqual([
        '2026-02-19T10:00:00.000Z',
        '2026-02-19T10:05:00.000Z',
        '2026-02-19T10:10:00.000Z',
      ]);
      expect(result.series.get('')!.map(point => point.value)).toEqual([
        10, 20, 30,
      ]);
    });

    it('should compute stats excluding null values', () => {
      const stats = computeGroupStats([
        { timestamp: '2026-02-19T10:00:00.000Z', value: 10 },
        { timestamp: '2026-02-19T10:05:00.000Z', value: null },
        { timestamp: '2026-02-19T10:10:00.000Z', value: 30 },
      ]);

      expect(stats.total).toBe(40);
      expect(stats.avg).toBe(20);
      expect(stats.count).toBe(2);
      expect(stats.min).toEqual({
        value: 10,
        timestamp: '2026-02-19T10:00:00.000Z',
      });
      expect(stats.max).toEqual({
        value: 30,
        timestamp: '2026-02-19T10:10:00.000Z',
      });
    });

    it('should mark all-missing groups', () => {
      const stats = computeGroupStats([
        { timestamp: '2026-02-19T10:00:00.000Z', value: null },
        { timestamp: '2026-02-19T10:05:00.000Z', value: null },
      ]);

      expect(stats.allMissing).toBe(true);
      expect(stats.count).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('sparkline generation', () => {
    it('should render known sparkline patterns', () => {
      expect(generateSparkline([1, 2, 3, 4, 5, 6, 7, 8])).toBe('▁▂▃▄▅▆▇█');
      expect(generateSparkline([5, 5, 5, 5])).toBe('████');
      expect(generateSparkline([0, 0, 0])).toBe('▁▁▁');
      expect(generateSparkline([42])).toBe('█');
      expect(generateSparkline([0])).toBe('▁');
      expect(generateSparkline([1, null, 3])).toBe('▁·█');
      expect(generateSparkline([null, null, null])).toBe('···');
    });

    it('should downsample values to max length', () => {
      const values = Array.from({ length: 150 }, (_, i) => i + 1);
      expect(generateSparkline(values).length).toBe(120);
    });

    it('should downsample with majority-null bucket rule', () => {
      const result = downsample([1, null, null, 1, 2, null], 2);
      expect(result).toEqual([null, 1.5]);
    });
  });

  describe('section formatters', () => {
    it('should render usage-style metadata fields', () => {
      const metadata = formatMetadataHeader({
        metric: 'vercel.request.route_cpu_duration_ms',
        aggregation: 'avg',
        periodStart: '2026-02-19T10:00:00.000Z',
        periodEnd: '2026-02-19T10:15:00.000Z',
        granularity: { minutes: 5 },
        filter: 'httpStatus ge 500',
        scope: projectScope,
        unit: 'milliseconds',
        groupCount: 2,
        projectName: 'my-project',
        teamName: 'my-team',
      });

      expect(metadata).toContain('> ');
      expect(metadata).toContain('Metric:');
      expect(metadata).toContain('Period:');
      expect(metadata).toContain('Interval:');
      expect(metadata).toContain('Filter:');
      expect(metadata).toContain('Project:');
      expect(metadata).toContain('Units:');
      expect(metadata).toContain('Groups:');
      expect(metadata).toContain('2026-02-19 10:00 to 2026-02-19 10:15');
    });

    it('should format grouped sparkline section', () => {
      const sparklineSection = formatSparklineSection(
        [
          ['my-app', '200'],
          ['shop-app', '500'],
        ],
        ['▁▂▃', '█▇▆'],
        ['projectName', 'httpStatus']
      );

      expect(sparklineSection).toContain('sparklines:');
      expect(sparklineSection).toContain('projectName');
      expect(sparklineSection).toContain('httpStatus');
      expect(sparklineSection).toContain('sparkline');
      expect(sparklineSection).toContain('my-app');
      expect(sparklineSection).toContain('shop-app');
      expect(sparklineSection).toContain('▁▂▃');
      expect(sparklineSection).toContain('█▇▆');
    });
  });

  describe('formatText', () => {
    it('should render ungrouped text output (snapshot)', () => {
      const response: MetricsQueryResponse = {
        data: [
          {
            timestamp: '2026-02-19T10:00:00.000Z',
            vercel_request_count_sum: 10,
          },
          {
            timestamp: '2026-02-19T10:05:00.000Z',
            vercel_request_count_sum: 20,
          },
          {
            timestamp: '2026-02-19T10:10:00.000Z',
            vercel_request_count_sum: 30,
          },
        ],
        summary: [],
        statistics: {},
      };

      const output = formatText(response, {
        metric: 'vercel.request.count',
        metricUnit: 'count',
        aggregation: 'sum',
        groupBy: [],
        scope: projectScope,
        projectName: 'my-project',
        teamName: 'my-team',
        periodStart: '2026-02-19T10:00:00.000Z',
        periodEnd: '2026-02-19T10:15:00.000Z',
        granularity: { minutes: 5 },
      });

      const normalized = output
        .split('\n')
        .map(line => stripAnsi(line))
        .join('\n')
        .split('\n')
        .map(line => line.trimEnd())
        .join('\n');

      expect(normalized).toMatchInlineSnapshot(`
        "> Metric: vercel.request.count sum
        > Period: 2026-02-19 10:00 to 2026-02-19 10:15
        > Interval: 5m
        > Project: my-project (my-team)

          total  avg      min          max
             60   20  10 at 10:00  30 at 10:10

        sparklines:
          ▁▅█
        "
      `);
    });

    it('should render grouped duration output with units and raw values', () => {
      const response: MetricsQueryResponse = {
        data: [
          {
            timestamp: '2026-02-19T10:00:00.000Z',
            projectName: 'my-app',
            httpStatus: '200',
            vercel_request_route_cpu_duration_ms_avg: 100,
          },
          {
            timestamp: '2026-02-19T10:05:00.000Z',
            projectName: 'my-app',
            httpStatus: '200',
            vercel_request_route_cpu_duration_ms_avg: 200,
          },
          {
            timestamp: '2026-02-19T10:10:00.000Z',
            projectName: 'my-app',
            httpStatus: '200',
            vercel_request_route_cpu_duration_ms_avg: 300,
          },
          {
            timestamp: '2026-02-19T10:00:00.000Z',
            projectName: 'my-app',
            httpStatus: '500',
            vercel_request_route_cpu_duration_ms_avg: 10,
          },
          {
            timestamp: '2026-02-19T10:10:00.000Z',
            projectName: 'my-app',
            httpStatus: '500',
            vercel_request_route_cpu_duration_ms_avg: 30,
          },
        ],
        summary: [],
        statistics: {},
      };

      const output = formatText(response, {
        metric: 'vercel.request.route_cpu_duration_ms',
        metricUnit: 'milliseconds',
        aggregation: 'avg',
        groupBy: ['projectName', 'httpStatus'],
        scope: projectScope,
        periodStart: '2026-02-19T10:00:00.000Z',
        periodEnd: '2026-02-19T10:15:00.000Z',
        granularity: { minutes: 5 },
      });

      expect(output).toContain('Units:');
      expect(output).toContain('ms');
      expect(output).toContain('Groups:');
      expect(output).toContain('2');
      expect(output).toContain('projectName');
      expect(output).toContain('httpStatus');
      expect(output).toContain('sparklines:');
      expect(output).toContain('my-app');
      expect(output).toContain('200');
      expect(output).toContain('500');
    });

    it('should keep fractional average for count sum output', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_request_count_sum: 1,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              vercel_request_count_sum: 2,
            },
          ],
          summary: [],
          statistics: {},
        },
        {
          metric: 'vercel.request.count',
          metricUnit: 'count',
          aggregation: 'sum',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      expect(output).toContain('1.5');
    });

    it('should show no-data output when response has no rows', () => {
      const output = formatText(
        {
          data: [],
          summary: [],
          statistics: {},
        },
        {
          metric: 'vercel.request.count',
          metricUnit: 'count',
          aggregation: 'sum',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:15:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      expect(output).toContain('Metric:');
      expect(output).toContain('No data found for this period.');
      expect(output).not.toContain('sparklines:');
    });

    it('should show Units: % and no total for percent aggregation with bytes measure', () => {
      const response: MetricsQueryResponse = {
        data: [
          {
            timestamp: '2026-02-19T10:00:00.000Z',
            vercel_request_fdt_in_bytes_percent: 40,
          },
          {
            timestamp: '2026-02-19T10:05:00.000Z',
            vercel_request_fdt_in_bytes_percent: 35,
          },
          {
            timestamp: '2026-02-19T10:10:00.000Z',
            vercel_request_fdt_in_bytes_percent: 25,
          },
        ],
        summary: [],
        statistics: {},
      };

      const output = formatText(response, {
        metric: 'vercel.request.fdt_in_bytes',
        metricUnit: 'bytes',
        aggregation: 'percent',
        groupBy: [],
        scope: projectScope,
        projectName: 'my-project',
        teamName: 'my-team',
        periodStart: '2026-02-19T10:00:00.000Z',
        periodEnd: '2026-02-19T10:15:00.000Z',
        granularity: { minutes: 5 },
      });

      const normalized = output
        .split('\n')
        .map(line => stripAnsi(line).trimEnd())
        .join('\n');

      expect(normalized).toContain('Units: %');
      expect(normalized).not.toContain('Units: bytes');
      expect(normalized).not.toContain('total');
      expect(normalized).toContain('avg');
      expect(normalized).toContain('min');
      expect(normalized).toContain('max');
    });

    it('should show Units: bytes/s for persecond aggregation with bytes measure', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_request_fdt_in_bytes_persecond: 1024,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              vercel_request_fdt_in_bytes_persecond: 2048,
            },
          ],
          summary: [],
          statistics: {},
        },
        {
          metric: 'vercel.request.fdt_in_bytes',
          metricUnit: 'bytes',
          aggregation: 'persecond',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      const normalized = output
        .split('\n')
        .map(line => stripAnsi(line).trimEnd())
        .join('\n');

      expect(normalized).toContain('Units: bytes/s');
      expect(normalized).not.toContain('total');
    });

    it('should hide Units line for unique aggregation', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_request_count_unique: 5,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              vercel_request_count_unique: 8,
            },
          ],
          summary: [],
          statistics: {},
        },
        {
          metric: 'vercel.request.count',
          metricUnit: 'count',
          aggregation: 'unique',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      const normalized = output
        .split('\n')
        .map(line => stripAnsi(line).trimEnd())
        .join('\n');

      expect(normalized).not.toContain('Units:');
      expect(normalized).not.toContain('total');
    });

    it('should still show total for sum aggregation with duration measure', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_request_route_cpu_duration_ms_sum: 500,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              vercel_request_route_cpu_duration_ms_sum: 300,
            },
          ],
          summary: [],
          statistics: {},
        },
        {
          metric: 'vercel.request.route_cpu_duration_ms',
          metricUnit: 'milliseconds',
          aggregation: 'sum',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      const normalized = output
        .split('\n')
        .map(line => stripAnsi(line).trimEnd())
        .join('\n');

      expect(normalized).toContain('Units: ms');
      expect(normalized).toContain('total');
    });
  });
});
