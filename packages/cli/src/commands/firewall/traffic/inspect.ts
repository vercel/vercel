import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { trafficInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewall,
  failFirewallApi,
  failFirewallObservabilityPlan,
} from '../shared';
import {
  buildTrafficFilter,
  mixedTrafficMetricError,
  requireTrafficTeam,
  resolveTrafficWindow,
  TOP_LIMITS,
  trendBuckets,
  unknownDimensionMessage,
} from './shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import {
  andFilters,
  dimensionAliases,
  eqFilter,
  getDimension,
} from '../../../util/firewall/dimensions';
import {
  AlertNotFoundError,
  resolveAlertScope,
  type AlertScope,
} from '../../../util/firewall/alert-scope';
import getFirewallMetrics, {
  type FirewallMetricsResult,
} from '../../../util/firewall/get-firewall-metrics';
import {
  alignQueryWindow,
  DEFAULT_MAX_BUCKETS,
  getGroupedTimeseries,
  getTopList,
  pickGranularity,
} from '../../../util/firewall/get-firewall-traffic';
import { formatTrafficInspect } from '../../../util/firewall/format-traffic';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { getRenamedOption, withWarnings } from '../../../util/renamed-option';
import { isAPIError } from '../../../util/errors-ts';
import { validateIntegerRangeWithDefault } from '../../../util/command-validation';

const DEFAULT_TOP = 10;

