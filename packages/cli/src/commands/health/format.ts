import chalk from 'chalk';
import ms from 'ms';
import stripAnsi from 'strip-ansi';
import output from '../../output-manager';
import { ALIGNED_LABEL_WIDTH } from '../../util/output/print-aligned-label';
import {
  RECENT_DAYS,
  type StatusComponentRef,
  type StatusIncident,
  type StatusMaintenance,
  type StatusReport,
} from './statuspage';

/** A list inside a detail view shows at most this many items. */
const MAX_LIST_ITEMS = 5;

// Remote text is data: drop control characters (newlines and tabs included,
// since every field renders on one line) and bidirectional and zero-width
// format characters.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/g;
const FORMAT_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

type Tone = 'success' | 'pending' | 'error' | 'muted';

/** Status page values by tone. Unknown values render muted. */
const INDICATOR_TONES: Record<string, Tone> = {
  none: 'success',
  minor: 'pending',
  major: 'error',
  critical: 'error',
};
const COMPONENT_TONES: Record<string, Tone> = {
  operational: 'success',
  degraded_performance: 'pending',
  partial_outage: 'pending',
  major_outage: 'error',
};
const IMPACT_TONES: Record<string, Tone> = {
  minor: 'pending',
  major: 'error',
  critical: 'error',
};
const PROGRESS_TONES: Record<string, Tone> = {
  // Incidents
  investigating: 'error',
  identified: 'error',
  monitoring: 'pending',
  resolved: 'success',
  postmortem: 'success',
  // Scheduled maintenance
  in_progress: 'pending',
  verifying: 'pending',
  completed: 'success',
};

/** A colored dot and a plain label, like deployment states. */
function formatState(
  value: string,
  tones: Record<string, Tone>,
  label = humanizeEnum(value)
): string {
  return output.formatStatus(label, tones[value] ?? 'muted');
}

/** Makes status page text safe to print on one terminal line. */
export function toSafeLine(value: string): string {
  return stripAnsi(value)
    .replace(/\s+/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(FORMAT_CHARACTERS, '')
    .trim();
}

/** `partial_outage` → `Partial outage`. Unknown values render as given. */
export function humanizeEnum(value: string): string {
  const words = toSafeLine(value).replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatAge(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return '';
  if (Math.abs(elapsed) < 60_000) return 'just now';
  // Scheduled maintenance can start in the future.
  return elapsed < 0 ? `in ${ms(-elapsed)}` : `${ms(elapsed)} ago`;
}

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** `Oct 12, 2026, 13:35 UTC (3h ago)` */
export function formatTime(iso: string, now: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return toSafeLine(iso);
  const age = formatAge(iso, now);
  return `${dateTimeFormat.format(date)} UTC${age ? ` ${chalk.dim(`(${age})`)}` : ''}`;
}

/** `6h 36m`, `42m`, `2d 3h` */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.round(
    (Date.parse(toIso) - Date.parse(fromIso)) / 60_000
  );
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  if (minutes < 1) return 'under 1m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

function componentName(component: StatusComponentRef): string {
  const name = toSafeLine(component.name);
  return component.group ? `${toSafeLine(component.group)} / ${name}` : name;
}

/**
 * An aligned row with a dim label and a plain value, so the headline and
 * section headings stay the only bold text. Same columns as
 * `printAlignedLabel()`.
 */
function row(label: string, value: string): string {
  return `  ${chalk.dim(label.padEnd(ALIGNED_LABEL_WIDTH))}${value}`;
}

function heading(text: string): string {
  return `  ${chalk.bold(text)}`;
}

/** Secondary prose, such as an empty state. */
function muted(text: string): string {
  return `  ${chalk.dim(text)}`;
}

function componentsRows(components: StatusComponentRef[]): string[] {
  if (components.length === 0) return [];
  const names = components.slice(0, MAX_LIST_ITEMS).map(componentName);
  const more = components.length - MAX_LIST_ITEMS;
  const list =
    more > 0 ? `${names.join(', ')}, and ${more} more` : names.join(', ');
  return [row('Components', list)];
}

function urlRow(url: string): string {
  return row('URL', chalk.cyan(url));
}

function formatIncident(incident: StatusIncident, now: number): string[] {
  const { resolvedAt } = incident;
  const latest = resolvedAt ? undefined : incident.updates[0];
  const duration = resolvedAt && formatDuration(incident.startedAt, resolvedAt);
  return [
    `  ${toSafeLine(incident.name)}`,
    row('Impact', formatState(incident.impact, IMPACT_TONES)),
    ...(resolvedAt
      ? []
      : [row('Status', formatState(incident.status, PROGRESS_TONES))]),
    row('Started', formatTime(incident.startedAt, now)),
    ...(resolvedAt
      ? [
          row(
            'Resolved',
            `${formatTime(resolvedAt, now)}${duration ? `, after ${duration}` : ''}`
          ),
        ]
      : []),
    ...componentsRows(incident.components),
    ...(latest
      ? [
          row('Latest Update', formatTime(latest.createdAt, now)),
          `  ${' '.repeat(ALIGNED_LABEL_WIDTH)}${toSafeLine(latest.body)}`,
        ]
      : []),
    urlRow(incident.url),
  ];
}

function formatMaintenance(m: StatusMaintenance, now: number): string[] {
  return [
    `  ${toSafeLine(m.name)}`,
    row('Status', formatState(m.status, PROGRESS_TONES)),
    ...(m.scheduledFor ? [row('Starts', formatTime(m.scheduledFor, now))] : []),
    ...(m.scheduledUntil
      ? [row('Ends', formatTime(m.scheduledUntil, now))]
      : []),
    ...componentsRows(m.components),
    urlRow(m.url),
  ];
}

/** A heading and a blank line, then blocks separated by blank lines. */
function section(title: string, blocks: string[][]): string[] {
  return [heading(title), ...blocks.flatMap(b => ['', ...b])];
}

export function formatStatusReport(report: StatusReport, now: number): string {
  const sections: string[][] = [
    [
      `  ${formatState(
        report.status.indicator,
        INDICATOR_TONES,
        chalk.bold(toSafeLine(report.status.description))
      )}`,
      row('Updated', formatTime(report.page.updatedAt, now)),
      row('Status Page', chalk.cyan(toSafeLine(report.page.url))),
    ],
  ];

  const degraded = report.components.filter(c => c.status !== 'operational');
  if (degraded.length > 0) {
    const width = Math.max(...degraded.map(c => componentName(c).length));
    sections.push(
      section('Degraded components', [
        degraded.map(
          c =>
            `  ${componentName(c).padEnd(width)}  ${formatState(c.status, COMPONENT_TONES)}`
        ),
      ])
    );
  }

  const active = report.incidents.filter(i => !i.resolvedAt);
  sections.push(
    active.length > 0
      ? section(
          'Active incidents',
          active.map(i => formatIncident(i, now))
        )
      : [muted('No active incidents.')]
  );

  if (report.scheduledMaintenances.length > 0) {
    sections.push(
      section(
        'Scheduled maintenance',
        report.scheduledMaintenances.map(m => formatMaintenance(m, now))
      )
    );
  }

  const resolved = report.incidents.filter(i => i.resolvedAt);
  sections.push(
    resolved.length > 0
      ? section(
          `Resolved in the last ${RECENT_DAYS} days`,
          resolved.map(i => formatIncident(i, now))
        )
      : [muted(`No incidents resolved in the last ${RECENT_DAYS} days.`)]
  );

  return `${sections.map(lines => lines.join('\n')).join('\n\n')}\n`;
}
