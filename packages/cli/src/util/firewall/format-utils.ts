import chalk from 'chalk';
import cmd from '../output/cmd';
import { ALIGNED_LABEL_WIDTH } from '../output/print-aligned-label';

export const ACTION_COLORS: Record<string, (s: string) => string> = {
  allow: chalk.blue,
  deny: chalk.red,
  challenge: chalk.yellow,
  log: chalk.magenta,
  rate_limit: chalk.green,
  'rate-limit': chalk.green,
  bypass: chalk.cyan,
};

/** Safe for an unquoted CLI token (ids, actions, ISO timestamps). */
export function cliToken(value: string): string {
  if (/^[A-Za-z0-9_.:/@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

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

/** Whether a window is long enough that bare HH:MM timestamps get ambiguous. */
export function windowNeedsDate(startMs: number, endMs: number): boolean {
  return endMs - startMs > 25 * 3_600_000;
}

/** Phrase label + command, aligned to the shared 16-character label column. */
export function formatHintLine(label: string, command: string): string {
  return `  ${chalk.dim(label.padEnd(ALIGNED_LABEL_WIDTH))}${cmd(command)}`;
}
