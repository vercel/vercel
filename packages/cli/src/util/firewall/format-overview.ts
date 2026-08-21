import chalk from 'chalk';
import table from '../output/table';
import { ellipsizeMiddle } from '../output/truncate';
import { generateSparkline } from '../../commands/metrics/text-output';
import { packageName } from '../pkg-name';
import {
  ACTION_COLORS,
  cliToken,
  formatCount,
  formatHintLine,
  formatUtcTime,
  labelForAction,
  relativeTime,
  windowNeedsDate,
} from './format-utils';
import type { FirewallActionSeries } from './get-firewall-metrics';
import type { FirewallAlertRow } from './get-firewall-alerts';
import { SYS_DOS_MITIGATION_RULE_ID } from './alert-scope';

export const OVERVIEW_TOP_RULES = 8;
const MAX_RULE_VALUE_WIDTH = 40;

export interface OverviewRuleRow {
  id: string;
  name: string;
  total: number;
}

export type OverviewView = 'detail' | 'traffic';

export interface OverviewViewHint {
  view: OverviewView;
  command: string;
}

export interface OverviewSectionHints {
  action?: { detail: string; traffic: string };
  rule?: { detail: string; traffic: string };
  alert?: { detail: string; traffic?: string };
}

const ENFORCED_ACTIONS = new Set([
  'deny',
  'challenge',
  'rate_limit',
  'rate-limit',
  'redirect',
  'challenge-failed',
]);

function defaultSuggest(template: string): string {
  return `${packageName} ${template}`;
}

/**
 * Highest-signal action for next-step hints: prefer enforced actions
 * (deny/challenge/rate-limit) by volume, otherwise the largest non-allow.
 */
export function pickOverviewAction(
  series: FirewallActionSeries[]
): string | undefined {
  const withTraffic = series.filter(
    s => s.total > 0 && s.action && s.action !== 'allow'
  );
  const enforced = withTraffic.filter(s => ENFORCED_ACTIONS.has(s.action));
  const pool = enforced.length > 0 ? enforced : withTraffic;
  if (pool.length === 0) return undefined;
  return pool.reduce((best, row) => (row.total > best.total ? row : best))
    .action;
}

function trafficFlagsFromAlert(alert: FirewallAlertRow): string | undefined {
  if (alert.id) {
    return `--alert ${cliToken(alert.id)}`;
  }
  const flags: string[] = [];
  const ruleId =
    alert.ruleId ||
    (alert.type === 'firewall_anomaly'
      ? SYS_DOS_MITIGATION_RULE_ID
      : undefined);
  if (ruleId) flags.push(`--rule ${cliToken(ruleId)}`);
  if (alert.action) flags.push(`--action ${cliToken(alert.action)}`);
  return flags.length > 0 ? flags.join(' ') : undefined;
}

export function getOverviewSectionHints(opts: {
  series: FirewallActionSeries[];
  rules: OverviewRuleRow[];
  annotations: FirewallAlertRow[];
  suggest?: (template: string) => string;
}): OverviewSectionHints {
  const suggest = opts.suggest ?? defaultSuggest;
  const hints: OverviewSectionHints = {};

  const action = pickOverviewAction(opts.series);
  if (action) {
    const value = cliToken(action);
    hints.action = {
      detail: suggest(`firewall traffic inspect action ${value}`),
      traffic: suggest(`firewall traffic --action ${value}`),
    };
  }

  const rule = opts.rules.find(r => r.id);
  if (rule) {
    const value = cliToken(rule.id);
    hints.rule = {
      detail: suggest(`firewall traffic inspect rule ${value}`),
      traffic: suggest(`firewall traffic --rule ${value}`),
    };
  }

  const alert = opts.annotations[0];
  if (alert) {
    hints.alert = {
      detail: suggest(`firewall alerts inspect ${cliToken(alert.id)}`),
    };
    const trafficFlags = trafficFlagsFromAlert(alert);
    if (trafficFlags) {
      hints.alert.traffic = suggest(`firewall traffic ${trafficFlags}`);
    }
  }

  return hints;
}

export function flattenOverviewHints(
  sections: OverviewSectionHints
): OverviewViewHint[] {
  const section = sections.alert ?? sections.action ?? sections.rule;
  if (!section) return [];
  const next: OverviewViewHint[] = [
    { view: 'detail', command: section.detail },
  ];
  if (section.traffic) {
    next.push({ view: 'traffic', command: section.traffic });
  }
  return next;
}

function formatViewHintLines(section: {
  detail: string;
  traffic?: string;
}): string[] {
  const lines = [formatHintLine('Inspect', section.detail)];
  if (section.traffic) {
    lines.push(formatHintLine('Inspect traffic', section.traffic));
  }
  return lines;
}

/**
 * Chart stand-in modeled on the dashboard overview: attacks mitigated, a
 * Requests-by-Action timeseries, traffic by rule, then alerts carrying the
 * same timestamp format so peaks and alerts correlate by literal string match.
 */
