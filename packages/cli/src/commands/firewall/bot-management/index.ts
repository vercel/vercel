import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { botManagementSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewallApi,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import { projectScope } from '../../../util/firewall/scope';
import { formatManagedBotRulesTable } from '../../../util/firewall/format';
import {
  getManagedBotRules,
  managedBotJson,
  suggestedManagedBotAction,
} from '../../../util/firewall/managed-bot-rules';
import { andFilters, getDimension } from '../../../util/firewall/dimensions';
import {
  isActivityTimeout,
  isRateLimited,
  isUnsupportedDimension,
  rateLimitRetrySeconds,
} from '../../../util/firewall/observability-query';
import { getTopList } from '../../../util/firewall/get-firewall-traffic';
import {
  formatTrafficTopList,
  toTopListRows,
  topListFetchCount,
  type TrafficTopList,
} from '../../../util/firewall/format-traffic';
import { apiServerMessage } from '../../../util/firewall/server-message';
import { DEFAULT_TRAFFIC_WINDOW_MS } from '../traffic/shared';
import { isAPIError } from '../../../util/errors-ts';

const UNKNOWN_BOT_TOP = 5;

function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

export default async function botManagement(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    botManagementSubcommand,
    client,
    'bot-management'
  );
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching bot management for ${chalk.bold(project.name)}`);

  try {
    const [{ active, draft }, unknownBotTraffic] = await Promise.all([
      listFirewallConfigs(client, projectScope(project, teamId)),
      teamId
        ? loadUnknownBotTraffic(client, project.id, teamId)
        : Promise.resolve(undefined),
    ]);
    const managed = getManagedBotRules(draft ?? active);

    if (parsed.flags['--json']) {
      outputJson(client, {
        managed: managed.map(managedBotJson),
        ...(unknownBotTraffic
          ? {
              unknownBotTraffic: {
                rows: unknownBotTraffic.rows,
                ...(unknownBotTraffic.unavailable
                  ? { unavailable: unknownBotTraffic.unavailable }
                  : {}),
                ...(unknownBotTraffic.retrySeconds
                  ? { retrySeconds: unknownBotTraffic.retrySeconds }
                  : {}),
              },
            }
          : {}),
      });
      return 0;
    }

    output.print(`\n${formatManagedBotRulesTable(managed)}\n`);
    if (unknownBotTraffic) {
      output.print(`\n${formatTrafficTopList(unknownBotTraffic)}\n`);
    }

    const steps: Array<readonly [string, string]> = managed.map(rule => {
      const action = suggestedManagedBotAction(rule);
      return [
        `Change ${rule.name}`,
        `firewall rules update ${rule.id} --action ${action}`,
      ] as const;
    });
    if (unknownBotTraffic && !unknownBotTraffic.unavailable) {
      steps.push([
        'Break unknown bot traffic down further',
        'firewall traffic inspect unknown-bot <category>',
      ]);
    }
    output.print(
      `\n  ${chalk.bold('Next steps:')}\n${steps
        .flatMap(([why, command]) => [
          chalk.dim(`  ${why}`),
          `  ${withGlobalFlags(client, command)}`,
        ])
        .join('\n')}\n\n`
    );
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch bot management',
      nextCommand: 'firewall bot-management',
      permissionAction: 'read firewall config',
      projectName: project.name,
      timeoutJob: 'bot management',
    });
  } finally {
    output.stopSpinner();
  }
}

/**
 * The dashboard's Unknown Bot Traffic card: request counts that did not pass
 * verification, grouped by BotID category, last 24 hours.
 *
 * A refusal is the panel, not the command — the managed rules still print.
 */
async function loadUnknownBotTraffic(
  client: Client,
  projectId: string,
  teamId: string
): Promise<TrafficTopList> {
  const dimension = getDimension('unknown-bot');
  const title = dimension?.widgetTitle ?? 'Unknown Bot Traffic';
  const unavailable = (error: unknown): TrafficTopList => ({
    dimension: 'unknown-bot',
    title,
    rows: [],
    unavailable: isActivityUnavailable(error)
      ? 'plan'
      : isUnsupportedDimension(error)
        ? 'filter'
        : isRateLimited(error)
          ? 'rate-limit'
          : isActivityTimeout(error)
            ? 'timeout'
            : 'error',
    retrySeconds: rateLimitRetrySeconds(error),
    message: isRateLimited(error) ? apiServerMessage(error) : undefined,
  });

  if (!dimension)
    return unavailable(new Error('unknown-bot dimension missing'));

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - DEFAULT_TRAFFIC_WINDOW_MS);
  try {
    const rows = await getTopList(client, {
      projectId,
      ownerId: teamId,
      startTime,
      endTime,
      metric: dimension.metric,
      groupBy: [dimension.field],
      filter: andFilters(dimension.excludeFilter, dimension.extraFilter),
      top: topListFetchCount(UNKNOWN_BOT_TOP),
    });
    return {
      dimension: dimension.alias,
      title,
      rows: toTopListRows(rows, dimension.field).slice(0, UNKNOWN_BOT_TOP),
    };
  } catch (e: unknown) {
    output.debug(
      isAPIError(e)
        ? `Unknown bot traffic query failed: status=${e.status} code=${e.code ?? '(none)'} message=${e.serverMessage}`
        : `Unknown bot traffic query failed: ${
            e instanceof Error ? e.message : String(e)
          }`
    );
    return unavailable(e);
  }
}
