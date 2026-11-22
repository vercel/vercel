import chalk from 'chalk';
import table from '../output/table';
import { formatAlignedLabel } from '../output/print-aligned-label';
import { ellipsizeMiddle } from '../output/truncate';
import { generateSparkline } from '../../commands/metrics/text-output';
import {
  formatActionTrendTable,
  formatCount,
  formatUtcTime,
  granularityLabel,
  windowNeedsDate,
} from './format-utils';
import type { Granularity } from '../../commands/metrics/types';
import type { FirewallActionSeries } from './get-firewall-metrics';
import type {
  GroupedTimeseriesResult,
  TopListRow,
} from './get-firewall-traffic';

/**
 * Wide enough for an IPv6 address or a path, short of the user agents that
 * would otherwise wrap every row of a table.
 */
const MAX_VALUE_WIDTH = 60;

/**
 * Tighter, because a trend table spends another ~34 columns on the sparkline
 * and three numbers. At 60 a long path pushes the peak column off an
 * 80-column terminal.
 */
const MAX_TREND_LABEL_WIDTH = 40;

/** A row carrying no value for the dimension it is grouped by. */
const NOT_SET = '(not set)';

/**
 * Human labels for the dimensions an inspect header names. Only the fields
 * used as header detail need an entry; anything else falls back to the raw
 * dimension, which is at least the name the caller can filter on.
 */
const FIELD_LABELS: Record<string, string> = {
  asnId: 'AS Number',
  asnName: 'AS Name',
  clientIp: 'IP Address',
  clientIpCountry: 'Country',
  clientJa4Digest: 'JA4 Digest',
  clientUserAgent: 'User Agent',
  requestHostname: 'Hostname',
  requestPath: 'Request Path',
  wafAction: 'Action',
  wafRuleId: 'Rule',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** `Sep 6 10:00 – Sep 7 10:00 UTC · 96 points (15m each)`. */
function windowLabel(opts: {
  startMs: number;
  endMs: number;
  points: number;
  granularity: Granularity;
}): string {
  const range = `${formatUtcTime(opts.startMs, true)} – ${formatUtcTime(opts.endMs, true)} UTC`;
  if (opts.points === 0) return range;
  const unit = opts.points === 1 ? 'point' : 'points';
  return `${range} · ${opts.points} ${unit} (${granularityLabel(opts.granularity)} each)`;
}

/** Buckets any series covers, which is the axis the API answered with. */
function axisOf(series: FirewallActionSeries[]): string[] {
  const timestamps = new Set<string>();
  for (const s of series) {
    for (const point of s.timeseries) timestamps.add(point.timestamp);
  }
  return [...timestamps].sort();
}

function peakOf(
  values: number[],
  axis: string[]
): { peak: number; peakTs: string } {
  let peak = 0;
  let peakTs = '';
  for (let i = 0; i < axis.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakTs = axis[i];
    }
  }
  return { peak, peakTs };
}

function indent(rendered: string): string[] {
  return rendered.split('\n').map(line => `  ${line}`.trimEnd());
}

/** Nothing to show, said in terms of whichever narrowing produced it. */
function emptyLine(filtered: boolean): string {
  return chalk.dim(
    filtered
      ? '  No requests match the current filters.'
      : '  No requests in this period.'
  );
}

/**
 * Why one list has no rows, when the reason is not "no traffic".
 *
 * `filter` is the caller's filter naming something the list's own metric does
 * not report — Unknown Bot Traffic comes from request counts, which know
 * nothing of rules or actions. `plan` is that metric being gated where the
 * rest are not, which is possible for the same reason.
 * `rate-limit` is the observability API refusing the query for arriving too
 * soon after the last one, and `timeout` is it not answering in time — which
 * the high-cardinality dimensions, user agent and path, reach first on a busy
 * project. Every panel is its own query, so one that cannot answer is
 * degraded rather than fatal.
 */
