import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { trafficListSubcommand } from '../command';
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
  runWithConcurrency,
  TOP_LIMITS,
  trendBuckets,
  unknownDimensionMessage,
} from './shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import {
  andFilters,
  getDimension,
  type TrafficDimension,
} from '../../../util/firewall/dimensions';
import {
  isActivityTimeout,
  isRateLimited,
  isUnsupportedDimension,
  rateLimitRetrySeconds,
} from '../../../util/firewall/observability-query';
import {
  AlertNotFoundError,
  resolveAlertScope,
  type AlertScope,
} from '../../../util/firewall/alert-scope';
import getFirewallMetrics from '../../../util/firewall/get-firewall-metrics';
import {
  alignQueryWindow,
  DEFAULT_MAX_BUCKETS,
  getTopList,
  pickGranularity,
} from '../../../util/firewall/get-firewall-traffic';
import { apiServerMessage } from '../../../util/firewall/server-message';
import {
  allTopListsUnavailable,
  formatTrafficList,
  topListFetchCount,
  toTopListRows,
  type TrafficTopList,
} from '../../../util/firewall/format-traffic';
import { resolveRuleDisplayName } from '../../../util/firewall/rule-names';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import { projectScope } from '../../../util/firewall/scope';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { getRenamedOption, withWarnings } from '../../../util/renamed-option';
import { isAPIError } from '../../../util/errors-ts';
import {
  normalizeRepeatableStringFilters,
  validateIntegerRangeWithDefault,
} from '../../../util/command-validation';

const DEFAULT_TOP = 5;

/**
 * The panels of the dashboard's traffic page, in its order. Each one is
 * another observability query, so `--dimension` narrows the set when a caller
 * wants one answer rather than the page; `country`, `action`, and
 * `unknown-bot` are reachable that way but are not part of the page.
 * Unknown Bot Traffic lives on `firewall bot-management`.
 */
const DEFAULT_DIMENSIONS = [
  'ip',
  'ja4',
  'asn',
  'user-agent',
  'path',
  'rule',
  'host',
  'bot',
];

/**
 * Enough for every panel of the default report to go out at once. The queries
 * are the whole wall clock of this command and they do not contend with each
 * other — a lower ceiling just splits the report into waves, each costing a
 * full round trip to the warehouse.
 *
 * What they do share is the endpoint's quota, which is a budget rather than a
 * ceiling on how many run together: spacing them out spends the same amount
 * more slowly. A refusal is now reported rather than waited on, so the report
 * arrives either way.
 */
const LIST_CONCURRENCY = 8;

