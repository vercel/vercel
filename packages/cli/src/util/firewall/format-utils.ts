import chalk from 'chalk';
import type { Granularity } from '../../commands/metrics/types';

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

export function labelForAction(action: string): string {
  if (action === 'rate_limit' || action === 'rate-limit') {
    return 'Rate Limited';
  }
  return action.charAt(0).toUpperCase() + action.slice(1);
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
