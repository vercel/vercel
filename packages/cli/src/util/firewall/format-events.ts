import chalk from 'chalk';
import table from '../output/table';
import cmd from '../output/cmd';
import { packageName } from '../pkg-name';
import { ACTION_COLORS, formatCount, windowNeedsDate } from './format-utils';
import { actionSeriesRows, formatSeriesTable } from './format-traffic';
import type {
  GroupedTimeseriesResult,
  TopListRow,
} from './get-firewall-traffic';
import type { FirewallActionRow } from './types';

export const DEFAULT_EVENTS_LIMIT = 10;
export const DEFAULT_EVENTS_SINCE = '1h';

const REDACTED = '***';
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

export type EventTypeFilter = 'system' | 'customer';
export type EventActionFilter = 'challenge' | 'deny';

export interface EventListFilters {
  type?: EventTypeFilter;
  action?: EventActionFilter;
  ip?: string;
  host?: string;
  search?: string;
}

export interface EventViewHint {
  detail: string;
  traffic?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function cliToken(value: string): string {
  if (/^[A-Za-z0-9_.:/@-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function defaultSuggest(template: string): string {
  return `${packageName} ${template}`;
}

export function isUsableField(value: string | undefined): boolean {
  return Boolean(value) && value !== REDACTED;
}

export function isRedactedEvent(row: FirewallActionRow): boolean {
  return (
    row.public_ip === REDACTED ||
    row.host === REDACTED ||
    row.action === REDACTED ||
    row.action_type === REDACTED
  );
}

export function formatEventType(actionType: string): string {
  if (actionType === REDACTED) return REDACTED;
  return actionType === 'system-action' ? 'System Rule' : 'Customer Rule';
}

export function parseEventTime(value: string): Date | undefined {
  if (!value) return undefined;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatLocalEventTime(value: string): string {
  const d = parseEventTime(value);
  if (!d) return value || '--';
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function toIsoHint(value: string): string | undefined {
  const d = parseEventTime(value);
  return d ? d.toISOString() : undefined;
}

export function periodLabel(since?: string): string {
  const value = since ?? DEFAULT_EVENTS_SINCE;
  if (/^\d+[smhdw]$/i.test(value)) return `past ${value}`;
  return value;
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function matchesEventFilters(
  row: FirewallActionRow,
  filters: EventListFilters
): boolean {
  if (filters.type === 'system' && row.action_type !== 'system-action') {
    return false;
  }
  if (
    filters.type === 'customer' &&
    (row.action_type === 'system-action' || row.action_type === REDACTED)
  ) {
    return false;
  }
  if (filters.action) {
    const action = row.action === 'block' ? 'deny' : row.action;
    if (action.toLowerCase() !== filters.action) return false;
  }
  if (filters.ip && !includesInsensitive(row.public_ip, filters.ip)) {
    return false;
  }
  if (filters.host && !includesInsensitive(row.host, filters.host)) {
    return false;
  }
  if (filters.search) {
    const q = filters.search;
    const hit =
      includesInsensitive(row.public_ip, q) ||
      includesInsensitive(row.host, q) ||
      includesInsensitive(row.action, q);
    if (!hit) return false;
  }
  return true;
}

export function hasEventFilters(filters: EventListFilters): boolean {
  return Boolean(
    filters.type ||
      filters.action ||
      filters.ip ||
      filters.host ||
      filters.search
  );
}

export function firstUsableEvent(
  rows: FirewallActionRow[]
): FirewallActionRow | undefined {
  return rows.find(row => isUsableField(row.public_ip));
}

export function getEventHints(
  row: FirewallActionRow,
  suggest: (template: string) => string = defaultSuggest
): EventViewHint | undefined {
  if (!isUsableField(row.public_ip)) return undefined;

  const ip = cliToken(row.public_ip);
  const scoped: string[] = [];
  if (isUsableField(row.host)) scoped.push(`--host ${cliToken(row.host)}`);
  if (isUsableField(row.action)) {
    const action = row.action === 'block' ? 'deny' : row.action;
    scoped.push(`--action ${cliToken(action)}`);
  }
  const since = toIsoHint(row.startTime);
  const until = toIsoHint(row.endTime);
  if (since) scoped.push(`--since ${since}`);
  if (until) scoped.push(`--until ${until}`);

  const detailSuffix = scoped.length > 0 ? ` ${scoped.join(' ')}` : '';
  return {
    detail: suggest(`firewall event-detail ${ip}${detailSuffix}`),
    traffic: suggest(`firewall traffic-dashboard --ip ${ip}${detailSuffix}`),
  };
}

function formatViewHintLines(section: EventViewHint): string[] {
  const label = (s: string) => chalk.dim(s.padEnd(8));
  const lines = ['', `  ${label('Detail')}${cmd(section.detail)}`];
  if (section.traffic) {
    lines.push(`  ${label('Traffic')}${cmd(section.traffic)}`);
  }
  return lines;
}

function colorAction(action: string): string {
  if (action === REDACTED) return chalk.dim(action);
  const color = ACTION_COLORS[action] ?? ((s: string) => s);
  return color(action);
}

export function formatEventsOutput(opts: {
  actions: FirewallActionRow[];
  total: number;
  since?: string;
  filtered: boolean;
  limit: number;
  suggest?: (template: string) => string;
}): string {
  const lines: string[] = [];
  lines.push(
    `  ${chalk.bold('Firewall events')}  ${chalk.dim(`(${periodLabel(opts.since)})`)}`
  );

  if (opts.actions.length === 0) {
    lines.push('');
    lines.push(
      opts.filtered
        ? '  No firewall events match the current filters.'
        : '  No firewall events found.'
    );
    return `${lines.join('\n')}\n`;
  }

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

  for (const row of opts.actions) {
    rows.push([
      formatEventType(row.action_type),
      colorAction(row.action),
      row.host || '--',
      row.public_ip || '--',
      formatLocalEventTime(row.startTime),
      formatLocalEventTime(row.endTime),
      formatCount(row.count),
    ]);
  }

  lines.push('');
  const rendered = table(rows, {
    align: ['l', 'l', 'l', 'l', 'l', 'l', 'r'],
    hsep: 3,
  });
  for (const line of rendered.split('\n')) {
    lines.push(`  ${line}`);
  }

  if (opts.actions.some(isRedactedEvent)) {
    lines.push('');
    lines.push(
      chalk.dim('  Some older events are redacted on the Hobby plan.')
    );
  }

  if (opts.total > opts.limit) {
    lines.push('');
    lines.push(
      `  Showing ${opts.actions.length} of ${opts.total}. Re-run with --limit ${opts.total} to see all.`
    );
  }

  const hintRow = firstUsableEvent(opts.actions);
  if (hintRow) {
    const hints = getEventHints(hintRow, opts.suggest ?? defaultSuggest);
    if (hints) {
      lines.push(...formatViewHintLines(hints));
    }
  }

  return `${lines.join('\n')}\n`;
}

function metaRow(label: string, value: string): string {
  return `  ${chalk.bold(label.padEnd(16))}${value}`;
}

export function formatEventDetailOutput(opts: {
  event: FirewallActionRow;
  matchCount: number;
  timeseries: GroupedTimeseriesResult | null;
  topPaths: TopListRow[];
}): string {
  const { event } = opts;
  const action = event.action === 'block' ? 'deny' : event.action;
  const color = ACTION_COLORS[action] ?? ((s: string) => s);
  const lines: string[] = [''];
  lines.push(`  ${chalk.bold('Event Details')}`);
  lines.push('');
  lines.push(metaRow('Start Time', formatLocalEventTime(event.startTime)));
  lines.push(metaRow('End Time', formatLocalEventTime(event.endTime)));
  lines.push(metaRow('Action', color(action)));
  lines.push(metaRow('Action Type', formatEventType(event.action_type)));
  lines.push(metaRow('Hostname', event.host || '--'));
  lines.push(metaRow('IP Address', event.public_ip || '--'));
  lines.push(metaRow('Requests', formatCount(event.count)));

  if (opts.matchCount > 1) {
    lines.push('');
    lines.push(
      chalk.dim(
        `  Showing the most recent of ${opts.matchCount} matching events. Pass --host, --action, --since, and --until to pick one.`
      )
    );
  }

  if (opts.timeseries) {
    const startMs = new Date(opts.timeseries.startTime).getTime();
    const endMs = new Date(opts.timeseries.endTime).getTime();
    const needsDate = windowNeedsDate(startMs, endMs);
    lines.push('');
    lines.push(chalk.bold('  Requests by Action'));
    if (opts.timeseries.groups.length === 0) {
      lines.push(chalk.dim('  No request data for this period.'));
    } else {
      lines.push(
        ...formatSeriesTable({
          labelHeader: 'Action',
          rows: actionSeriesRows(opts.timeseries.groups),
          axis: opts.timeseries.axis,
          needsDate,
        })
      );
    }
  }

  lines.push('');
  lines.push(chalk.bold('  Top Request Paths'));
  if (opts.topPaths.length === 0) {
    lines.push(chalk.dim('  No path data for this event.'));
  } else {
    const rendered = table(
      opts.topPaths.map(row => [
        row.values.request_path || '(not set)',
        formatCount(row.total),
      ]),
      { align: ['l', 'r'], hsep: 3 }
    );
    for (const line of rendered.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
