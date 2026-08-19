import chalk from 'chalk';
import table from '../output/table';
import { ellipsizeMiddle } from '../output/truncate';
import { generateSparkline } from '../../commands/metrics/text-output';
import {
  ACTION_COLORS,
  formatCount,
  formatUtcTime,
  labelForAction,
  relativeTime,
  windowNeedsDate,
} from './format-utils';
import { granularityLabel } from './get-firewall-traffic';
import type {
  GroupedTimeseriesResult,
  TopListRow,
  TrafficSeriesGroup,
} from './get-firewall-traffic';
import type { Granularity } from '../../commands/metrics/types';
import type { FirewallAlertRow } from './get-firewall-alerts';

const MAX_VALUE_WIDTH = 60;

const ACTION_PAST_TENSE: Record<string, string> = {
  deny: 'Denied',
  challenge: 'Challenged',
  log: 'Logged',
  allow: 'Allowed',
  bypass: 'Bypassed',
  rate_limit: 'Rate Limited',
  'rate-limit': 'Rate Limited',
};

/** Human labels for detail fields shown in drill-in headers. */
const FIELD_LABELS: Record<string, string> = {
  asn_name: 'AS Name',
  asn_id: 'AS Number',
  client_ip_country: 'Country',
  client_user_agent: 'User Agent',
  client_ip: 'IP Address',
  client_ja4_digest: 'JA4 Digest',
  request_path: 'Path',
  request_hostname: 'Hostname',
  waf_rule_id: 'Rule',
  waf_action: 'Action',
  bot_name: 'Bot',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function rangeLabel(opts: {
  startMs: number;
  endMs: number;
  points: number;
  granularity: Granularity;
}): string {
  const label = `${formatUtcTime(opts.startMs, true)} – ${formatUtcTime(opts.endMs, true)} UTC`;
  if (opts.points === 0) return label;
  return `${label} · ${opts.points} point${opts.points === 1 ? '' : 's'} (${granularityLabel(opts.granularity)} each)`;
}

/**
 * Chart stand-in table in the dom-md spec shape: one row per series with
 * trend sparkline + total + peak coordinates so text output correlates with
 * alerts by timestamp string match.
 */
export function formatSeriesTable(opts: {
  labelHeader: string;
  rows: Array<{
    label: string;
    color?: (s: string) => string;
    total: number;
    series: number[];
  }>;
  axis: string[];
  needsDate: boolean;
}): string[] {
  const header = [opts.labelHeader, 'Trend', 'Total', 'Peak', 'Peak at'].map(
    h => chalk.bold(chalk.cyan(h))
  );
  const rows: string[][] = [header];

  for (const r of opts.rows) {
    let peak = 0;
    let peakTs = '';
    for (let i = 0; i < opts.axis.length; i++) {
      if (r.series[i] > peak) {
        peak = r.series[i];
        peakTs = opts.axis[i];
      }
    }
    const color = r.total > 0 ? (r.color ?? ((x: string) => x)) : chalk.dim;
    rows.push([
      ellipsizeMiddle(r.label, MAX_VALUE_WIDTH),
      color(generateSparkline(r.series)),
      formatCount(r.total),
      peak > 0 ? formatCount(peak) : '--',
      peak > 0
        ? formatUtcTime(new Date(peakTs).getTime(), opts.needsDate)
        : '--',
    ]);
  }

  return table(rows, { align: ['l', 'l', 'r', 'r', 'r'], hsep: 3 })
    .split('\n')
    .map(line => `  ${line}`);
}

export function actionSeriesRows(groups: TrafficSeriesGroup[]): Array<{
  label: string;
  color?: (s: string) => string;
  total: number;
  series: number[];
}> {
  return groups.map(g => {
    const action = g.values.waf_action ?? g.key;
    return {
      label: labelForAction(action || 'unknown'),
      color: ACTION_COLORS[action],
      total: g.total,
      series: g.series,
    };
  });
}

export interface WidgetResult {
  title: string;
  dimension: string;
  rows: Array<{ label: string; total: number }>;
  error?: string;
}

export function topListToWidgetRows(
  rows: TopListRow[],
  field: string
): Array<{ label: string; total: number }> {
  return rows.map(r => ({
    label: r.values[field] || '(not set)',
    total: r.total,
  }));
}

function formatWidget(widget: WidgetResult): string[] {
  const lines: string[] = [chalk.bold(`  ${widget.title}`)];
  if (widget.error) {
    lines.push(chalk.dim(`  Unavailable: ${widget.error}`));
    return lines;
  }
  if (widget.rows.length === 0) {
    lines.push(chalk.dim('  No data.'));
    return lines;
  }
  const rendered = table(
    widget.rows.map(r => [
      ellipsizeMiddle(r.label, MAX_VALUE_WIDTH),
      formatCount(r.total),
    ]),
    { align: ['l', 'r'], hsep: 3 }
  );
  for (const line of rendered.split('\n')) {
    lines.push(`  ${line}`);
  }
  return lines;
}

export function formatTrafficDashboardOutput(opts: {
  actions: GroupedTimeseriesResult;
  widgets: WidgetResult[];
  filter?: string;
}): string {
  const lines: string[] = [''];
  const startMs = new Date(opts.actions.startTime).getTime();
  const endMs = new Date(opts.actions.endTime).getTime();
  const needsDate = windowNeedsDate(startMs, endMs);

  lines.push(
    `  ${chalk.bold('Firewall Traffic')}  ${chalk.dim(
      rangeLabel({
        startMs,
        endMs,
        points: opts.actions.axis.length,
        granularity: opts.actions.granularity,
      })
    )}`
  );
  if (opts.filter) {
    lines.push(`  ${chalk.dim('Filter:')} ${opts.filter}`);
  }
  lines.push('');

  lines.push(chalk.bold('  Requests by Action'));
  if (opts.actions.groups.length === 0) {
    lines.push(chalk.dim('  No request data for this period.'));
  } else {
    lines.push(
      ...formatSeriesTable({
        labelHeader: 'Action',
        rows: actionSeriesRows(opts.actions.groups),
        axis: opts.actions.axis,
        needsDate,
      })
    );
  }

  for (const widget of opts.widgets) {
    lines.push('');
    lines.push(...formatWidget(widget));
  }

  lines.push('');
  lines.push(
    chalk.dim(
      '  Drill into any value with `vercel firewall drill-in <dimension> <value>`.'
    )
  );
  lines.push('');
  return lines.join('\n');
}

export function formatDrillInOutput(opts: {
  value: string;
  dimensionLabel: string;
  headerDetail: Array<{ field: string; value: string }>;
  timeseries: GroupedTimeseriesResult;
  total: number;
  breakdown: GroupedTimeseriesResult;
  breakdownField: string;
  breakdownLabel: string;
  top: number;
  filter?: string;
}): string {
  const lines: string[] = [''];
  const startMs = new Date(opts.timeseries.startTime).getTime();
  const endMs = new Date(opts.timeseries.endTime).getTime();
  const needsDate = windowNeedsDate(startMs, endMs);

  lines.push(`  ${chalk.bold(opts.value)}  ${chalk.dim(opts.dimensionLabel)}`);
  if (opts.headerDetail.length > 0) {
    const detail = opts.headerDetail
      .filter(d => d.value)
      .map(
        d =>
          `${chalk.dim(`${fieldLabel(d.field)}:`)} ${ellipsizeMiddle(d.value, MAX_VALUE_WIDTH)}`
      )
      .join('  ·  ');
    if (detail) lines.push(`  ${detail}`);
  }
  if (opts.filter) {
    lines.push(`  ${chalk.dim('Filter:')} ${opts.filter}`);
  }
  lines.push('');

  lines.push(
    `  ${chalk.bold('Requests')}  ${formatCount(opts.total)}  ${chalk.dim(
      rangeLabel({
        startMs,
        endMs,
        points: opts.timeseries.axis.length,
        granularity: opts.timeseries.granularity,
      })
    )}`
  );
  const entity = opts.timeseries.groups[0];
  if (!entity || entity.total === 0) {
    lines.push(chalk.dim('  No request data for this period.'));
  } else {
    lines.push(`  ${generateSparkline(entity.series)}`);
    let peak = 0;
    let peakTs = '';
    for (let i = 0; i < opts.timeseries.axis.length; i++) {
      if (entity.series[i] > peak) {
        peak = entity.series[i];
        peakTs = opts.timeseries.axis[i];
      }
    }
    if (peak > 0) {
      lines.push(
        chalk.dim(
          `  Peak ${formatCount(peak)} at ${formatUtcTime(new Date(peakTs).getTime(), needsDate)} UTC`
        )
      );
    }
  }
  lines.push('');

  lines.push(
    chalk.bold(`  Breakdown by ${opts.breakdownLabel}`) +
      chalk.dim(`  (top ${opts.top})`)
  );
  if (opts.breakdown.groups.length === 0) {
    lines.push(chalk.dim('  No data.'));
  } else {
    lines.push(
      ...formatSeriesTable({
        labelHeader: opts.breakdownLabel,
        rows: opts.breakdown.groups.map(g => ({
          label: g.values[opts.breakdownField] || '(not set)',
          total: g.total,
          series: g.series,
        })),
        axis: opts.breakdown.axis,
        needsDate,
      })
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function formatAlertDetailOutput(opts: {
  alert: FirewallAlertRow;
  baselineAvgPerMin: number | null;
  anomalyAvgPerMin: number | null;
  timeseries: GroupedTimeseriesResult | null;
  anomalyStartMs: number;
  anomalyEndMs: number;
  topIps: TopListRow[];
  topHosts: TopListRow[];
}): string {
  const lines: string[] = [''];
  const { alert } = opts;
  const state = alert.resolvedAt
    ? chalk.dim('Resolved')
    : chalk.red('● Active');
  lines.push(`  ${chalk.bold(alert.title)}  ${state}`);

  const needsDate = true;
  const meta: Array<[string, string | undefined]> = [
    [
      'Started',
      `${formatUtcTime(alert.startedAt, needsDate)} UTC ${chalk.dim(`(${relativeTime(alert.startedAt)})`)}`,
    ],
    [
      'Resolved',
      alert.resolvedAt
        ? `${formatUtcTime(alert.resolvedAt, needsDate)} UTC ${chalk.dim(`(${relativeTime(alert.resolvedAt)})`)}`
        : undefined,
    ],
    ['Hostname', alert.host],
    ['Rule', alert.ruleId],
    ['Action', alert.action ? labelForAction(alert.action) : undefined],
    ['Path', alert.path],
    [
      'Requests',
      alert.count !== undefined ? formatCount(alert.count) : undefined,
    ],
  ];
  for (const [key, value] of meta) {
    if (value) {
      lines.push(`  ${chalk.bold(`${key}:`.padEnd(10))} ${value}`);
    }
  }
  lines.push('');

  if (opts.baselineAvgPerMin !== null && opts.anomalyAvgPerMin !== null) {
    const multiplier =
      opts.baselineAvgPerMin > 0
        ? opts.anomalyAvgPerMin / opts.baselineAvgPerMin
        : null;
    lines.push(
      `  ${chalk.bold('Previous 24h (avg):')}    ${formatCount(opts.baselineAvgPerMin)} req/min`
    );
    lines.push(
      `  ${chalk.bold('During anomaly (avg):')}  ${formatCount(opts.anomalyAvgPerMin)} req/min` +
        (multiplier !== null && multiplier >= 2
          ? `  ${chalk.red(`${Math.round(multiplier)}x`)}`
          : '')
    );
    lines.push('');
  }

  if (opts.timeseries) {
    const startMs = new Date(opts.timeseries.startTime).getTime();
    const endMs = new Date(opts.timeseries.endTime).getTime();
    const series = opts.timeseries.groups[0];
    lines.push(
      `  ${chalk.bold('Requests')}${alert.action ? chalk.dim(` (${labelForAction(alert.action).toLowerCase()})`) : ''}  ${chalk.dim(
        rangeLabel({
          startMs,
          endMs,
          points: opts.timeseries.axis.length,
          granularity: opts.timeseries.granularity,
        })
      )}`
    );
    if (series && series.total > 0) {
      lines.push(`  ${generateSparkline(series.series)}`);
    } else {
      lines.push(chalk.dim('  No request data for this window.'));
    }
    lines.push(
      chalk.dim(
        `  Anomaly window: ${formatUtcTime(opts.anomalyStartMs, needsDate)} – ${formatUtcTime(opts.anomalyEndMs, needsDate)} UTC`
      )
    );
    lines.push('');
  }

  const ipTitle = alert.action
    ? `${ACTION_PAST_TENSE[alert.action] ?? 'Top'} IPs`
    : 'Top IPs';
  lines.push(
    ...formatWidget({
      title: `${ipTitle} (during anomaly)`,
      dimension: 'ip',
      rows: topListToWidgetRows(opts.topIps, 'client_ip'),
    })
  );
  lines.push('');
  lines.push(
    ...formatWidget({
      title: 'Top Hosts (during anomaly)',
      dimension: 'host',
      rows: topListToWidgetRows(opts.topHosts, 'request_hostname'),
    })
  );

  lines.push('');
  return lines.join('\n');
}
