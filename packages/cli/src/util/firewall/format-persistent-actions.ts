import chalk from 'chalk';
import table from '../output/table';
import { generateSparkline } from '../../commands/metrics/text-output';
import { formatAlignedLabel } from '../output/print-aligned-label';
import {
  ACTION_COLORS,
  formatCount,
  formatUtcTime,
  labelForAction,
  windowNeedsDate,
} from './format-utils';
import type { FirewallActionSeries } from './get-firewall-metrics';
import type { NamedCount } from './get-firewall-events';
import {
  apiTimestampMs,
  ruleTypeLabel,
  type PersistentActionsSummary,
  type FirewallEventAction,
} from './get-firewall-events';

export const DEFAULT_PERSISTENT_ACTION_LIMIT = 10;
export const DEFAULT_PERSISTENT_ACTION_WINDOW_MS = 60 * 60 * 1000;

export function persistentActionWindow(
  since: Date | undefined,
  until: Date | undefined
): { from: Date; to: Date } {
  const to = until ?? new Date();
  const from =
    since ?? new Date(to.getTime() - DEFAULT_PERSISTENT_ACTION_WINDOW_MS);
  return { from, to };
}

export function formatPersistentActionWindowLabel(
  from: Date,
  to: Date
): string {
  const spanMs = to.getTime() - from.getTime();
  const hours = spanMs / 3_600_000;
  const untilIsNow = Date.now() - to.getTime() < 60_000;
  if (untilIsNow && hours > 0.9 && hours < 1.1) return 'past 1h, UTC';
  if (untilIsNow && Number.isInteger(hours) && hours >= 1 && hours <= 48) {
    return `past ${hours}h, UTC`;
  }
  return `${formatUtcTime(from.getTime(), true)} – ${formatUtcTime(to.getTime(), true)} UTC`;
}

/** Pinned to UTC; see `apiTimestampMs`. These are then displayed as UTC. */
function actionMs(value: string): number {
  return apiTimestampMs(value);
}

/**
 * An action still in force has no settled end: its `endTime` is a projected
 * expiry, which would read as a time it stopped. Say so instead.
 */
function formatEnd(action: FirewallEventAction): string {
  if (action.isActive) return chalk.blue('Ongoing');
  return `${formatUtcTime(actionMs(action.endTime), true)} UTC`;
}

/**
 * Coloured and title-cased, matching how every other firewall surface renders
 * an action. The colour keys off the raw value; only the label is cased, and
 * `--json` keeps the API's own casing.
 */
