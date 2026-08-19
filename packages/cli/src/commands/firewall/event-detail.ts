import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import cmd from '../../util/output/cmd';
import { eventDetailSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import { resolveTimeRange } from '../../util/time-utils';
import { getFirewallEvents } from '../../util/firewall/get-firewall-events';
import {
  DEFAULT_EVENTS_SINCE,
  formatEventDetailOutput,
  getEventHints,
  isRedactedEvent,
  matchesEventFilters,
  parseEventTime,
  type EventActionFilter,
  type EventListFilters,
} from '../../util/firewall/format-events';
import { andFilters, eqFilter } from '../../util/firewall/dimensions';
import {
  getGroupedTimeseries,
  getTopList,
} from '../../util/firewall/get-firewall-traffic';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';
import type { FirewallActionRow } from '../../util/firewall/types';

/** Dashboard event-sheet chart pads the enforcement window by 15 minutes. */
const CHART_PADDING_MS = 900_000;
const DEFAULT_TOP_PATHS = 5;

function parseActionFilter(
  value: unknown
): EventActionFilter | undefined | number {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'challenge' || normalized === 'deny') return normalized;
  output.error(
    "Couldn't filter by action. Use --action challenge or --action deny."
  );
  return 1;
}

function findMatchingEvents(
  actions: FirewallActionRow[],
  ip: string,
  filters: EventListFilters
): FirewallActionRow[] {
  const matches = actions.filter(row => matchesEventFilters(row, filters));
  const exact = matches.filter(
    row => row.public_ip.toLowerCase() === ip.toLowerCase()
  );
  return exact.length > 0 ? exact : matches;
}

export default async function eventDetail(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, eventDetailSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const fail = (
    msg: string,
    nextCommand: string,
    reason = AGENT_REASON.INVALID_ARGUMENTS
  ) => {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason,
        message: msg,
        next: [{ command: withGlobalFlags(client, nextCommand) }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  };

  const ip = parsed.args[0] as string | undefined;
  if (!ip) {
    return fail(
      'Specify an IP address. Run `vercel firewall events` to list events.',
      'firewall events'
    );
  }

  const action = parseActionFilter(parsed.flags['--action']);
  if (typeof action === 'number') return action;

  const topFlag = parsed.flags['--top'] as number | undefined;
  if (topFlag !== undefined && (!Number.isFinite(topFlag) || topFlag < 1)) {
    output.error("Couldn't use --top. Pass a positive number.");
    return 1;
  }
  const top = topFlag ?? DEFAULT_TOP_PATHS;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  if (org.type !== 'team') {
    return fail(
      'Firewall event detail requires a team scope. Run `vercel switch` to select a team.',
      'switch'
    );
  }

  let startTime: Date;
  let endTime: Date;
  try {
    ({ startTime, endTime } = resolveTimeRange(
      (parsed.flags['--since'] as string) ?? DEFAULT_EVENTS_SINCE,
      parsed.flags['--until'] as string | undefined
    ));
  } catch (err) {
    output.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const filters: EventListFilters = {
    ip,
    action,
    host: parsed.flags['--host'] as string | undefined,
  };

  try {
    output.spinner(`Looking up firewall events for ${chalk.bold(ip)}`);
    const { actions } = await getFirewallEvents(client, {
      projectId: project.id,
      teamId: org.id,
      startTime,
      endTime,
    });

    const matches = findMatchingEvents(actions, ip, filters);
    const event = matches[0];
    if (!event) {
      return fail(
        `No firewall event found for IP "${ip}". Run \`vercel firewall events\` to list events.`,
        'firewall events',
        AGENT_REASON.NOT_FOUND
      );
    }
    if (isRedactedEvent(event)) {
      return fail(
        'That event is redacted on the Hobby plan. Upgrade or inspect a more recent event.',
        'firewall events'
      );
    }

    const eventStart = parseEventTime(event.startTime) ?? startTime;
    const eventEnd = parseEventTime(event.endTime) ?? endTime;
    const chartStart = new Date(eventStart.getTime() - CHART_PADDING_MS);
    const chartEnd = new Date(eventEnd.getTime() + CHART_PADDING_MS);
    const eventFilter = andFilters(
      eqFilter('client_ip', event.public_ip),
      event.host ? eqFilter('request_hostname', event.host) : undefined
    );

    output.spinner(`Fetching request timeseries for ${chalk.bold(ip)}`);
    const timeseries = await getGroupedTimeseries(client, {
      ownerId: org.id,
      projectId: project.id,
      groupBy: ['waf_action'],
      filter: andFilters(eventFilter, "waf_action ne ''"),
      startTime: chartStart,
      endTime: chartEnd,
    }).catch(() => null);

    output.spinner(`Fetching top request paths for ${chalk.bold(ip)}`);
    const topPaths = await getTopList(client, {
      ownerId: org.id,
      projectId: project.id,
      groupBy: ['request_path'],
      filter: andFilters(eventFilter, "request_path ne ''"),
      startTime: eventStart,
      endTime: eventEnd,
      top,
    }).catch(() => []);

    if (parsed.flags['--json']) {
      outputJson(client, {
        event,
        matchCount: matches.length,
        window: {
          start: eventStart.toISOString(),
          end: eventEnd.toISOString(),
          chartStart: chartStart.toISOString(),
          chartEnd: chartEnd.toISOString(),
        },
        filter: eventFilter ?? null,
        timeseries: timeseries
          ? {
              axis: timeseries.axis,
              groups: timeseries.groups.map(g => ({
                action: g.values.waf_action ?? g.key,
                total: g.total,
                series: g.series,
              })),
              granularity: timeseries.granularity,
            }
          : null,
        topPaths: topPaths.map(row => ({
          path: row.values.request_path,
          total: row.total,
        })),
      });
      return 0;
    }

    output.print(
      formatEventDetailOutput({
        event,
        matchCount: matches.length,
        timeseries,
        topPaths,
      })
    );

    const hints = getEventHints(event, template =>
      withGlobalFlags(client, template)
    );
    if (hints?.traffic) {
      const label = (s: string) => chalk.dim(s.padEnd(8));
      output.print(`\n  ${label('Traffic')}${cmd(hints.traffic)}\n`);
    }
    return 0;
  } catch (e: unknown) {
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall event detail';
    if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
      msg =
        'You do not have permission to read firewall events for this project. Check team access and try again.';
    }
    if (
      e instanceof Error &&
      (e.name === 'TimeoutError' || e.name === 'AbortError')
    ) {
      msg =
        'Timed out waiting for firewall event detail. Re-run the command — the next try is usually faster.';
    }
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall events') }],
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
