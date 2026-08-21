import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { trafficInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  failFirewall,
  failFirewallApi,
  requireFirewallTeam,
  withGlobalFlags,
} from '../shared';
import {
  andFilters,
  dimensionAliases,
  eqFilter,
  getDimension,
} from '../../../util/firewall/dimensions';
import {
  AlertNotFoundError,
  resolveAlertScope,
  resolveScopedTimeRange,
} from '../../../util/firewall/alert-scope';
import {
  getGroupedTimeseries,
  getTopList,
} from '../../../util/firewall/get-firewall-traffic';
import { formatDrillInOutput } from '../../../util/firewall/format-traffic';
import { cliToken, formatHintLine } from '../../../util/firewall/format-utils';
import { resolveManagedBotRuleId } from '../../../util/firewall/managed-bot-rules';
import { AGENT_REASON } from '../../../util/agent-output-constants';

const DEFAULT_TOP = 10;

export default async function drillIn(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    trafficInspectSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const dimensionArg = parsed.args[0] as string | undefined;
  const value = parsed.args[1] as string | undefined;
  const aliases = dimensionAliases().join(', ');
  if (!dimensionArg || !value) {
    return failFirewall(
      client,
      `Specify a dimension and value, e.g. \`vercel firewall traffic inspect ip 1.2.3.4\`. Dimensions: ${aliases}`,
      'firewall traffic'
    );
  }
  const dimension = getDimension(dimensionArg);
  if (!dimension) {
    return failFirewall(
      client,
      `Unknown dimension "${dimensionArg}". Dimensions: ${aliases}`,
      'firewall traffic'
    );
  }

  const inspectCmd = `firewall traffic inspect ${dimension.alias} ${cliToken(value)}`;
  const groupByArg =
    (parsed.flags['--group-by'] as string) ?? dimension.defaultGroupBy;
  const groupByDim = getDimension(groupByArg);
  if (!groupByDim) {
    return failFirewall(
      client,
      `Unknown --group-by dimension "${groupByArg}". Dimensions: ${aliases}`,
      inspectCmd
    );
  }
  if (groupByDim.alias === dimension.alias) {
    return failFirewall(
      client,
      `--group-by must differ from the inspect dimension (${dimension.alias}).`,
      inspectCmd
    );
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireFirewallTeam(client, org, 'Firewall traffic inspect');
  if (typeof teamId === 'number') return teamId;

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
      if (err instanceof AlertNotFoundError) {
        return failFirewall(
          client,
          err.message,
          'firewall alerts',
          AGENT_REASON.NOT_FOUND
        );
      }
      return failFirewallApi(client, err, {
        fallback: 'Failed to fetch firewall traffic',
        nextCommand: inspectCmd,
        permissionAction: 'query firewall traffic',
        projectName: project.name,
        timeoutJob: 'firewall traffic',
      });
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
    return failFirewall(
      client,
      err instanceof Error ? err.message : String(err),
      inspectCmd
    );
  }

  const top = (parsed.flags['--top'] as number) ?? DEFAULT_TOP;
  const rawFilters = (parsed.flags['--filter'] as string[] | undefined) ?? [];
  const userFilter = andFilters(...rawFilters);
  const entityFilter = andFilters(
    alertScope?.filter,
    eqFilter(dimension.field, value),
    userFilter
  );

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
      });
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
      })
    );
    const nextHints: Array<{ label: string; command: string }> = [];
    if (dimension.alias === 'ip') {
      const condition = JSON.stringify({
        type: 'ip_address',
        op: 'eq',
        value,
      });
      nextHints.push({
        label: 'Create rule',
        command: withGlobalFlags(
          client,
          `firewall rules add "Block ${value}" --condition ${cliToken(condition)} --action deny`
        ),
      });
    } else if (dimension.alias === 'rule') {
      const managedId = resolveManagedBotRuleId(value);
      nextHints.push({
        label: 'Edit rule',
        command: withGlobalFlags(
          client,
          `firewall rules edit ${cliToken(managedId ?? value)}`
        ),
      });
    } else if (dimension.alias === 'bot') {
      nextHints.push({
        label: 'Edit bot management',
        command: withGlobalFlags(client, 'firewall bot-management'),
      });
    }
    if (nextHints.length > 0) {
      output.print(
        `\n${nextHints.map(h => formatHintLine(h.label, h.command)).join('\n')}\n`
      );
    }
    const alertFlag = alertScope
      ? ` --alert ${cliToken(alertScope.alert.id)}`
      : '';
    const otherDims = dimensionAliases()
      .filter(a => a !== dimension.alias)
      .join('|');
    output.print(
      chalk.dim(
        `\n  Group by something else: \`vercel firewall traffic inspect ${dimension.alias} ${cliToken(value)} --group-by <${otherDims}>${alertFlag}\`\n\n`
      )
    );
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall traffic',
      nextCommand: inspectCmd,
      permissionAction: 'query firewall traffic',
      projectName: project.name,
      timeoutJob: 'firewall traffic',
    });
  } finally {
    output.stopSpinner();
  }
}
