import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { drillInSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import {
  andFilters,
  dimensionAliases,
  eqFilter,
  getDimension,
} from '../../util/firewall/dimensions';
import {
  AlertNotFoundError,
  resolveAlertScope,
  resolveScopedTimeRange,
} from '../../util/firewall/alert-scope';
import {
  getGroupedTimeseries,
  getTopList,
} from '../../util/firewall/get-firewall-traffic';
import { formatDrillInOutput } from '../../util/firewall/format-traffic';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';

const DEFAULT_TOP = 10;

export default async function drillIn(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, drillInSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const fail = (msg: string, nextCommand: string) => {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [{ command: withGlobalFlags(client, nextCommand) }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  };

  const dimensionArg = parsed.args[0] as string | undefined;
  const value = parsed.args[1] as string | undefined;
  const aliases = dimensionAliases().join(', ');
  if (!dimensionArg || !value) {
    return fail(
      `Specify a dimension and value, e.g. \`vercel firewall drill-in ip 1.2.3.4\`. Dimensions: ${aliases}`,
      'firewall traffic-dashboard'
    );
  }
  const dimension = getDimension(dimensionArg);
  if (!dimension) {
    return fail(
      `Unknown dimension "${dimensionArg}". Dimensions: ${aliases}`,
      'firewall traffic-dashboard'
    );
  }

  const groupByArg =
    (parsed.flags['--group-by'] as string) ?? dimension.defaultGroupBy;
  const groupByDim = getDimension(groupByArg);
  if (!groupByDim) {
    return fail(
      `Unknown --group-by dimension "${groupByArg}". Dimensions: ${aliases}`,
      `firewall drill-in ${dimensionArg} ${value}`
    );
  }
  if (groupByDim.alias === dimension.alias) {
    return fail(
      `--group-by must differ from the drill-in dimension (${dimension.alias}).`,
      `firewall drill-in ${dimensionArg} ${value}`
    );
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  if (org.type !== 'team') {
    return fail(
      'Firewall drill-in requires a team scope. Run `vercel switch` to select a team.',
      'switch'
    );
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
  const rawFilters = (parsed.flags['--filter'] as string[] | undefined) ?? [];
  const userFilter = andFilters(...rawFilters);
  const entityFilter = andFilters(
    alertScope?.filter,
    eqFilter(dimension.field, value),
    userFilter
  );
  const displayFilter = andFilters(alertScope?.filter, userFilter);

  try {
    // Sequential steps with progressive spinner text (see overview.ts).
    output.spinner(
      `Fetching ${dimension.label} detail for ${chalk.bold(value)}`
    );
    const headerDetail: Array<{ field: string; value: string }> = [];
    if (dimension.headerDetailFields?.length) {
      const detailRows = await getTopList(client, {
        ownerId: teamId,
        projectId: project.id,
        groupBy: dimension.headerDetailFields,
        filter: entityFilter,
        startTime,
        endTime,
        top: 1,
      }).catch(() => []);
      const first = detailRows[0];
      if (first) {
        for (const field of dimension.headerDetailFields) {
          headerDetail.push({ field, value: first.values[field] ?? '' });
        }
      }
    }

    output.spinner(`Fetching request timeseries for ${chalk.bold(value)}`);
    const timeseries = await getGroupedTimeseries(client, {
      ownerId: teamId,
      projectId: project.id,
      filter: entityFilter,
      startTime,
      endTime,
    });
    const total = timeseries.groups[0]?.total ?? 0;

    output.spinner(
      `Fetching breakdown by ${groupByDim.label} for ${chalk.bold(value)}`
    );
    // No exclude filter here: empty dimension values (e.g. request_path on
    // dropped requests) are shown as "(not set)" instead of hidden.
    const breakdown = await getGroupedTimeseries(client, {
      ownerId: teamId,
      projectId: project.id,
      groupBy: [groupByDim.field],
      filter: entityFilter,
      startTime,
      endTime,
      limit: top,
    });

    if (parsed.flags['--json']) {
      outputJson(client, {
        dimension: dimension.alias,
        value,
        period: {
          start: timeseries.startTime,
          end: timeseries.endTime,
          granularity: timeseries.granularity,
        },
        filter: entityFilter,
        ...(alertScope
          ? {
              alertId: alertScope.alert.id,
              window: {
                start: alertScope.startTime.toISOString(),
                end: alertScope.endTime.toISOString(),
              },
            }
          : {}),
        detail: Object.fromEntries(headerDetail.map(d => [d.field, d.value])),
        total,
        axis: timeseries.axis,
        series: timeseries.groups[0]?.series ?? [],
        breakdown: {
          groupBy: groupByDim.alias,
          groups: breakdown.axis.length
            ? breakdown.groups.map(g => ({
                value: g.values[groupByDim.field] ?? '',
                total: g.total,
                series: g.series,
              }))
            : [],
          axis: breakdown.axis,
        },
      });
      return 0;
    }

    output.print(
      formatDrillInOutput({
        value,
        dimensionLabel: dimension.label,
        headerDetail,
        timeseries,
        total,
        breakdown,
        breakdownField: groupByDim.field,
        breakdownLabel: groupByDim.label,
        top,
        filter: displayFilter,
      })
    );
    const alertFlag = alertScope ? ` --alert ${alertScope.alert.id}` : '';
    output.print(
      chalk.dim(
        `\n  Group by something else: \`vercel firewall drill-in ${dimension.alias} ${value} --group-by <${dimensionAliases()
          .filter(a => a !== dimension.alias)
          .join('|')}>${alertFlag}\`\n\n`
      )
    );
    return 0;
  } catch (e: unknown) {
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall drill-in';
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
          {
            command: withGlobalFlags(
              client,
              `firewall drill-in ${dimensionArg} ${value}`
            ),
          },
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
