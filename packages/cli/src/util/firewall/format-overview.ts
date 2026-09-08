import chalk from 'chalk';
import table from '../output/table';
import { ellipsizeMiddle } from '../output/truncate';
import { generateSparkline } from '../../commands/metrics/text-output';
import {
  ACTION_COLORS,
  colorizeDetail,
  formatCount,
  formatUtcTime,
  granularityLabel,
  labelForAction,
  relativeTime,
  windowNeedsDate,
} from './format-utils';
import type { Granularity } from '../../commands/metrics/types';
import type { FirewallActionSeries } from './get-firewall-metrics';
import type { FirewallAlertRow } from './get-firewall-alerts';

export const OVERVIEW_TOP_RULES = 8;
const MAX_RULE_VALUE_WIDTH = 40;

export interface OverviewRuleRow {
  id: string;
  name: string;
  total: number;
}

/**
 * Chart stand-in modeled on the dashboard overview: attacks mitigated, a
 * Requests-by-Action timeseries, traffic by rule, then alerts carrying the
 * same timestamp format so peaks and alerts correlate by literal string match.
 */
export function formatOverviewOutput(opts: {
  series: FirewallActionSeries[];
  attacksMitigated: number;
  /** The count is a floor: a source feeding it could not be read. */
  attacksMitigatedIncomplete?: boolean;
  annotations: FirewallAlertRow[];
  rules: OverviewRuleRow[];
  startTime: string;
  endTime: string;
  granularity?: Granularity;
}): string {
  const lines: string[] = [];

  const windowStartMs = new Date(opts.startTime).getTime();
  const windowEndMs = new Date(opts.endTime).getTime();
  const needsDate = windowNeedsDate(windowStartMs, windowEndMs);

  // Marked inline rather than only in the notice below the block, so the
  // number is never read as a total on its own.
  const attacksSuffix = opts.attacksMitigatedIncomplete
    ? `  ${chalk.dim('· at least, some alerts unread')}`
    : '';
  lines.push(
    `  ${chalk.bold('Attacks mitigated')} (this window)  ${formatCount(opts.attacksMitigated)}${attacksSuffix}`
  );
  lines.push('');

  // Shared hourly axis across all series so trends align bucket-for-bucket.
  const allTs = new Set<string>();
  for (const s of opts.series) {
    for (const p of s.timeseries) allTs.add(p.timestamp);
  }
  const axis = [...allTs].sort();

  const bucket = opts.granularity
    ? granularityLabel(opts.granularity)
    : undefined;
  const rangeLabel = `${formatUtcTime(windowStartMs, true)} – ${formatUtcTime(windowEndMs, true)} UTC`;
  const pointsLabel =
    axis.length > 0
      ? ` · ${axis.length} point${axis.length === 1 ? '' : 's'}${bucket ? ` (${bucket} each)` : ''}`
      : '';
  lines.push(
    `  ${chalk.bold('Requests by Action')}  ${rangeLabel + pointsLabel}`
  );

  const hasAnyTraffic = opts.series.some(
    s => s.total > 0 || s.timeseries.some(p => p.value > 0)
  );

  if (opts.series.length === 0 || axis.length === 0 || !hasAnyTraffic) {
    lines.push(chalk.dim('  No request data for this period.'));
  } else {
    const header = ['Action', 'Trend', 'Total', 'Peak', 'Peak at'].map(h =>
      chalk.bold(chalk.cyan(h))
    );
    const rows: string[][] = [header];

    for (const s of opts.series) {
      const byTs = new Map(s.timeseries.map(p => [p.timestamp, p.value]));
      // Missing buckets mean no persistent actions fired in that hour, which is
      // a true zero for a count metric — not missing data.
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
      const color =
        s.total > 0 ? (ACTION_COLORS[s.action] ?? plain) : chalk.dim;
      // The action's colour belongs on the label alone. Tinting the bars too
      // turns the column into a rainbow, where hue competes with bar height for
      // the reader's attention; `vercel metrics` leaves its sparklines plain for
      // the same reason. Silent actions still dim as a whole row.
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
    for (const line of rendered.split('\n')) {
      lines.push(`  ${line}`.trimEnd());
    }
  }

  lines.push('');
  lines.push(`  ${chalk.bold('Rules')}  (top ${OVERVIEW_TOP_RULES})`);
  if (opts.rules.length === 0) {
    lines.push(chalk.dim('  No rule traffic for this period.'));
  } else {
    const header = ['Rule', 'Requests', 'Id'].map(h =>
      chalk.bold(chalk.cyan(h))
    );
    const rows: string[][] = [header];
    for (const r of opts.rules) {
      rows.push([
        ellipsizeMiddle(r.name, MAX_RULE_VALUE_WIDTH),
        formatCount(r.total),
        ellipsizeMiddle(r.id, MAX_RULE_VALUE_WIDTH),
      ]);
    }
    const rendered = table(rows, { align: ['l', 'r', 'l'], hsep: 3 });
    for (const line of rendered.split('\n')) {
      lines.push(`  ${line}`.trimEnd());
    }
  }

  if (opts.annotations.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Alerts in this window'));
    for (const a of opts.annotations.slice(0, 8)) {
      const when = formatUtcTime(a.startedAt, needsDate);
      const ago = `(${relativeTime(a.startedAt)})`;
      const count = a.count !== undefined ? ` · ${formatCount(a.count)}` : '';
      const detail = a.detail ? ` · ${colorizeDetail(a.detail)}` : '';
      lines.push(
        `  ${chalk.yellow('!')} ${when} UTC ${ago}  ${a.title}${detail}${count}`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}
