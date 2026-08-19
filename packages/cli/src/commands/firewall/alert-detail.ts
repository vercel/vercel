import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { alertDetailSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import cmd from '../../util/output/cmd';
import { cliToken } from '../../util/firewall/format-utils';
import { andFilters, eqFilter } from '../../util/firewall/dimensions';
import {
  AlertNotFoundError,
  actionFilter,
  resolveAlertScope,
} from '../../util/firewall/alert-scope';
import {
  getGroupedTimeseries,
  getTopList,
  granularityMs,
  type TopListRow,
} from '../../util/firewall/get-firewall-traffic';
import { getFirewallEvents } from '../../util/firewall/get-firewall-events';
import {
  isUsableField,
  matchesEventFilters,
  type EventActionFilter,
} from '../../util/firewall/format-events';
import { formatAlertDetailOutput } from '../../util/firewall/format-traffic';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import type { FirewallActionRow } from '../../util/firewall/types';

export { actionFilter };

const BASELINE_MS = 24 * 3_600_000;
const TOP_ENTITIES = 5;

function avgPerMinute(values: number[], bucketMs: number): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  const minutes = (values.length * bucketMs) / 60_000;
  return minutes > 0 ? total / minutes : null;
}

function topIpsFromEvents(
  actions: FirewallActionRow[],
  top: number,
  action?: string
): TopListRow[] {
  const actionFilterValue: EventActionFilter | undefined =
    action === 'challenge' || action === 'deny' ? action : undefined;
  const totals = new Map<string, number>();
  for (const row of actions) {
    if (!isUsableField(row.public_ip) || row.public_ip === '127.0.0.1') {
      continue;
    }
    if (
      actionFilterValue &&
      !matchesEventFilters(row, { action: actionFilterValue })
    ) {
      continue;
    }
    totals.set(
      row.public_ip,
      (totals.get(row.public_ip) ?? 0) + (row.count || 0)
    );
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([ip, total]) => ({ values: { client_ip: ip }, total }));
}