function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    trafficInspectSubcommand,
    client,
    'traffic inspect'
  );
  if (typeof parsed === 'number') return parsed;

  const json = Boolean(parsed.flags['--json']);
  const query = getRenamedOption<string[]>(
    parsed.flags,
    '--query',
    '--filter',
    {
      json,
    }
  );
  if ('error' in query) {
    return failFirewall(client, {
      message: query.error,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  // `buildTrafficFilter` reads `--query`.
  parsed.flags['--query'] = query.value;
  const limit = getRenamedOption<number>(parsed.flags, '--limit', '--top', {
    json,
  });
  if ('error' in limit) {
    return failFirewall(client, {
      message: limit.error,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const usage = 'firewall traffic inspect <dimension> <value>';
  const [dimensionArg, value] = parsed.args;
  if (!dimensionArg || !value) {
    return failFirewall(client, {
      message: `Dimension and value are required. Usage: ${withGlobalFlags(client, usage)}. Dimensions: ${dimensionAliases().join(', ')}.`,
      nextCommand: usage,
      reason: AGENT_REASON.MISSING_ARGUMENTS,
    });
  }

  const dimension = getDimension(dimensionArg);
  if (!dimension) {
    return failFirewall(client, {
      message: unknownDimensionMessage('dimension', dimensionArg),
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const groupByArg =
    (parsed.flags['--group-by'] as string | undefined) ??
    dimension.defaultGroupBy;
  const groupBy = getDimension(groupByArg);
  if (!groupBy) {
    return failFirewall(client, {
      message: unknownDimensionMessage('--group-by', groupByArg),
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  if (groupBy.alias === dimension.alias) {
    // Grouping a single value by itself yields one row equal to the total.
    return failFirewall(client, {
      message: `\`--group-by\` must name a different dimension from "${dimension.alias}".`,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const requestMetricError = mixedTrafficMetricError({
    dimension,
    groupBy,
    flags: parsed.flags,
  });
  if (requestMetricError) {
    return failFirewall(client, {
      message: requestMetricError,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const topResult = validateIntegerRangeWithDefault(limit.value, {
    flag: '--limit',
    ...TOP_LIMITS,
    defaultValue: DEFAULT_TOP,
  });
  if (!topResult.valid) {
    return failFirewall(client, {
      message: topResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const top = topResult.value;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireTrafficTeam(client, org, 'Firewall traffic');
  if (typeof teamId === 'number') return teamId;

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall traffic inspect ${dimension.alias} ${value}${asJson ? ' --json' : ''}`;

  let alertScope: AlertScope | undefined;
  const alertId = parsed.flags['--alert'] as string | undefined;
  if (alertId) {
    output.spinner(`Fetching alert ${chalk.bold(alertId)}`);
    try {
      alertScope = await resolveAlertScope(client, {
        alertId,
        projectId: project.id,
        teamId,
      });
    } catch (e: unknown) {
      if (e instanceof AlertNotFoundError) {
        return failFirewall(client, {
          message: e.message,
          nextCommand: 'firewall alerts list',
          reason: AGENT_REASON.NOT_FOUND,
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
    if (dimension.metric && alertScope.filter) {
      return failFirewall(client, {
        message: `${dimension.label} uses request-count data and cannot be scoped to a firewall alert with an attributed rule. Drop --alert, or inspect a firewall-action dimension instead.`,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      });
    }
  }

  const window = resolveTrafficWindow(
    parsed.flags['--since'] as string | undefined,
    parsed.flags['--until'] as string | undefined,
    alertScope
  );
  if (!window.valid) {
    return failFirewall(client, {
      message: window.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const filter = andFilters(
    alertScope?.filter,
    eqFilter(dimension.field, value),
    buildTrafficFilter(parsed.flags),
    dimension.extraFilter
  );
  const granularity = pickGranularity(
    window.endTime.getTime() - window.startTime.getTime(),
    // The bucket count is a sparkline's width, so the terminal sets it — but
    // only when a sparkline is what gets printed. `--json` is a contract, and
    // a wide terminal resolving it differently from a narrow one is not one.
    asJson ? DEFAULT_MAX_BUCKETS : trendBuckets(client)
  );
  // Aligned once and shared, so the header rows, the chart and the breakdown
  // describe one window: the API rounds the bucketed queries out to whole
  // buckets itself, and the unbucketed header query has none to be rounded
  // by. See `alignQueryWindow`.
  const { startTime, endTime } = alignQueryWindow(
    window.startTime,
    window.endTime,
    granularity
  );

  output.spinner(`Fetching traffic for ${chalk.bold(value)}`);

  try {
    const [detailRows, metrics, breakdown] = await Promise.all([
      // One row of whichever dimensions describe this entity — an IP's
      // network and country, a JA4 digest's user agent. Decoration, and the
      // dimensions that have none skip it entirely, so a failure here costs
      // the header rows rather than the report.
      dimension.headerDetailFields?.length
        ? getTopList(client, {
            projectId: project.id,
            ownerId: teamId,
            startTime,
            endTime,
            metric: dimension.metric,
            groupBy: dimension.headerDetailFields,
            filter,
            top: 1,
          }).catch(() => [])
        : Promise.resolve([]),
      dimension.metric
        ? requestCountMetrics(client, {
            projectId: project.id,
            ownerId: teamId,
            startTime,
            endTime,
            granularity,
            filter,
            metric: dimension.metric,
          })
        : getFirewallMetrics(client, {
            projectId: project.id,
            ownerId: teamId,
            startTime,
            endTime,
            granularity,
            filter,
          }),
      // No exclude filter: a dimension the entity's rows leave empty shows as
      // "(not set)" rather than dropping requests out of the breakdown.
      getGroupedTimeseries(client, {
        projectId: project.id,
        ownerId: teamId,
        startTime,
        endTime,
        granularity,
        metric: dimension.metric,
        groupBy: [groupBy.field],
        filter,
        limit: top,
        // `--limit` rows out of a dimension with no bound — paths, user agents,
        // client IPs. Ranking those by a sampled count is what the sampled
        // read is for, and an exact ranking of an unbounded set is what makes
        // this query expensive enough to be refused or to time out.
        approximateSelection: true,
      }),
    ]);

    const detail = (dimension.headerDetailFields ?? []).map(field => ({
      field,
      value: detailRows[0]?.values[field] ?? '',
    }));
    const total = Object.values(metrics.totals).reduce(
      (sum, count) => sum + count,
      0
    );

    if (total === 0) {
      // A value with no traffic is far more often a typo than a quiet client,
      // and an empty report does not say which.
      return failFirewall(client, {
        message: `No firewall traffic for ${dimension.label} "${value}" in this window. Run ${withGlobalFlags(client, 'firewall traffic list')} to see which values have traffic, or widen the window with \`--since\`.`,
        nextCommand: 'firewall traffic list',
        reason: AGENT_REASON.NOT_FOUND,
      });
    }

    if (asJson) {
      outputJson(
        client,
        withWarnings(
          {
            dimension: dimension.alias,
            value,
            period: {
              start: metrics.startTime,
              end: metrics.endTime,
              granularity: metrics.granularity,
            },
            filter: filter ?? null,
            ...(alertScope
              ? {
                  alert: {
                    id: alertScope.alert.id,
                    title: alertScope.alert.title,
                    startedAt: alertScope.alert.startedAt,
                    resolvedAt: alertScope.alert.resolvedAt ?? null,
                  },
                }
              : {}),
            detail: Object.fromEntries(
              detail.map(row => [row.field, row.value])
            ),
            total,
            stats: metrics.totals,
            series: metrics.series.map(({ action, timeseries }) => ({
              action,
              timeseries,
            })),
            breakdown: {
              groupBy: groupBy.alias,
              axis: breakdown.axis,
              groups: breakdown.groups.map(group => ({
                value: group.values[groupBy.field],
                total: group.total,
                series: group.series,
              })),
            },
          },
          [query.warning, limit.warning]
        )
      );
      return 0;
    }

    output.print('\n');
    output.print(
      formatTrafficInspect({
        value,
        dimensionLabel: dimension.label,
        detail,
        total,
        series: metrics.series,
        startTime: metrics.startTime,
        endTime: metrics.endTime,
        granularity: metrics.granularity,
        breakdown,
        breakdownField: groupBy.field,
        breakdownLabel: groupBy.label,
        top,
        filtered: true,
      })
    );
    output.print(`\n${nextSteps(client, dimension.alias)}\n`);
    return 0;
  } catch (e: unknown) {
    if (isActivityUnavailable(e)) {
      return failFirewallObservabilityPlan(client, e, project.name);
    }
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall traffic',
      nextCommand: suggestedCommand,
      permissionAction: 'query firewall traffic',
      projectName: project.name,
      timeoutJob: 'firewall traffic',
    });
  }
}

/**
 * Request-count dimensions (unknown bots) have no `wafAction` to group by.
 * The inspect chart is then one series of request totals, which is what the
 * dashboard's bot-management unknown-bot card charts too.
 */
async function requestCountMetrics(
  client: Client,
  opts: {
    projectId: string;
    ownerId: string;
    startTime: Date;
    endTime: Date;
    granularity: { minutes: number } | { hours: number } | { days: number };
    filter?: string;
    metric: string;
  }
): Promise<FirewallMetricsResult> {
  const result = await getGroupedTimeseries(client, opts);
  const group = result.groups[0];
  const total = group?.total ?? 0;
  const timeseries = result.axis.map((timestamp, i) => ({
    timestamp,
    value: group?.series[i] ?? 0,
  }));
  return {
    startTime: result.startTime,
    endTime: result.endTime,
    granularity: result.granularity,
    series: total > 0 ? [{ action: 'requests', total, timeseries }] : [],
    totals: total > 0 ? { requests: total } : {},
  };
}

/**
 * What to do with what the breakdown just showed. The remediation for a
 * client is a block, for a rule its own definition; everything else can only
 * be looked at from another angle.
 *
 * The commands carry placeholders rather than the inspected value: it came
 * from the request that reached the firewall, and untrusted text has no place
 * in a command the reader is invited to paste.
 */
function nextSteps(client: Client, alias: string): string {
  const steps: Array<[string, string]> = [];
  if (alias === 'ip') {
    steps.push([
      'Block this client on every host',
      'firewall ip-blocks block <ip>',
    ]);
  } else if (alias === 'rule') {
    steps.push(['Change what this rule does', 'firewall rules update <rule>']);
  }
  steps.push([
    'Break the same traffic down another way',
    `firewall traffic inspect ${alias} <value> --group-by <dimension>`,
  ]);

  if (steps.length === 1) {
    const [why, command] = steps[0];
    return `${chalk.dim(`  ${why}:`)}\n  ${withGlobalFlags(client, command)}\n`;
  }
  return [
    `  ${chalk.bold('Next steps:')}`,
    ...steps.flatMap(([why, command]) => [
      chalk.dim(`  ${why}`),
      `  ${withGlobalFlags(client, command)}`,
    ]),
    '',
  ].join('\n');
}
