import { describe, expect, it } from 'vitest';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import {
  formatCount,
  formatDecimal,
  formatMinMaxTimestamp,
  extractGroupedSeries,
  computeGroupStats,
  downsample,
  generateSparkline,
  formatMetadataHeader,
  formatSparklineSection,
  formatMetricValue,
  formatText,
} from '../../../../src/commands/metrics/text-output';
import { ellipsizeMiddle } from '../../../../src/util/output/truncate';
import type {
  Aggregation,
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

    it('should format metric duration units', () => {
      expect(formatMetricValue(250, 'milliseconds', 'avg')).toBe('250ms');
      expect(formatMetricValue(1.5, 'seconds', 'avg')).toBe('1.5s');
      expect(formatMetricValue(1, 'minutes', 'avg')).toBe('1m');
      expect(formatMetricValue(1_250, 'microseconds', 'avg')).toBe('1,250 µs');
    });

    it('should format scaled metric byte units', () => {
      expect(formatMetricValue(1, 'kilobytes', 'sum')).toBe('1 KB');
      expect(formatMetricValue(1, 'gigabytes', 'sum')).toBe('1 GB');
      expect(formatMetricValue(1_000, 'bytes', 'persecond')).toBe('1 KB/s');
    });

    it('should format metric percentages and rates', () => {
      expect(formatMetricValue(12.34, 'percent', 'avg')).toBe('12.3%');
      expect(formatMetricValue(2.5, 'gigabyte_hour', 'avg')).toBe('2.5 GB-hrs');
      expect(formatMetricValue(3, 'units', 'persecond')).toBe('3/s');
    });

    it('should preserve unrecognized metric units', () => {
      expect(formatMetricValue(1_200, 'widgets', 'sum')).toBe('1.2K widgets');
      expect(formatMetricValue(1_200, 'widgets', 'persecond')).toBe(
        '1.2K widgets/s'
      );
    });
  });

  it('should format metric values inline without a redundant unit header', () => {
    const output = stripAnsi(
      formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              checkout_latency_p75: 250,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              checkout_latency_p75: 1_500,
            },
          ],
          summary: [],
          statistics: {},
        },
        {
          metric: 'checkout.latency',
          metricUnit: 'milliseconds',
          aggregation: 'p75',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      )
    );

    expect(output).toContain('875ms');
    expect(output).toContain('250ms at 10:00');
    expect(output).toContain('1.5s at 10:05');
    expect(output).not.toContain('Units:');
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

    it('should not split ANSI styling in visible-length mode', () => {
      const result = ellipsizeMiddle(chalk.gray('a'.repeat(100)), 10, true);
      expect(result).toBe('aaaaa…aaaa');
      expect(stripAnsi(result)).toHaveLength(10);
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

    it('should use observed bucket timestamps when request bounds are unrounded', () => {
      const result = extractGroupedSeries(
        [
          { timestamp: '2026-02-19T10:00:00.000Z', count_sum: 10 },
          { timestamp: '2026-02-19T10:30:00.000Z', count_sum: 30 },
        ],
        [],
        'count_sum',
        '2026-02-19T10:03:00.000Z',
        '2026-02-19T10:58:00.000Z',
        15 * 60 * 1000
      );

      expect(result.series.get('')!).toEqual([
        { timestamp: '2026-02-19T10:00:00.000Z', value: 10 },
        { timestamp: '2026-02-19T10:15:00.000Z', value: null },
        { timestamp: '2026-02-19T10:30:00.000Z', value: 30 },
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
        bucketTimezone: 'Europe/Paris',
        filter: 'httpStatus ge 500',
        orderBy: 'count',
        orderDirection: 'desc',
        scope: projectScope,
        groupCount: 2,
        projectName: 'my-project',
        teamName: 'my-team',
      });

      expect(metadata).toContain('> ');
      expect(metadata).toContain('Metric:');
      expect(metadata).toContain('Period:');
      expect(metadata).toContain('Interval:');
      expect(metadata).toContain('Filter:');
      expect(metadata).toContain('Order By:');
      expect(stripAnsi(metadata)).toContain('Order By: count desc (default)');
      expect(metadata).toContain('Project:');
      expect(metadata).toContain('Groups:');
      // Sub-day intervals are timezone-independent, so no zone is shown.
      expect(metadata).not.toContain('Timezone:');
      expect(metadata).not.toContain('Europe/Paris');
      expect(metadata).toContain('2026-02-19 10:00 to 2026-02-19 10:15 (UTC)');
      expect(stripAnsi(metadata)).not.toContain('[15m]');
    });

    it('should show a compact elapsed span for bucket-aligned bounds', () => {
      const metadata = formatMetadataHeader({
        metric: 'vercel.request.count',
        aggregation: 'sum',
        periodStart: '2026-07-10T09:03:00.000Z',
        periodEnd: '2026-07-10T10:04:00.000Z',
        granularity: { minutes: 1 },
        scope: projectScope,
        compact: true,
      });

      expect(stripAnsi(metadata)).toContain(
        'Period: 2026-07-10 09:03 to 2026-07-10 10:04 (UTC) [1h]'
      );
    });

    it('should annotate day intervals with the bucket alignment timezone', () => {
      const base = {
        metric: 'vercel.analytics_pageview.count',
        aggregation: 'sum' as const,
        periodStart: '2026-06-08T22:00:00.000Z',
        periodEnd: '2026-06-09T22:00:00.000Z',
        scope: projectScope,
      };

      const withTimezone = formatMetadataHeader({
        ...base,
        granularity: { days: 1 },
        bucketTimezone: 'Europe/Paris',
      });
      expect(stripAnsi(withTimezone)).toContain('Interval: 1d (Europe/Paris)');

      const withoutTimezone = formatMetadataHeader({
        ...base,
        granularity: { days: 1 },
      });
      expect(stripAnsi(withoutTimezone)).toContain('Interval: 1d (UTC)');

      const hourly = formatMetadataHeader({
        ...base,
        granularity: { hours: 1 },
        bucketTimezone: 'Europe/Paris',
      });
      expect(stripAnsi(hourly)).toContain('Interval: 1h');
      expect(stripAnsi(hourly)).not.toContain('Europe/Paris');
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

    it('should omit sparkline labels in compact output', () => {
      const sparklineSection = formatSparklineSection(
        [['true: Enabled']],
        ['▁▂▃'],
        ['Variants'],
        true
      );

      expect(sparklineSection).not.toContain('sparklines:');
      expect(sparklineSection).not.toContain('sparkline');
      expect(sparklineSection).toContain('Variants');
      expect(sparklineSection).toContain('true: Enabled');
      expect(sparklineSection).toContain('▁▂▃');
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
        > Period: 2026-02-19 10:00 to 2026-02-19 10:15 (UTC)
        > Interval: 5m
        > Project: my-project (my-team)

          total  avg      min          max
             60   20  10 at 10:00  30 at 10:10

        sparklines:
          ▁▅█
        "
      `);
    });

    it('should render grouped duration output with inline units', () => {
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

      expect(output).toContain('200ms');
      expect(output).toContain('10ms at 10:00');
      expect(output).toContain('Groups:');
      expect(output).toContain('2');
      expect(output).toContain('projectName');
      expect(output).toContain('httpStatus');
      expect(output).toContain('sparklines:');
      expect(output).toContain('sparkline');
      expect(output).toContain('█');
      expect(output).toContain('my-app');
      expect(output).toContain('200');
      expect(output).toContain('500');
    });

    it('should apply compact presentation at render time without merging groups', () => {
      const output = stripAnsi(
        formatText(
          {
            data: [
              {
                timestamp: '2026-02-19T10:00:00.000Z',
                Variants: 'variant-a',
                vercel_flag_evaluation_count_sum: 1,
              },
              {
                timestamp: '2026-02-19T10:00:00.000Z',
                Variants: 'variant-b',
                vercel_flag_evaluation_count_sum: 9,
              },
            ],
            summary: [],
            statistics: {},
          },
          {
            metric: 'vercel.flag_evaluation.count',
            metricUnit: 'count',
            aggregation: 'sum',
            groupBy: ['Variants'],
            filter: "flag_key eq 'example'",
            scope: projectScope,
            periodStart: '2026-02-19T10:00:00.000Z',
            periodEnd: '2026-02-19T10:05:00.000Z',
            granularity: { minutes: 5 },
            presentation: {
              compact: true,
              formatGroupValue: () => 'same display value',
            },
          }
        )
      );

      expect(output).not.toContain('Metric:');
      expect(output).not.toContain('Filter:');
      expect(output).not.toContain('Groups:');
      expect(output).not.toContain('Order By:');
      expect(output).not.toContain('sparklines:');
      expect(output).not.toContain('sparkline');
      expect(output.match(/same display value/g)).toHaveLength(4);
      expect(output.match(/Variants/g)).toHaveLength(2);
      expect(output).toContain(' 1 ');
      expect(output).toContain(' 9 ');
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

    it('should render count aggregation with an integer period total', () => {
      const output = stripAnsi(
        formatText(
          {
            data: [
              {
                timestamp: '2026-02-19T10:00:00.000Z',
                browser_api_browser_launch_total_count: 1_000,
              },
              {
                timestamp: '2026-02-19T10:05:00.000Z',
                browser_api_browser_launch_total_count: 2_001,
              },
            ],
            summary: [],
            statistics: {},
          },
          {
            metric: 'browser_api.browser.launch_total',
            metricUnit: 'count',
            aggregation: 'count',
            groupBy: [],
            scope: projectScope,
            periodStart: '2026-02-19T10:00:00.000Z',
            periodEnd: '2026-02-19T10:10:00.000Z',
            granularity: { minutes: 5 },
          }
        )
      );

      expect(output).toContain('total');
      expect(output).toContain('3,001');
      expect(output).toContain('1500.5');
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

    it('should format percent values inline and omit total', () => {
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

      expect(normalized).toContain('33.3%');
      expect(normalized).not.toContain('total');
      expect(normalized).toContain('avg');
      expect(normalized).toContain('min');
      expect(normalized).toContain('max');
    });

    it('should format byte rates inline', () => {
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

      expect(normalized).toContain('2 KB/s');
      expect(normalized).toContain('1 KB/s at 10:00');
      expect(normalized).not.toContain('total');
    });

    it('should omit total for unique aggregation', () => {
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

      expect(normalized).not.toContain('total');
    });

    it('should read rollup values for field-qualified unique aggregations', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_analytics_pageview_count_unique_visitor_id: 39430,
            },
            {
              timestamp: '2026-02-19T10:05:00.000Z',
              vercel_analytics_pageview_count_unique_visitor_id: 35998,
            },
          ],
          summary: [
            { vercel_analytics_pageview_count_unique_visitor_id: 737914 },
          ],
          statistics: {},
        },
        {
          metric: 'vercel.analytics_pageview.count',
          metricUnit: 'count',
          aggregation: 'unique/visitor_id' as Aggregation,
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:10:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      const normalized = stripAnsi(output);
      // Values must resolve from the slash-flattened column instead of
      // rendering as all-missing placeholders.
      expect(normalized).not.toContain('--');
      expect(normalized).toContain('35,998');
      expect(normalized).toContain('39,430');
      expect(normalized).toContain('█');
      // The whole-period deduplicated count comes from the API summary, since
      // per-bucket uniques cannot be summed into a period total.
      expect(normalized).toContain('Unique (period): 737,914');
    });

    it('should not show a period unique line for non-unique aggregations', () => {
      const output = formatText(
        {
          data: [
            {
              timestamp: '2026-02-19T10:00:00.000Z',
              vercel_request_count_sum: 100,
            },
          ],
          summary: [{ vercel_request_count_sum: 100 }],
          statistics: {},
        },
        {
          metric: 'vercel.request.count',
          metricUnit: 'count',
          aggregation: 'sum',
          groupBy: [],
          scope: projectScope,
          periodStart: '2026-02-19T10:00:00.000Z',
          periodEnd: '2026-02-19T10:05:00.000Z',
          granularity: { minutes: 5 },
        }
      );

      expect(stripAnsi(output)).not.toContain('Unique (period)');
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

      expect(normalized).toContain('800ms');
      expect(normalized).toContain('total');
    });
  });
});