function colorAction(action: string): string {
  const color = ACTION_COLORS[action] ?? ((s: string) => s);
  return color(labelForAction(action));
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
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

export function formatPersistentActionsList(opts: {
  /** The page being shown. */
  actions: FirewallEventAction[];
  total: number;
  /** Computed over every action in the window, not just this page. */
  summary: PersistentActionsSummary | null;
  from: Date;
  to: Date;
}): string {
  const lines = [
    `  ${chalk.bold('Persistent actions')}  (${formatPersistentActionWindowLabel(opts.from, opts.to)})`,
  ];

  // What is in force now, so the answer does not depend on reading the rows.
  const summary = opts.summary;
  if (summary) {
    const parts = [
      summary.challengingIps > 0
        ? `Challenging ${summary.challengingIps} ${pluralize(summary.challengingIps, 'IP')}`
        : null,
      summary.blockingIps > 0
        ? `Blocking ${summary.blockingIps} ${pluralize(summary.blockingIps, 'IP')}`
        : null,
      summary.otherActions > 0
        ? `${summary.otherActions} other ${pluralize(summary.otherActions, 'action')}`
        : null,
    ].filter((part): part is string => Boolean(part));
    lines.push(
      `  ${parts.join(' · ')} ${chalk.dim(`· ${summary.activeTotal} currently applied`)}`
    );
  }
  lines.push('');

  if (opts.actions.length === 0) {
    lines.push(chalk.dim('  No persistent actions in this window.'));
    lines.push('');
    return lines.join('\n');
  }

  // `Type` separates the platform's rules from the project's own, which a
  // hardcoded label could not.
  const header = [
    'Type',
    'Action',
    'Hostname',
    'IP Address',
    'Start',
    'End',
    'Requests',
  ].map(h => chalk.bold(chalk.cyan(h)));
  const rows: string[][] = [header];
  for (const action of opts.actions) {
    rows.push([
      ruleTypeLabel(action.action_type),
      colorAction(action.action),
      action.host,
      action.public_ip,
      `${formatUtcTime(actionMs(action.startTime), true)} UTC`,
      formatEnd(action),
      formatCount(action.count),
    ]);
  }

  const rendered = table(rows, {
    align: ['l', 'l', 'l', 'l', 'l', 'l', 'r'],
    hsep: 3,
  });
  for (const line of rendered.split('\n')) {
    lines.push(`  ${line}`.trimEnd());
  }

  if (opts.actions.length < opts.total) {
    lines.push('');
    lines.push(
      `  Showing ${opts.actions.length} of ${opts.total}. Raise --limit, or narrow with --since and --until.`
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function formatActionTrendTable(series: FirewallActionSeries[]): string {
  const allTs = new Set<string>();
  for (const s of series) {
    for (const p of s.timeseries) allTs.add(p.timestamp);
  }
  const axis = [...allTs].sort();
  const hasAnyTraffic = series.some(
    s => s.total > 0 || s.timeseries.some(p => p.value > 0)
  );

  if (series.length === 0 || axis.length === 0 || !hasAnyTraffic) {
    return chalk.dim('  No request data for this period.');
  }

  const startMs = new Date(axis[0]).getTime();
  const endMs = new Date(axis[axis.length - 1]).getTime();
  const needsDate = windowNeedsDate(startMs, endMs);

  const header = ['Action', 'Trend', 'Total', 'Peak', 'Peak at'].map(h =>
    chalk.bold(chalk.cyan(h))
  );
  const rows: string[][] = [header];

  for (const s of series) {
    const byTs = new Map(s.timeseries.map(p => [p.timestamp, p.value]));
    const values = axis.map(t => byTs.get(t) ?? 0);

    let peak = 0;
    let peakTs = '';
    for (let i = 0; i < axis.length; i++) {
      if (values[i] > peak) {
        peak = values[i];
        peakTs = axis[i];
      }
    }

    const plain = (x: string) => x;
    const color = s.total > 0 ? (ACTION_COLORS[s.action] ?? plain) : chalk.dim;
    const trend = s.total > 0 ? plain : chalk.dim;
    rows.push([
      color(labelForAction(s.action)),
      trend(generateSparkline(values)),
      formatCount(s.total),
      peak > 0 ? formatCount(peak) : '--',
      peak > 0 ? formatUtcTime(new Date(peakTs).getTime(), needsDate) : '--',
    ]);
  }

  const rendered = table(rows, {
    align: ['l', 'l', 'r', 'r', 'r'],
    hsep: 3,
  });
  return rendered
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}

export function formatPersistentActionInspect(opts: {
  action: FirewallEventAction;
  matchCount: number;
  series?: FirewallActionSeries[];
  paths?: NamedCount[];
  /** Paths were not requested, so say how to get them. */
  pathsAvailable?: boolean;
}): string {
  const { action } = opts;
  const lines = [
    `  ${chalk.bold('Persistent action')}`,
    '',
    formatAlignedLabel(
      'Start',
      `${formatUtcTime(actionMs(action.startTime), true)} UTC`
    ),
    formatAlignedLabel('End', formatEnd(action)),
    formatAlignedLabel('Action', colorAction(action.action)),
    formatAlignedLabel('Type', ruleTypeLabel(action.action_type)),
    formatAlignedLabel('Hostname', action.host),
    formatAlignedLabel('IP', action.public_ip),
    formatAlignedLabel('Requests', formatCount(action.count)),
  ];

  if (opts.matchCount > 1) {
    lines.push('');
    lines.push(
      `  Showing the most recent of ${opts.matchCount} matching persistent actions. Pass --host, --action, --since, and --until to pick one.`
    );
  }

  if (opts.series) {
    lines.push('');
    lines.push(`  ${chalk.bold('Requests by Action')}`);
    lines.push(formatActionTrendTable(opts.series));
  }

  if (opts.pathsAvailable) {
    lines.push('');
    lines.push(
      chalk.dim('  Pass --paths for the paths this client requested.')
    );
  }
  if (opts.paths && opts.paths.length > 0) {
    lines.push('');
    lines.push(`  ${chalk.bold('Top Request Paths')}`);
    lines.push(formatNamedCounts(opts.paths));
  }

  lines.push('');
  return lines.join('\n');
}
