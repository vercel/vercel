import chalk from 'chalk';
import table from '../output/table';
import { generateSparkline } from '../../commands/metrics/text-output';
import type { Granularity } from '../../commands/metrics/types';
import type { FirewallActionSeries } from './get-firewall-metrics';

/**
 * Mirrors the dashboard's semantic action colours (`ACTION_COLORS` in
 * vercel-site's firewall components) so the same action reads the same way in
 * both surfaces: allow blue, deny red, challenge amber, log purple, rate limit
 * teal. The 16-colour terminal palette has no amber or teal, so yellow and cyan
 * stand in. `bypass` has no dashboard equivalent and takes the green left over
 * once cyan is spoken for.
 */
export const ACTION_COLORS: Record<string, (s: string) => string> = {
  allow: chalk.blue,
  deny: chalk.red,
  challenge: chalk.yellow,
  log: chalk.magenta,
  rate_limit: chalk.cyan,
  'rate-limit': chalk.cyan,
  bypass: chalk.green,
};

/**
 * Title-case every word, not just the first: a challenge reports its outcome
 * as `challenge-failed` and `challenge-solved`, which capitalising once left
 * reading as one hyphenated word.
 */
export function labelForAction(action: string): string {
  if (action === 'rate_limit' || action === 'rate-limit') {
    return 'Rate Limited';
  }
  return action
    .split(/[-_]/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `HH:MM` when the surrounding window makes the day unambiguous (≤ ~1 day),
 * otherwise `Mon D HH:MM`. All chart/alert timestamps share this format so a
 * reader can correlate them by literal string match.
 */
export function formatUtcTime(ms: number, withDate: boolean): string {
  const d = new Date(ms);
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return withDate ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hm}` : hm;
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * `Mon D HH:MM UTC (relative)` for inspect rows, where the day has to travel
 * with the clock so a resolved window and "10h ago" can be read together.
 */
export function formatUtcDateTime(ms: number): string {
  return `${formatUtcTime(ms, true)} UTC (${relativeTime(ms)})`;
}

/**
 * Colour any segment that names an action so list/overview/inspect read the
 * same way. Rule ids and anomaly types have no entry and stay plain. Done at
 * render time so `--json` keeps the raw string.
 */
export function colorizeDetail(detail: string): string {
  return detail
    .split(' · ')
    .map(part => {
      const color = ACTION_COLORS[part.toLowerCase().replace(/ /g, '_')];
      return color ? color(part) : part;
    })
    .join(' · ');
}

/** Whether a window is long enough that bare HH:MM timestamps get ambiguous. */
export function windowNeedsDate(startMs: number, endMs: number): boolean {
  return endMs - startMs > 25 * 3_600_000;
}

/**
 * `15m`, `1h`, `2d` — the bucket width, from whichever unit the granularity
 * carries. A caller that assumes hours reads a minutes granularity as
 * `undefined` and silently labels 15-minute buckets as hourly.
 */
export function granularityLabel(granularity: Granularity): string {
  if ('minutes' in granularity) return `${granularity.minutes}m`;
  if ('hours' in granularity) return `${granularity.hours}h`;
  return `${granularity.days}d`;
}

/**
 * Requests-by-Action as a chart stand-in: one row per action with a trend
 * sparkline, total, and the peak's coordinates, so a reader can correlate a
 * spike with an alert by matching the timestamp string.
 *
 * Shared by `persistent-actions inspect` and the `traffic` commands so the
 * same table cannot drift between them. The axis is the union of every
 * series' timestamps; a bucket a series is missing is a true zero for a count
 * metric, not missing data.
 */
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
    .map(line => `  ${line}`.trimEnd())
    .join('\n');
}
