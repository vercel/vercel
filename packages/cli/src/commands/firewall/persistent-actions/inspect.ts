import { isIP } from 'node:net';
import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { persistentActionsInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewall,
  failFirewallApi,
} from '../shared';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import { FIREWALL_ACTIVITY_PLAN_MESSAGE } from '../../../util/firewall/get-firewall-alerts';
import {
  fetchFirewallPersistentActions,
  PATH_DIMENSION,
  toPersistentAction,
  persistentActionFilter,
  type FirewallEventAction,
  apiTimestampMs,
} from '../../../util/firewall/get-firewall-events';
import getFirewallMetrics from '../../../util/firewall/get-firewall-metrics';
import { getTopList } from '../../../util/firewall/get-firewall-traffic';
import {
  formatPersistentActionInspect,
  persistentActionWindow,
} from '../../../util/firewall/format-persistent-actions';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { isAPIError } from '../../../util/errors-ts';
import {
  validateTimeBound,
  validateTimeOrder,
} from '../../../util/command-validation';
import type { Granularity } from '../../../commands/metrics/types';

const TOP_PATHS = 8;

/**
 * Floor on the traffic window, matched to the finest granularity `inspect`
 * asks for. The observability API rejects `startTime >= endTime` outright, and
 * clamping an active action's projected expiry to now can land exactly there.
 */
const MIN_TRAFFIC_WINDOW_MS = 60_000;

function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

function inspectGranularity(from: Date, to: Date): Granularity {
  const hours = (to.getTime() - from.getTime()) / 3_600_000;
  if (hours <= 3) return { minutes: 1 };
  if (hours <= 24) return { minutes: 5 };
  return { hours: 1 };
}