function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    trafficListSubcommand,
    client,
    'traffic list'
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

  const requested = normalizeRepeatableStringFilters(
    parsed.flags['--dimension'] as string[] | undefined
  );
  const dimensions: TrafficDimension[] = [];
  for (const alias of requested.length > 0 ? requested : DEFAULT_DIMENSIONS) {
    const dimension = getDimension(alias);
    if (!dimension) {
      return failFirewall(client, {
        message: unknownDimensionMessage('--dimension', alias),
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      });
    }
    // A repeated --dimension would otherwise run the same query twice.
    if (!dimensions.includes(dimension)) dimensions.push(dimension);
  }

  const mixedMetricError = mixedTrafficMetricError({ flags: parsed.flags });
  if (mixedMetricError) {
    return failFirewall(client, {
      message: mixedMetricError,
      nextCommand: 'firewall traffic inspect unknown-bot <category>',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

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
  const suggestedCommand = `firewall traffic list${asJson ? ' --json' : ''}`;

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
    buildTrafficFilter(parsed.flags)
  );
  const filtered = Boolean(filter);

  output.spinner(`Fetching firewall traffic for ${chalk.bold(project.name)}`);

  const granularity = pickGranularity(
    window.endTime.getTime() - window.startTime.getTime(),
    // The bucket count is a sparkline's width, so the terminal sets it — but
    // only when a sparkline is what gets printed. `--json` is a contract, and
    // a wide terminal resolving it differently from a narrow one is not one.
    asJson ? DEFAULT_MAX_BUCKETS : trendBuckets(client)
  );
  // Every panel has to describe the same window, so it is aligned once here
  // and shared. The API rounds a bucketed query out to whole buckets itself;
  // the top lists carry no buckets to be rounded by, so an unaligned window
  // had the chart cover a range the lists beneath it could not account for.
  const { startTime, endTime } = alignQueryWindow(
    window.startTime,
    window.endTime,
    granularity
  );

  // A rule id alone is opaque, and the names live on the firewall config
  // rather than the metric — the same lookup `overview` does. Only fetched
  // when a rule list was asked for, and a failure costs names, not the report.
  // Started here but awaited with everything else: it is a round trip the
  // traffic queries do not depend on, so it must not delay them.
  const activeConfig = dimensions.some(d => d.alias === 'rule')
    ? listFirewallConfigs(client, projectScope(project, teamId))
        .then(configs => configs.active)
        .catch(() => null)
    : Promise.resolve(null);

  try {
    const [metrics, topLists, config] = await Promise.all([
      getFirewallMetrics(client, {
        projectId: project.id,
        ownerId: teamId,
        startTime,
        endTime,
        granularity,
        filter,
      }),
      runWithConcurrency<TrafficTopList>(
        dimensions.map(dimension => async () => {
          const title = dimension.widgetTitle;
          try {
            const groupBy = dimension.groupBy ?? [dimension.field];
            const rows = await getTopList(client, {
              projectId: project.id,
              ownerId: teamId,
              startTime,
              endTime,
              metric: dimension.metric,
              groupBy,
              filter: andFilters(
                filter,
                dimension.excludeFilter,
                dimension.extraFilter
              ),
              // Extra group-by fields split dropped empty rows into many
              // groups, so the spare is sized from `groupBy`. See
              // `topListFetchCount`.
              top: topListFetchCount(top, groupBy),
            });
            return {
              dimension: dimension.alias,
              title,
              rows: toTopListRows(
                rows,
                dimension.field,
                dimension.labelFields
              ).slice(0, top),
            };
          } catch (e: unknown) {
            // Every panel is its own query, and none of them is the report:
            // a dimension the account cannot group by, a metric its plan does
            // not cover, or one query that timed out costs that panel only.
            //
            // Including a plan gate, which is not fatal here even though it
            // is for the command: Unknown Bot Traffic still reads request
            // counts, so one panel answering 402 does not mean the account
            // cannot query traffic. When it truly cannot, the timeseries
            // below says so and that failure is not caught.
            return {
              dimension: dimension.alias,
              title,
              rows: [],
              unavailable: isActivityUnavailable(e)
                ? 'plan'
                : isUnsupportedDimension(e)
                  ? 'filter'
                  : isRateLimited(e)
                    ? 'rate-limit'
                    : isActivityTimeout(e)
                      ? 'timeout'
                      : 'error',
              // Only a rate limit carries one, and only when the API sent it.
              retrySeconds: rateLimitRetrySeconds(e),
              // The budget it names, and who can raise it, are things only
              // the API knows.
              message: isRateLimited(e) ? apiServerMessage(e) : undefined,
            };
          }
        }),
        LIST_CONCURRENCY
      ),
      activeConfig,
    ]);

    // A name to read, alongside the id it was resolved from. Overwriting the
    // id would leave nothing to feed back to `traffic inspect rule <value>`,
    // in the table or in the JSON, and a rule name is not a filter the metric
    // accepts.
    for (const list of topLists) {
      if (list.dimension !== 'rule') continue;
      list.rows = list.rows.map(row => ({
        ...row,
        label: resolveRuleDisplayName(row.value, config),
      }));
    }

    // A report that lost every panel is not a degraded one, it is a failed
    // one: the caller asked for top lists and got none. The body says why;
    // the exit code is what a script or an agent reads. Whether those
    // failures also collapse into one line is a separate question, and a
    // narrower one — see `sharedUnavailable`.
    const allFailed = allTopListsUnavailable(topLists);

    if (asJson) {
      outputJson(
        client,
        withWarnings(
          {
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
            stats: metrics.totals,
            // Totals live in `stats`, keyed by the same action, so repeating them
            // per series would put one number in the payload twice.
            series: metrics.series.map(({ action, timeseries }) => ({
              action,
              timeseries,
            })),
            topLists: topLists.map(list => ({
              dimension: list.dimension,
              rows: list.rows,
              ...(list.unavailable ? { unavailable: list.unavailable } : {}),
              ...(list.retrySeconds ? { retrySeconds: list.retrySeconds } : {}),
            })),
          },
          [query.warning, limit.warning]
        )
      );
      return allFailed ? 1 : 0;
    }

    output.print('\n');
    output.print(
      formatTrafficList({
        series: metrics.series,
        topLists,
        startTime: metrics.startTime,
        endTime: metrics.endTime,
        granularity: metrics.granularity,
        filtered,
      })
    );
    // Placeholders rather than a row's own value: a user agent or path comes
    // from the request that carried it, and untrusted text has no place in a
    // command the reader is invited to paste. Skipped when there are no rows
    // to break down — the invitation would name values the report never got.
    if (!allFailed) {
      output.print(
        `\n${chalk.dim('  Break any of these values down further:')}\n  ${withGlobalFlags(
          client,
          'firewall traffic inspect <dimension> <value>'
        )}\n\n`
      );
    }
    return allFailed ? 1 : 0;
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
