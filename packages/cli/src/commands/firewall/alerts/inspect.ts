import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { alertsInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewall,
  failFirewallApi,
} from '../shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import {
  findFirewallAlert,
  FIREWALL_ACTIVITY_PLAN_MESSAGE,
  type AlertSourceIssue,
} from '../../../util/firewall/get-firewall-alerts';
import getFirewallMetrics, {
  type FirewallActionSeries,
} from '../../../util/firewall/get-firewall-metrics';
import { getFirewallEvents } from '../../../util/firewall/get-firewall-events';
import {
  formatAlertInspect,
  type AlertInspectRates,
  type AlertInspectView,
} from '../../../util/firewall/format-alerts';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { isAPIError } from '../../../util/errors-ts';
import { apiServerMessage } from '../../../util/firewall/server-message';

const PREVIOUS_WINDOW_MS = 24 * 60 * 60 * 1000;
const GRANULARITY_MINUTES = 15;
const GRANULARITY_MS = GRANULARITY_MINUTES * 60 * 1000;

function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

/** The bucket a timestamp falls in. The API buckets on wall-clock boundaries. */
function floorToBucket(ms: number): number {
  return Math.floor(ms / GRANULARITY_MS) * GRANULARITY_MS;
}

/**
 * Total for one action over `[startMs, endMs)`.
 *
 * Scoped to the alert's action: the chart beneath these rates shows that
 * action alone, and summing every action turns the baseline into total project
 * traffic, which dwarfs any single mitigation.
 */
function sumInWindow(
  series: FirewallActionSeries[],
  action: string,
  startMs: number,
  endMs: number
): number {
  let total = 0;
  for (const s of series) {
    if (s.action !== action) continue;
    for (const point of s.timeseries) {
      const ts = new Date(point.timestamp).getTime();
      if (ts >= startMs && ts < endMs) total += point.value;
    }
  }
  return total;
}

function reqPerMin(total: number, windowMs: number): number {
  const minutes = windowMs / 60_000;
  return minutes > 0 ? total / minutes : 0;
}

function axisBetween(startMs: number, endMs: number, stepMs: number): number[] {
  const axis: number[] = [];
  for (let t = startMs; t < endMs; t += stepMs) {
    axis.push(t);
  }
  return axis;
}

