import chalk from 'chalk';
import { generateSparkline } from '../../commands/metrics/text-output';
import table from '../output/table';
import { formatAlignedLabel } from '../output/print-aligned-label';
import {
  ACTION_COLORS,
  colorizeDetail,
  formatCount,
  formatUtcDateTime,
  formatUtcTime,
  labelForAction,
  relativeTime,
} from './format-utils';
import type { FirewallAlertRow } from './get-firewall-alerts';
import type { NamedCount } from './get-firewall-events';

export function splitAlertSections(alerts: FirewallAlertRow[]): {
  active: FirewallAlertRow[];
  resolved: FirewallAlertRow[];
} {
  const active: FirewallAlertRow[] = [];
  const resolved: FirewallAlertRow[] = [];
  for (const alert of alerts) {
    if (alert.resolvedAt) resolved.push(alert);
    else active.push(alert);
  }
  return { active, resolved };
}

function alertRow(alert: FirewallAlertRow): string[] {
  return [
    alert.resolvedAt ? chalk.dim('Resolved') : chalk.yellow('Active'),
    alert.title,
    alert.detail ? colorizeDetail(alert.detail) : '',
    alert.count !== undefined ? formatCount(alert.count) : '—',
    `${formatUtcTime(alert.startedAt, true)} UTC`,
    relativeTime(alert.startedAt),
    alert.id,
  ];
}

/**
 * Scan-first table, matching `persistent-actions list`. Active alerts sort
 * first so an ongoing attack is the first row read, and the id travels on the
 * row rather than a line of its own so the list stays scannable.
 */
export function formatAlertsList(opts: {
  active: FirewallAlertRow[];
  resolved: FirewallAlertRow[];
  from: Date;
  to: Date;
}): string {
  const lines: string[] = [];
  const window = `${formatUtcTime(opts.from.getTime(), true)} – ${formatUtcTime(opts.to.getTime(), true)} UTC`;
  lines.push(`  ${chalk.bold('Firewall alerts')}  ${chalk.dim(`(${window})`)}`);
  lines.push('');

  const alerts = [...opts.active, ...opts.resolved];
  if (alerts.length === 0) {
    lines.push(chalk.dim('  No alerts in this window.'));
    lines.push('');
    return lines.join('\n');
  }

  const header = [
    'Status',
    'Alert',
    'Detail',
    'Requests',
    'Started',
    'Age',
    'Id',
  ].map(h => chalk.bold(chalk.cyan(h)));
  const rendered = table([header, ...alerts.map(alertRow)], {
    align: ['l', 'l', 'l', 'r', 'l', 'r', 'l'],
    hsep: 3,
  });
  for (const line of rendered.split('\n')) {
    lines.push(`  ${line}`.trimEnd());
  }

  lines.push('');
  return lines.join('\n');
}

export interface AlertInspectRates {
  previousReqPerMin: number;
  anomalyReqPerMin: number;
  multiplier: number | null;
}

export interface AlertInspectView {
  alert: FirewallAlertRow;
  rates?: AlertInspectRates;
  timeseries?: {
    action: string;
    startMs: number;
    endMs: number;
    pointCount: number;
    granularityMinutes: number;
    values: number[];
  };
  ips?: NamedCount[];
  hosts?: NamedCount[];
}

function formatNamedCounts(rows: NamedCount[]): string {
  const nameWidth = Math.max(...rows.map(r => r.name.length), 0);
  const countWidth = Math.max(...rows.map(r => formatCount(r.count).length), 0);
  return rows
    .map(
      row =>
        `  ${row.name.padEnd(nameWidth)}   ${formatCount(row.count).padStart(countWidth)}`
    )
    .join('\n');
}

function formatRate(n: number): string {
  return `${formatCount(n)} req/min`;
}

export function formatAlertInspect(view: AlertInspectView): string {
  const { alert } = view;
  const status = alert.resolvedAt ? 'Resolved' : chalk.yellow('Active');
  const lines: string[] = [
    `  ${chalk.bold(alert.title)}  ${status}`,
    formatAlignedLabel('Started', formatUtcDateTime(alert.startedAt)),
  ];
  if (alert.resolvedAt) {
    lines.push(
      formatAlignedLabel('Resolved', formatUtcDateTime(alert.resolvedAt))
    );
  }
  if (alert.ruleId) {
    lines.push(formatAlignedLabel('Rule', alert.ruleId));
  }
  if (alert.action) {
    const color = ACTION_COLORS[alert.action] ?? ((s: string) => s);
    lines.push(
      formatAlignedLabel('Action', color(labelForAction(alert.action)))
    );
  }
  if (alert.count !== undefined) {
    lines.push(formatAlignedLabel('Requests', formatCount(alert.count)));
  }

  if (view.rates) {
    lines.push('');
    lines.push(
      formatAlignedLabel(
        'Previous 24h',
        formatRate(view.rates.previousReqPerMin)
      )
    );
    const anomaly = formatRate(view.rates.anomalyReqPerMin);
    const multiplier =
      view.rates.multiplier !== null && view.rates.multiplier > 0
        ? `  ${Math.round(view.rates.multiplier)}x`
        : '';
    lines.push(formatAlignedLabel('Anomaly', `${anomaly}${multiplier}`));
  }

  if (view.timeseries && view.timeseries.values.length > 0) {
    const { timeseries } = view;
    const range = `${formatUtcTime(timeseries.startMs, true)} – ${formatUtcTime(timeseries.endMs, true)} UTC`;
    const points = `${timeseries.pointCount} point${timeseries.pointCount === 1 ? '' : 's'} (${timeseries.granularityMinutes}m each)`;
    const actionLabel = timeseries.action ? ` (${timeseries.action})` : '';
    lines.push('');
    lines.push(
      `  ${chalk.bold(`Requests${actionLabel}`)}  ${range} · ${points}`
    );
    lines.push(`  ${generateSparkline(timeseries.values)}`);
    if (alert.resolvedAt || alert.startedAt) {
      const endMs = alert.resolvedAt ?? timeseries.endMs;
      lines.push(
        `  Anomaly window: ${formatUtcTime(alert.startedAt, true)} – ${formatUtcTime(endMs, true)} UTC`
      );
    }
  }

  if (view.ips && view.ips.length > 0) {
    const ipTitle =
      alert.action === 'challenge'
        ? 'Challenged IPs (during anomaly)'
        : 'Denied IPs (during anomaly)';
    lines.push('');
    lines.push(chalk.bold(`  ${ipTitle}`));
    lines.push(formatNamedCounts(view.ips));
  }

  if (view.hosts && view.hosts.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Top Hosts (during anomaly)'));
    lines.push(formatNamedCounts(view.hosts));
  }

  lines.push('');
  return lines.join('\n');
}