function matchesInspectFilters(
  action: FirewallEventAction,
  opts: { ip: string; host?: string; action?: string }
): boolean {
  if (action.public_ip !== opts.ip) return false;
  if (opts.host && action.host !== opts.host) return false;
  // `--action` takes a mitigation (challenge, deny), which lives in `action`.
  // Matched against `action_type` it compared against the rule kind and so
  // never matched anything the flag documents.
  if (opts.action && action.action !== opts.action) return false;
  return true;
}

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    persistentActionsInspectSubcommand,
    client,
    'persistent-actions inspect'
  );
  if (typeof parsed === 'number') return parsed;

  const ip = parsed.args[0];
  if (!ip) {
    return failFirewall(client, {
      message: `IP is required. Usage: ${withGlobalFlags(client, 'firewall persistent-actions inspect <ip>')}`,
      nextCommand: 'firewall persistent-actions inspect <ip>',
      reason: AGENT_REASON.MISSING_ARGUMENTS,
    });
  }
  if (!isIP(ip)) {
    return failFirewall(client, {
      message: `Please enter a valid IP address.`,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const sinceResult = validateTimeBound(parsed.flags['--since']);
  if (!sinceResult.valid) {
    return failFirewall(client, {
      message: sinceResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const untilResult = validateTimeBound(parsed.flags['--until']);
  if (!untilResult.valid) {
    return failFirewall(client, {
      message: untilResult.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }
  const order = validateTimeOrder(sinceResult.value, untilResult.value);
  if (!order.valid) {
    return failFirewall(client, {
      message: order.message,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    });
  }

  const { from, to } = persistentActionWindow(
    sinceResult.value,
    untilResult.value
  );
  const host = parsed.flags['--host'] as string | undefined;
  const actionFilter = parsed.flags['--action'] as string | undefined;

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
        'Firewall persistent actions need a team. Run `vercel switch` to select a team or pass --scope <team>.',
      reason: AGENT_REASON.MISSING_SCOPE,
    });
  }

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall persistent-actions inspect ${ip}${asJson ? ' --json' : ''}`;

  output.spinner(`Fetching persistent action ${chalk.bold(ip)}`);

  try {
    const actions = await fetchFirewallPersistentActions(client, {
      projectId: project.id,
      teamId,
      startTime: from,
      endTime: to,
      host,
    });
    const matches = actions.filter(action =>
      matchesInspectFilters(action, { ip, host, action: actionFilter })
    );
    const selected = matches[0];
    if (!selected) {
      return failFirewall(client, {
        message: `No persistent action found for "${ip}". Run ${withGlobalFlags(client, 'firewall persistent-actions list')} to view recent actions.`,
        nextCommand: 'firewall persistent-actions list',
        reason: AGENT_REASON.NOT_FOUND,
      });
    }

    output.spinner(`Fetching traffic for ${chalk.bold(ip)}`);

    // Scoped to the action being shown, not the window searched for it.
    // `--since`/`--until` choose which actions are candidates; querying
    // traffic across all of that described a different thing from the rows
    // above — with two matching actions in the window the chart covered both,
    // plus any traffic from this IP outside either. It is also far less to
    // scan: an action lasts minutes where the search window defaults to an
    // hour.
    const actionStart = new Date(apiTimestampMs(selected.startTime));
    const actionEnd = new Date(
      Math.max(
        // An active action's `endTime` is a projected expiry, so it would add
        // empty future buckets to the chart.
        Math.min(apiTimestampMs(selected.endTime), Date.now()),
        // An action that started a moment ago clamps to a window of nothing,
        // and a clock behind the server's to one that runs backwards. Both
        // are rejected, so keep a bucket of it either way.
        actionStart.getTime() + MIN_TRAFFIC_WINDOW_MS
      )
    );

    const wantPaths = Boolean(parsed.flags['--paths']);

    const filter = persistentActionFilter({
      ip: selected.public_ip,
      host: selected.host,
    });
    const pathsFilter = persistentActionFilter({
      ip: selected.public_ip,
      host: selected.host,
      withPath: true,
    });
    const [metrics, paths] = await Promise.all([
      getFirewallMetrics(client, {
        projectId: project.id,
        ownerId: teamId,
        startTime: actionStart,
        endTime: actionEnd,
        granularity: inspectGranularity(actionStart, actionEnd),
        filter,
      }).catch(err => {
        if (isActivityUnavailable(err)) return null;
        throw err;
      }),
      // Grouping by path is the slowest query the firewall commands make —
      // several times the cost of everything else here put together, and the
      // window barely moves it, because the price is the dimension's
      // cardinality. Opt in rather than pay it on every inspect.
      wantPaths
        ? getTopList(client, {
            projectId: project.id,
            ownerId: teamId,
            startTime: actionStart,
            endTime: actionEnd,
            groupBy: [PATH_DIMENSION],
            filter: pathsFilter,
            top: TOP_PATHS,
          }).catch(err => {
            if (isActivityUnavailable(err)) return null;
            throw err;
          })
        : Promise.resolve(null),
    ]);

    const pathRows = paths?.map(row => ({
      name: row.values[PATH_DIMENSION] || '/',
      count: row.total,
    }));

    if (asJson) {
      outputJson(client, {
        // The same mapped shape `persistent-actions list` reports, so a
        // caller can read one row from either command. `action` here was the
        // rule kind, not the mitigation.
        action: toPersistentAction(selected),
        matchCount: matches.length,
        series: metrics?.series ?? null,
        // Omitted when not requested, so an agent can tell that apart from a
        // query that ran and found nothing.
        ...(wantPaths ? { paths: pathRows ?? null } : {}),
        ...(!metrics
          ? {
              activityUnavailable: {
                reason: 'plan' as const,
                message: FIREWALL_ACTIVITY_PLAN_MESSAGE,
              },
            }
          : {}),
      });
      return 0;
    }

    output.print(
      `\n${formatPersistentActionInspect({
        action: selected,
        matchCount: matches.length,
        series: metrics?.series,
        paths: pathRows,
        pathsAvailable: !wantPaths,
      })}`
    );
    if (!metrics) {
      output.print(`  ${FIREWALL_ACTIVITY_PLAN_MESSAGE}\n`);
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
      fallback: 'Failed to fetch persistent firewall action',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall persistent actions',
      projectName: project.name,
      timeoutJob: 'firewall persistent action',
    });
  }
}