export default async function alertDetail(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, alertDetailSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const alertId = parsed.args[0] as string | undefined;
  if (!alertId) {
    const msg =
      'Specify an alert id. Run `vercel firewall alerts` to list alert ids.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall alerts') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  if (org.type !== 'team') {
    const msg =
      'Firewall alert detail requires a team scope. Run `vercel switch` to select a team.';
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

  try {
    output.spinner(`Looking up alert ${chalk.bold(alertId)}`);
    let scope;
    try {
      scope = await resolveAlertScope(client, {
        alertId,
        projectId: project.id,
        teamId,
      });
    } catch (err) {
      if (err instanceof AlertNotFoundError) return failAlert(err);
      throw err;
    }

    const { alert } = scope;
    const anomalyStartMs = alert.startedAt;
    const anomalyEndMs = alert.resolvedAt ?? Date.now();
    const chartStart = new Date(anomalyStartMs - BASELINE_MS);
    const chartEnd = new Date(anomalyEndMs);
    const scopeFilter = scope.filter;
    // Host stays on the chart only so Top Hosts can still show other hosts.
    const chartFilter = andFilters(
      scopeFilter,
      alert.host ? eqFilter('request_hostname', alert.host) : undefined
    );

    output.spinner(
      `Fetching request timeseries for ${chalk.bold(alert.title)}`
    );
    const timeseries = await getGroupedTimeseries(client, {
      ownerId: teamId,
      projectId: project.id,
      filter: chartFilter,
      startTime: chartStart,
      endTime: chartEnd,
    }).catch(() => null);

    let baselineAvgPerMin: number | null = null;
    let anomalyAvgPerMin: number | null = null;
    if (timeseries && timeseries.groups[0]) {
      const bucketMs = granularityMs(timeseries.granularity);
      const series = timeseries.groups[0].series;
      const baseline: number[] = [];
      const anomaly: number[] = [];
      for (let i = 0; i < timeseries.axis.length; i++) {
        const ts = new Date(timeseries.axis[i]).getTime();
        if (ts < anomalyStartMs) baseline.push(series[i]);
        else anomaly.push(series[i]);
      }
      baselineAvgPerMin = avgPerMinute(baseline, bucketMs);
      anomalyAvgPerMin = avgPerMinute(anomaly, bucketMs);
    }

    output.spinner(`Fetching top entities during the anomaly`);
    const anomalyStart = new Date(anomalyStartMs);
    const anomalyEnd = new Date(anomalyEndMs);
    const [topIpsRaw, topHosts] = await Promise.all([
      getTopList(client, {
        ownerId: teamId,
        projectId: project.id,
        groupBy: ['client_ip'],
        filter: andFilters(scopeFilter, "client_ip ne '127.0.0.1'"),
        startTime: anomalyStart,
        endTime: anomalyEnd,
        top: TOP_ENTITIES,
      }).catch(() => []),
      getTopList(client, {
        ownerId: teamId,
        projectId: project.id,
        groupBy: ['request_hostname'],
        filter: scopeFilter,
        startTime: anomalyStart,
        endTime: anomalyEnd,
        top: TOP_ENTITIES,
      }).catch(() => []),
    ]);

    let topIps = topIpsRaw;
    if (topIps.length === 0) {
      const events = await getFirewallEvents(client, {
        projectId: project.id,
        teamId,
        startTime: anomalyStart,
        endTime: anomalyEnd,
      }).catch(() => ({ actions: [] as FirewallActionRow[] }));
      topIps = topIpsFromEvents(events.actions, TOP_ENTITIES, alert.action);
    }

    if (parsed.flags['--json']) {
      outputJson(client, {
        alert,
        window: {
          anomalyStart: new Date(anomalyStartMs).toISOString(),
          anomalyEnd: new Date(anomalyEndMs).toISOString(),
          chartStart: chartStart.toISOString(),
          chartEnd: chartEnd.toISOString(),
        },
        filter: chartFilter ?? null,
        baselineAvgPerMin,
        anomalyAvgPerMin,
        timeseries: timeseries
          ? {
              axis: timeseries.axis,
              series: timeseries.groups[0]?.series ?? [],
              granularity: timeseries.granularity,
            }
          : null,
        topIps: topIps.map(r => ({
          ip: r.values.client_ip,
          total: r.total,
        })),
        topHosts: topHosts.map(r => ({
          host: r.values.request_hostname,
          total: r.total,
        })),
      });
      return 0;
    }

    output.print(
      formatAlertDetailOutput({
        alert,
        baselineAvgPerMin,
        anomalyAvgPerMin,
        timeseries,
        anomalyStartMs,
        anomalyEndMs,
        topIps,
        topHosts,
      })
    );

    const suggest = (template: string) => withGlobalFlags(client, template);
    const label = (s: string) => chalk.dim(s.padEnd(8));
    const lines = ['', `  ${chalk.dim('Investigate further')}`];
    lines.push(
      `  ${label('Traffic')}${cmd(
        suggest(`firewall traffic-dashboard --alert ${cliToken(alert.id)}`)
      )}`
    );
    const topIp = topIps[0]?.values.client_ip;
    if (topIp) {
      lines.push(
        `  ${label('Block')}${cmd(
          suggest(`firewall ip-blocks block ${cliToken(topIp)}`)
        )}`
      );
    }
    if (alert.action === 'challenge' || alert.action === 'deny') {
      const since = cliToken(new Date(anomalyStartMs).toISOString());
      const until = cliToken(new Date(anomalyEndMs).toISOString());
      lines.push(
        `  ${label('Events')}${cmd(
          suggest(
            `firewall events --action ${cliToken(alert.action)} --since ${since} --until ${until}`
          )
        )}`
      );
    }
    output.print(`${lines.join('\n')}\n\n`);
    return 0;
  } catch (e: unknown) {
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall alert detail';
    if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
      msg =
        'You do not have permission to read firewall alerts for this project. Check team access and try again.';
    }
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall alerts') }],
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