export type TopListUnavailable =
  | 'error'
  | 'filter'
  | 'plan'
  | 'rate-limit'
  | 'timeout';

/**
 * A `Retry-After` as a reader would say it. These run from seconds to a full
 * day — an exhausted quota answers 86400 — and `86400s` is not a wait anyone
 * can judge at a glance.
 */
function retryLabel(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(seconds / 3_600);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * What an unavailable panel says for itself, in place of its rows.
 *
 * `retrySeconds` is only ever known for a rate limit, and only when the API
 * said so; without it the reader is told to retry without being told when.
 */
function unavailableLine(
  reason: TopListUnavailable,
  retrySeconds?: number
): string {
  switch (reason) {
    case 'filter':
      return 'Not reported alongside the filters in use.';
    case 'plan':
      return 'Needs Observability Plus.';
    case 'rate-limit':
      return retrySeconds
        ? `Rate limited by the Observability API. Retry in ${retryLabel(retrySeconds)}.`
        : 'Rate limited by the Observability API.';
    case 'timeout':
      // The narrower window is the actionable half: re-running the same query
      // over the same period is what just failed.
      return 'Timed out. Narrow the window with `--since` and try again.';
    default:
      return "Couldn't load this table.";
  }
}

export interface TrafficTopListRow {
  /**
   * The dimension's own value, as the metric reports it. This is what
   * `traffic inspect <dimension> <value>` filters on, so it stays the raw
   * value even where a friendlier one exists to show.
   */
  value: string;
  /** What to print instead of `value`, when the raw value is opaque. */
  label?: string;
  total: number;
}

export interface TrafficTopList {
  /** Dimension alias, so a JSON reader can tell the lists apart. */
  dimension: string;
  /** Section heading, e.g. "Top IPs". */
  title: string;
  rows: TrafficTopListRow[];
  unavailable?: TopListUnavailable;
  /** Seconds the API asked us to wait, when `unavailable` is `rate-limit`. */
  retrySeconds?: number;
  /**
   * What the API said for itself. Its rate-limit message names the budget and
   * who can raise it — "Request a higher usage limit from your Vercel account
   * team" — which is more than this side knows, so it is preferred over the
   * generic line when the whole report was refused.
   */
  message?: string;
}

/**
 * Rows carrying no value for the dimension drop out: they are the requests it
 * does not describe — traffic no rule matched, or that came from no bot — and
 * they routinely outweigh every real row put together. The dashboard excludes
 * them per widget, and the API does not honour the `ne ''` filters that were
 * meant to. A breakdown of one known entity keeps them, where the absence is
 * itself part of that entity's traffic.
 *
 * Because they outweigh the rest they take the first row, so a caller asking
 * the API for exactly N gets N-1 back from here. Ask for `topListFetchCount`
 * instead and cap the result yourself.
 */
export function toTopListRows(
  rows: TopListRow[],
  field: string,
  labelFields?: readonly string[]
): TrafficTopListRow[] {
  return rows
    .filter(row => row.values[field])
    .map(row => {
      const extras = (labelFields ?? [])
        .map(f => row.values[f])
        .filter((v): v is string => Boolean(v) && v !== row.values[field]);
      return {
        value: row.values[field],
        total: row.total,
        ...(extras.length > 0
          ? { label: `${row.values[field]} (${extras.join(', ')})` }
          : {}),
      };
    });
}

/**
 * How many rows to request when empty-dimension groups will be dropped
 * afterwards. A single-field group-by has one such group, so one spare
 * fills `top`. Extra fields (asnId beside asnName) split those empty
 * rows into many groups; one spare is then not enough.
 */
export function topListFetchCount(
  top: number,
  groupBy: readonly string[] = []
): number {
  const extraFields = Math.max(0, groupBy.length - 1);
  return top + 1 + extraFields * 16;
}

function formatTopList(list: TrafficTopList, filtered: boolean): string[] {
  const lines = [`  ${chalk.bold(list.title)}`];
  if (list.unavailable) {
    // The API's own account of a refusal, wherever it gave one — it names the
    // budget and who can raise it, which this side cannot.
    lines.push(
      chalk.dim(
        `  ${list.message ?? unavailableLine(list.unavailable, list.retrySeconds)}`
      )
    );
    return lines;
  }
  if (list.rows.length === 0) {
    lines.push(emptyLine(filtered));
    return lines;
  }
  lines.push(
    ...indent(
      table(
        list.rows.map(row => [
          ellipsizeMiddle(row.label ?? row.value, MAX_VALUE_WIDTH),
          formatCount(row.total),
        ]),
        { align: ['l', 'r'], hsep: 3 }
      )
    )
  );
  return lines;
}

/** One top-list panel, as `traffic list` prints it, for reuse on other pages. */
export function formatTrafficTopList(
  list: TrafficTopList,
  filtered = false
): string {
  return formatTopList(list, filtered).join('\n');
}

/**
 * One row per group of a grouped timeseries: trend, total, and the peak's
 * coordinates. The sibling of `formatActionTrendTable` for a breakdown by
 * something other than the firewall action, which has no colour of its own.
 */
export function formatGroupedTrendTable(opts: {
  labelHeader: string;
  field: string;
  result: GroupedTimeseriesResult;
}): string[] {
  const { axis } = opts.result;
  const needsDate = windowNeedsDate(
    new Date(opts.result.startTime).getTime(),
    new Date(opts.result.endTime).getTime()
  );
  const header = [opts.labelHeader, 'Trend', 'Total', 'Peak', 'Peak at'].map(
    h => chalk.bold(chalk.cyan(h))
  );
  const rows: string[][] = [header];

  for (const group of opts.result.groups) {
    const { peak, peakTs } = peakOf(group.series, axis);
    rows.push([
      ellipsizeMiddle(
        group.values[opts.field] || NOT_SET,
        MAX_TREND_LABEL_WIDTH
      ),
      generateSparkline(group.series),
      formatCount(group.total),
      peak > 0 ? formatCount(peak) : '--',
      peak > 0 ? formatUtcTime(new Date(peakTs).getTime(), needsDate) : '--',
    ]);
  }

  return indent(table(rows, { align: ['l', 'l', 'r', 'r', 'r'], hsep: 3 }));
}

/**
 * The traffic page as text: the window it covers, requests by action over it,
 * then a top list per dimension asked for. Ordered so the reader sees how much
 * was mitigated before who was responsible.
 */
export function formatTrafficList(opts: {
  series: FirewallActionSeries[];
  topLists: TrafficTopList[];
  startTime: string;
  endTime: string;
  granularity: Granularity;
  /** A filter or dimension narrowed the window; empty states say so. */
  filtered: boolean;
}): string {
  const startMs = new Date(opts.startTime).getTime();
  const endMs = new Date(opts.endTime).getTime();
  const axis = axisOf(opts.series);

  const lines: string[] = [
    `  ${chalk.bold('Firewall traffic')}  ${chalk.dim(
      windowLabel({
        startMs,
        endMs,
        points: axis.length,
        granularity: opts.granularity,
      })
    )}`,
    '',
    `  ${chalk.bold('Requests by Action')}`,
    formatActionTrendTable(opts.series),
  ];

  // One reason repeated down the page reads as several unrelated failures
  // when it is a single one — the whole report refused for the same cause.
  // Say it once, and name the panels it cost rather than heading each of them
  // over an apology.
  const shared = sharedUnavailable(opts.topLists);
  if (shared) {
    lines.push('');
    lines.push(
      `  ${chalk.dim(shared.message ?? unavailableLine(shared.reason, shared.retrySeconds))}`
    );
    lines.push(
      chalk.dim(
        `  No top lists: ${opts.topLists.map(l => l.title).join(', ')}.`
      )
    );
    lines.push('');
    return lines.join('\n');
  }

  for (const list of opts.topLists) {
    lines.push('');
    lines.push(...formatTopList(list, opts.filtered));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Whether the report lost every top list it asked for, whatever the reasons
 * and however many were asked for.
 *
 * Deliberately not `sharedUnavailable`: that one answers whether the failures
 * can be collapsed into a single line, which needs them to agree and to be
 * worth collapsing. Losing one panel out of one, or eight out of eight for
 * three different reasons, is still a report that did not arrive.
 */
export function allTopListsUnavailable(lists: TrafficTopList[]): boolean {
  return lists.length > 0 && lists.every(list => Boolean(list.unavailable));
}

/**
 * The one reason every top list is unavailable, when there is more than one
 * list and they all failed the same way. A single failed panel is that
 * panel's business and keeps its own heading, and reasons that disagree are
 * each worth reading.
 */
export function sharedUnavailable(lists: TrafficTopList[]):
  | {
      reason: TopListUnavailable;
      retrySeconds?: number;
      message?: string;
    }
  | undefined {
  if (lists.length < 2) return undefined;
  const first = lists[0].unavailable;
  if (!first) return undefined;
  if (!lists.every(l => l.unavailable === first)) return undefined;
  return {
    reason: first,
    // One refusal explained by the API stands for all of them: they are the
    // same refusal, and it is the same budget.
    message: lists.find(l => l.message)?.message,
    // The shortest wait any panel was given: the soonest the report as a
    // whole could be worth re-running.
    retrySeconds: lists
      .map(l => l.retrySeconds)
      .filter((s): s is number => typeof s === 'number')
      .sort((a, b) => a - b)[0],
  };
}

/**
 * One traffic entity: what it is, how much it sent, and what it asked for.
 *
 * `Requests by Action` answers whether the firewall is already handling it,
 * which is the first thing worth knowing about an IP or a JA4 digest; the
 * breakdown answers what to write a rule against.
 */
export function formatTrafficInspect(opts: {
  value: string;
  dimensionLabel: string;
  detail: Array<{ field: string; value: string }>;
  total: number;
  series: FirewallActionSeries[];
  startTime: string;
  endTime: string;
  granularity: Granularity;
  breakdown: GroupedTimeseriesResult;
  breakdownField: string;
  breakdownLabel: string;
  top: number;
  filtered: boolean;
}): string {
  const lines: string[] = [
    `  ${chalk.bold(opts.value)}  ${chalk.dim(opts.dimensionLabel)}`,
  ];

  for (const row of opts.detail) {
    if (!row.value) continue;
    lines.push(
      formatAlignedLabel(
        fieldLabel(row.field),
        ellipsizeMiddle(row.value, MAX_VALUE_WIDTH)
      )
    );
  }
  lines.push(formatAlignedLabel('Requests', formatCount(opts.total)));

  lines.push('');
  lines.push(
    `  ${chalk.bold('Requests by Action')}  ${chalk.dim(
      windowLabel({
        startMs: new Date(opts.startTime).getTime(),
        endMs: new Date(opts.endTime).getTime(),
        points: axisOf(opts.series).length,
        granularity: opts.granularity,
      })
    )}`
  );
  lines.push(formatActionTrendTable(opts.series));

  lines.push('');
  lines.push(
    `  ${chalk.bold(`Breakdown by ${opts.breakdownLabel}`)}  ${chalk.dim(`(top ${opts.top})`)}`
  );
  if (opts.breakdown.groups.length === 0) {
    lines.push(emptyLine(opts.filtered));
  } else {
    lines.push(
      ...formatGroupedTrendTable({
        labelHeader: opts.breakdownLabel,
        field: opts.breakdownField,
        result: opts.breakdown,
      })
    );
  }

  lines.push('');
  return lines.join('\n');
}
