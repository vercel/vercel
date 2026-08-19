import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { trafficDashboardSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import {
  TRAFFIC_DIMENSIONS,
  andFilters,
  eqFilter,
  getDimension,
} from '../../util/firewall/dimensions';
import {
  AlertNotFoundError,
  resolveAlertScope,
  resolveScopedTimeRange,
} from '../../util/firewall/alert-scope';
import {
  REQUEST_METRIC,
  getGroupedTimeseries,
  getTopList,
} from '../../util/firewall/get-firewall-traffic';
import type { TopListRow } from '../../util/firewall/get-firewall-traffic';
import {
  formatTrafficDashboardOutput,
  topListToWidgetRows,
} from '../../util/firewall/format-traffic';
import type { WidgetResult } from '../../util/firewall/format-traffic';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';

const DEFAULT_TOP = 5;

interface WidgetSpec {
  title: string;
  dimension: string;
  /** Override the queried metric (Verified Bots lives on request counts). */
  metric?: string;
  extraFilter?: string;
}

/** Widget order mirrors the dashboard's traffic page. */
const WIDGETS: WidgetSpec[] = [
  { title: 'Top IPs', dimension: 'ip' },
  { title: 'Top JA4 Digests', dimension: 'ja4' },
  { title: 'Top AS Names', dimension: 'asn' },
  { title: 'Top User Agents', dimension: 'user-agent' },
  { title: 'Top Request Paths', dimension: 'path' },
  { title: 'Rules', dimension: 'rule' },
  { title: 'Top Hosts', dimension: 'host' },
  {
    title: 'Verified Bots',
    dimension: 'bot',
    metric: REQUEST_METRIC,
    extraFilter: "bot_verified eq 'pass'",
  },
];

const WIDGET_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]();
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/** Collect `--ip 1.2.3.4`-style dimension flags into one OData filter. */
export function buildDimensionFilter(
  flags: Record<string, unknown>
): string | undefined {
  const parts: Array<string | undefined> = [];
  for (const dim of TRAFFIC_DIMENSIONS) {
    const value = flags[`--${dim.alias}`];
    if (typeof value === 'string' && value.length > 0) {
      parts.push(eqFilter(dim.field, value));
    }
  }
  const raw = flags['--filter'];
  if (Array.isArray(raw)) {
    for (const f of raw) {
      if (typeof f === 'string' && f.length > 0) parts.push(f);
    }
  }
  return andFilters(...parts);
}

export default async function trafficDashboard(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    trafficDashboardSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  if (org.type !== 'team') {
    const msg =
      'Firewall traffic requires a team scope. Run `vercel switch` to select a team.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [{ command: withGlobalFlags(client, 'switch') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
  const teamId = org.id;

  const failAlert = (err: AlertNotFoundError) => {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.NOT_FOUND,
        message: err.message,
        next: [{ command: withGlobalFlags(client, 'firewall alerts') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(err.message);
    return 1;
  };

  let alertScope: Awaited<ReturnType<typeof resolveAlertScope>> | undefined;
  const alertId = parsed.flags['--alert'] as string | undefined;
  if (alertId) {
    try {
      output.spinner(`Looking up alert ${chalk.bold(alertId)}`);
      alertScope = await resolveAlertScope(client, {
        alertId,
        projectId: project.id,
        teamId,
      });
    } catch (err) {
      if (err instanceof AlertNotFoundError) return failAlert(err);
      throw err;
    }
  }

  let startTime: Date;
  let endTime: Date;
  try {
    ({ startTime, endTime } = resolveScopedTimeRange({
      scope: alertScope,
      since: parsed.flags['--since'] as string | undefined,
      until: parsed.flags['--until'] as string | undefined,
    }));
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const top = (parsed.flags['--top'] as number) ?? DEFAULT_TOP;
  const filter = andFilters(
    alertScope?.filter,
    buildDimensionFilter(parsed.flags)
  );

  try {
    output.spinner(`Fetching firewall traffic for ${chalk.bold(project.name)}`);
    const actions = await getGroupedTimeseries(client, {
      ownerId: teamId,
      projectId: project.id,
      groupBy: ['waf_action'],
      filter: andFilters(filter, "waf_action ne ''"),
      startTime,
      endTime,
    });

    output.spinner(
      `Fetching top traffic entities for ${chalk.bold(project.name)}`
    );
    const widgets = await runWithConcurrency<WidgetResult>(
      WIDGETS.map(spec => async () => {
        const dim = getDimension(spec.dimension);
        if (!dim) {
          return { ...spec, rows: [], error: 'unknown dimension' };
        }
        try {
          const rows: TopListRow[] = await getTopList(client, {
            ownerId: teamId,
            projectId: project.id,
            metric: spec.metric,
            groupBy: [dim.field],
            filter: andFilters(filter, dim.excludeFilter, spec.extraFilter),
            startTime,
            endTime,
            top,
          });
          return {
            title: spec.title,
            dimension: spec.dimension,
            rows: topListToWidgetRows(rows, dim.field),
          };
        } catch (e: unknown) {
          return {
            title: spec.title,
            dimension: spec.dimension,
            rows: [],
            error: e instanceof Error ? e.message : 'query failed',
          };
        }
      }),
      WIDGET_CONCURRENCY
    );

    if (parsed.flags['--json']) {
      outputJson(client, {
        period: {
          start: actions.startTime,
          end: actions.endTime,
          granularity: actions.granularity,
        },
        filter: filter ?? null,
        ...(alertScope
          ? {
              alertId: alertScope.alert.id,
              window: {
                start: alertScope.startTime.toISOString(),
                end: alertScope.endTime.toISOString(),
              },
            }
          : {}),
        actions: {
          axis: actions.axis,
          groups: actions.groups.map(g => ({
            action: g.values.waf_action ?? g.key,
            total: g.total,
            series: g.series,
          })),
        },
        widgets: widgets.map(w => ({
          title: w.title,
          dimension: w.dimension,
          rows: w.rows.map(r => ({ value: r.label, total: r.total })),
          ...(w.error ? { error: w.error } : {}),
        })),
      });
      return 0;
    }

    output.print(formatTrafficDashboardOutput({ actions, widgets, filter }));
    return 0;
  } catch (e: unknown) {
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall traffic';
    if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
      msg =
        'You do not have permission to query firewall traffic for this project. Check team access and try again.';
    }
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          { command: withGlobalFlags(client, 'firewall traffic-dashboard') },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  } finally {
    output.stopSpinner();
  }
}