export function formatOverviewOutput(opts: {
  series: FirewallActionSeries[];
  attacksMitigated: number;
  annotations: FirewallAlertRow[];
  rules: OverviewRuleRow[];
  startTime: string;
  endTime: string;
  granularity?: { hours: number };
  suggest?: (template: string) => string;
}): string {
  const lines: string[] = [];

  const windowStartMs = new Date(opts.startTime).getTime();
  const windowEndMs = new Date(opts.endTime).getTime();
  const needsDate = windowNeedsDate(windowStartMs, windowEndMs);
  const hints = getOverviewSectionHints(opts);

  lines.push(
    `  ${chalk.bold('Attacks mitigated')} ${chalk.dim('(this window)')}  ${formatCount(opts.attacksMitigated)}`
  );
  lines.push('');

  // Shared hourly axis across all series so trends align bucket-for-bucket.
  const allTs = new Set<string>();
  for (const s of opts.series) {
    for (const p of s.timeseries) allTs.add(p.timestamp);
  }
  const axis = [...allTs].sort();

  const granularityHours = opts.granularity?.hours ?? 1;
  const rangeLabel = `${formatUtcTime(windowStartMs, true)} – ${formatUtcTime(windowEndMs, true)} UTC`;
  const pointsLabel =
    axis.length > 0
      ? ` · ${axis.length} point${axis.length === 1 ? '' : 's'} (${granularityHours}h each)`
      : '';
  lines.push(
    `  ${chalk.bold('Requests by Action')}  ${chalk.dim(rangeLabel + pointsLabel)}`
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

      const color =
        s.total > 0
          ? (ACTION_COLORS[s.action] ?? ((x: string) => x))
          : chalk.dim;
      rows.push([
        labelForAction(s.action),
        color(generateSparkline(values)),
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
      lines.push(`  ${line}`);
    }
  }

  lines.push('');
  lines.push(
    `  ${chalk.bold('Rules')}  ${chalk.dim(`(top ${OVERVIEW_TOP_RULES})`)}`
  );
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
        chalk.dim(ellipsizeMiddle(r.id, MAX_RULE_VALUE_WIDTH)),
      ]);
    }
    const rendered = table(rows, { align: ['l', 'r', 'l'], hsep: 3 });
    for (const line of rendered.split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  if (opts.annotations.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Alerts in this window'));
    for (const a of opts.annotations.slice(0, 8)) {
      const when = formatUtcTime(a.startedAt, needsDate);
      const ago = chalk.dim(`(${relativeTime(a.startedAt)})`);
      const count = a.count !== undefined ? ` · ${formatCount(a.count)}` : '';
      const detail = a.detail ? chalk.dim(` · ${a.detail}`) : '';
      lines.push(
        `  ${chalk.yellow('!')} ${when} UTC ${ago}  ${a.title}${detail}${count}`
      );
    }
  }

  const nextSection = hints.alert ?? hints.action ?? hints.rule;
  if (nextSection) {
    lines.push('');
    lines.push(...formatViewHintLines(nextSection));
  }

  lines.push('');
  return lines.join('\n');
}

export function formatAlertsOutput(opts: {
  active: FirewallAlertRow[];
  resolved: FirewallAlertRow[];
}): string {
  const lines: string[] = [];

  lines.push(chalk.bold('  Active alerts'));
  if (opts.active.length === 0) {
    lines.push(chalk.dim('  No active alerts.'));
  } else {
    for (const a of opts.active) {
      const count = a.count !== undefined ? formatCount(a.count) : '—';
      const detail = a.detail ? chalk.dim(` · ${a.detail}`) : '';
      lines.push(
        `  ${chalk.yellow('!')} ${a.title}${detail}  ${count}  ${chalk.dim(`Started ${relativeTime(a.startedAt)}`)}`
      );
      lines.push(chalk.dim(`    id: ${a.id}`));
    }
  }

  lines.push('');
  lines.push(chalk.bold('  Resolved alerts'));
  if (opts.resolved.length === 0) {
    lines.push(chalk.dim('  No recently resolved alerts.'));
  } else {
    for (const a of opts.resolved.slice(0, 20)) {
      const count = a.count !== undefined ? formatCount(a.count) : '—';
      const detail = a.detail ? chalk.dim(` · ${a.detail}`) : '';
      const when = a.resolvedAt
        ? relativeTime(a.resolvedAt)
        : relativeTime(a.startedAt);
      lines.push(`  ${a.title}${detail}  ${count}  ${chalk.dim(when)}`);
      lines.push(chalk.dim(`    id: ${a.id}`));
    }
  }

  if (opts.active.length > 0 || opts.resolved.length > 0) {
    lines.push('');
    lines.push(
      chalk.dim(
        '  Inspect an alert with `vercel firewall alerts inspect <id>`.'
      )
    );
  }

  lines.push('');
  return lines.join('\n');
}