function valuesOnAxis(
  series: FirewallActionSeries | undefined,
  axis: number[]
): number[] {
  const byTs = new Map<number, number>();
  for (const point of series?.timeseries ?? []) {
    byTs.set(new Date(point.timestamp).getTime(), point.value);
  }
  return axis.map(t => byTs.get(t) ?? 0);
}

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    alertsInspectSubcommand,
    client,
    'alerts inspect'
  );
  if (typeof parsed === 'number') return parsed;

  const alertId = parsed.args[0];
  if (!alertId) {
    return failFirewall(client, {
      message: `Alert id is required. Usage: ${withGlobalFlags(client, 'firewall alerts inspect <alertid>')}`,
      nextCommand: 'firewall alerts inspect <alertid>',
      reason: AGENT_REASON.MISSING_ARGUMENTS,
    });
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  if (!teamId) {
    return failFirewall(client, {
      message:
        'Firewall alerts need a team. Run `vercel switch` to select a team or pass --scope <team>.',
      reason: AGENT_REASON.MISSING_SCOPE,
    });
  }

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall alerts inspect ${alertId}${asJson ? ' --json' : ''}`;

  output.spinner(`Fetching alert ${chalk.bold(alertId)}`);

  try {
    const resolved = await findFirewallAlert(client, {
      projectId: project.id,
      teamId,
      alertId,
    });
    if (!resolved) {
      return failFirewall(client, {
        message: `No firewall alert found for "${alertId}". Run ${withGlobalFlags(client, 'firewall alerts list')} to view recent alerts.`,
        nextCommand: 'firewall alerts list',
        reason: AGENT_REASON.NOT_FOUND,
      });
    }

    const { alert } = resolved;
    const action = alert.action ?? 'deny';

    // `attack-status` stamps `endTime` equal to `startTime` on every anomaly it
    // closes, so a resolved DDoS alert describes an instant rather than a
    // period. Left as-is that window sums to nothing, and the events API
    // rejects it outright ("endTimestamp must be greater than startTimestamp"),
    // so widen it to the bucket the anomaly landed in.
    const anomalyStart = floorToBucket(alert.startedAt);
    const anomalyEnd = Math.max(
      alert.resolvedAt ?? Date.now(),
      anomalyStart + GRANULARITY_MS
    );

    // Aligned to the bucket grid, because the axis is matched against the
    // API's timestamps by equality: an alert that began at :10 would otherwise
    // produce an axis of :10/:25/:40 against buckets at :00/:15/:30 and read
    // every point as zero.
    const chartStart = floorToBucket(anomalyStart - PREVIOUS_WINDOW_MS);
    const chartEnd = anomalyEnd;

    output.spinner(`Fetching traffic for ${chalk.bold(alert.title)}`);

    let eventsIssue: AlertSourceIssue | undefined;
    const [metrics, events] = await Promise.all([
      getFirewallMetrics(client, {
        projectId: project.id,
        ownerId: teamId,
        startTime: new Date(chartStart),
        endTime: new Date(chartEnd),
        granularity: { minutes: GRANULARITY_MINUTES },
      }).catch(err => {
        if (isActivityUnavailable(err)) return null;
        throw err;
      }),
      getFirewallEvents(client, {
        projectId: project.id,
        teamId,
        startTime: new Date(anomalyStart),
        endTime: new Date(anomalyEnd),
        // The same fallback the chart and the rates use. Passing the alert's
        // own possibly-absent action left the breakdown unfiltered, so it
        // aggregated every mitigation under a table still titled "Denied IPs".
        action,
      }).catch(err => {
        if (isAPIError(err) && (err.status === 401 || err.status === 403)) {
          throw err;
        }
        if (isActivityUnavailable(err)) {
          eventsIssue = {
            reason: 'plan',
            message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
          };
          return null;
        }
        eventsIssue = {
          reason: 'error',
          // Not `err.message` for an `APIError`: it is built from the same
          // sentinel plus the status, so it reinstates what
          // `apiServerMessage` declined to report.
          message:
            apiServerMessage(err) ||
            (!isAPIError(err) && err instanceof Error && err.message) ||
            "Couldn't load denied IPs.",
        };
        return null;
      }),
    ]);

    let rates: AlertInspectRates | undefined;
    let timeseries: AlertInspectView['timeseries'];
    if (metrics) {
      const previousMs = anomalyStart - chartStart;
      const anomalyMs = anomalyEnd - anomalyStart;
      const previousTotal = sumInWindow(
        metrics.series,
        action,
        chartStart,
        anomalyStart
      );
      const anomalyTotal = sumInWindow(
        metrics.series,
        action,
        anomalyStart,
        anomalyEnd
      );
      const previousReqPerMin = reqPerMin(previousTotal, previousMs);
      const anomalyReqPerMin = reqPerMin(anomalyTotal, anomalyMs);
      rates = {
        previousReqPerMin,
        anomalyReqPerMin,
        multiplier:
          previousReqPerMin > 0 ? anomalyReqPerMin / previousReqPerMin : null,
      };

      const axis = axisBetween(chartStart, chartEnd, GRANULARITY_MS);
      const series = metrics.series.find(s => s.action === action);
      timeseries = {
        action,
        startMs: chartStart,
        endMs: chartEnd,
        pointCount: axis.length,
        granularityMinutes: GRANULARITY_MINUTES,
        values: valuesOnAxis(series, axis),
      };
    }

    const hosts =
      events?.hosts && events.hosts.length > 0 ? events.hosts : resolved.hosts;
    const ips = events?.ips;

    if (asJson) {
      outputJson(client, {
        alert,
        status: alert.resolvedAt ? 'resolved' : 'active',
        previous24h: rates ? { reqPerMin: rates.previousReqPerMin } : null,
        anomaly: rates
          ? {
              reqPerMin: rates.anomalyReqPerMin,
              multiplier: rates.multiplier,
            }
          : null,
        timeseries: timeseries
          ? {
              action: timeseries.action,
              startTime: new Date(timeseries.startMs).toISOString(),
              endTime: new Date(timeseries.endMs).toISOString(),
              granularity: { minutes: timeseries.granularityMinutes },
              points: timeseries.values.map((value, i) => ({
                timestamp: new Date(
                  timeseries.startMs + i * GRANULARITY_MS
                ).toISOString(),
                value,
              })),
            }
          : null,
        deniedIps:
          ips?.map(row => ({ ip: row.name, count: row.count })) ?? null,
        topHosts:
          hosts?.map(row => ({ host: row.name, count: row.count })) ?? null,
        ...(!metrics
          ? {
              activityUnavailable: {
                reason: 'plan' as const,
                message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
              },
            }
          : {}),
        ...(eventsIssue ? { eventsUnavailable: eventsIssue } : {}),
      });
      return 0;
    }

    output.print(
      `\n${formatAlertInspect({
        alert,
        rates,
        timeseries,
        ips,
        hosts,
      })}`
    );
    if (!metrics) {
      output.print(`  ${FIREWALL_ACTIVITY_PLAN_MESSAGE}\n`);
    } else if (eventsIssue?.reason === 'plan') {
      output.print(`  ${FIREWALL_ACTIVITY_PLAN_MESSAGE}\n`);
    } else if (eventsIssue) {
      // The alert carries its own affected hosts, so those can render even
      // when the events query fails. Naming both would contradict the table
      // printed just above.
      // `hosts` is an empty array, not undefined, for a legacy anomaly whose
      // per-host totals were all zero — nothing renders above in that case
      // either, so the message has to name it.
      const haveHosts = Boolean(hosts && hosts.length > 0);
      output.print(
        `  Couldn't load denied IPs${haveHosts ? '' : ' and hosts'}.\n`
      );
    }
    output.print('\n');
    return 0;
  } catch (e: unknown) {
    if (isActivityUnavailable(e)) {
      return failFirewall(client, {
        message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
        reason: AGENT_REASON.API_ERROR,
      });
    }
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall alert',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall alerts',
      projectName: project.name,
      timeoutJob: 'firewall alert',
    });
  }
}
