import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { eventsSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
import { resolveTimeRange } from '../../util/time-utils';
import { getFirewallEvents } from '../../util/firewall/get-firewall-events';
import {
  DEFAULT_EVENTS_LIMIT,
  DEFAULT_EVENTS_SINCE,
  formatEventsOutput,
  hasEventFilters,
  matchesEventFilters,
  type EventActionFilter,
  type EventListFilters,
  type EventTypeFilter,
} from '../../util/firewall/format-events';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { isAPIError } from '../../util/errors-ts';

function parseTypeFilter(value: unknown): EventTypeFilter | undefined | number {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'system' || normalized === 'customer') return normalized;
  output.error(
    "Couldn't filter by type. Use --type system or --type customer."
  );
  return 1;
}

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

export default async function events(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, eventsSubcommand, client);
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
      'Firewall events require a team scope. Run `vercel switch` to select a team.';
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

  const type = parseTypeFilter(parsed.flags['--type']);
  if (typeof type === 'number') return type;
  const action = parseActionFilter(parsed.flags['--action']);
  if (typeof action === 'number') return action;

  const limitFlag = parsed.flags['--limit'] as number | undefined;
  if (
    limitFlag !== undefined &&
    (!Number.isFinite(limitFlag) || limitFlag < 1)
  ) {
    output.error("Couldn't use --limit. Pass a positive number.");
    return 1;
  }
  const limit = limitFlag ?? DEFAULT_EVENTS_LIMIT;

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
    type,
    action,
    ip: parsed.flags['--ip'] as string | undefined,
    host: parsed.flags['--host'] as string | undefined,
    search: parsed.flags['--search'] as string | undefined,
  };

  output.spinner(`Fetching firewall events for ${chalk.bold(project.name)}`);

  try {
    const { actions } = await getFirewallEvents(client, {
      projectId: project.id,
      teamId: org.id,
      startTime,
      endTime,
    });

    const filtered = actions.filter(row => matchesEventFilters(row, filters));
    const visible = filtered.slice(0, limit);

    if (parsed.flags['--json']) {
      outputJson(client, {
        actions: visible,
        total: filtered.length,
        period: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
      });
      return 0;
    }

    output.print(
      formatEventsOutput({
        actions: visible,
        total: filtered.length,
        since: (parsed.flags['--since'] as string) ?? DEFAULT_EVENTS_SINCE,
        filtered: hasEventFilters(filters),
        limit,
        suggest: template => withGlobalFlags(client, template),
      })
    );
    return 0;
  } catch (e: unknown) {
    let msg =
      e instanceof Error ? e.message : 'Failed to fetch firewall events';
    if (isAPIError(e) && (e.status === 401 || e.status === 403)) {
      msg =
        'You do not have permission to read firewall events for this project. Check team access and try again.';
    }
    if (
      e instanceof Error &&
      (e.name === 'TimeoutError' || e.name === 'AbortError')
    ) {
      msg =
        'Timed out waiting for firewall events. Re-run the command — the next try is usually faster.';
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
