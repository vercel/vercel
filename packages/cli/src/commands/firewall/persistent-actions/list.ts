import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { persistentActionsSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  requireFirewallTeam,
  failFirewall,
  failFirewallApi,
} from '../shared';
import { resolveTimeRange } from '../../../util/time-utils';
import { getFirewallEvents } from '../../../util/firewall/get-firewall-events';
import {
  DEFAULT_EVENTS_LIMIT,
  DEFAULT_EVENTS_SINCE,
  formatEventsOutput,
  hasEventFilters,
  matchesEventFilters,
  type EventActionFilter,
  type EventListFilters,
  type EventTypeFilter,
} from '../../../util/firewall/format-events';

function parseTypeFilter(value: unknown): EventTypeFilter | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'system' || normalized === 'customer') return normalized;
  return null;
}

function parseActionFilter(
  value: unknown
): EventActionFilter | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'challenge' || normalized === 'deny') return normalized;
  return null;
}

export default async function listPersistentActions(
  client: Client,
  argv: string[]
) {
  const parsed = await parseSubcommandArgs(
    argv,
    persistentActionsSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireFirewallTeam(client, org, 'Persistent actions');
  if (typeof teamId === 'number') return teamId;

  const type = parseTypeFilter(parsed.flags['--type']);
  if (type === null) {
    return failFirewall(
      client,
      "Couldn't filter by type. Use --type system or --type customer.",
      'firewall persistent-actions'
    );
  }
  const action = parseActionFilter(parsed.flags['--action']);
  if (action === null) {
    return failFirewall(
      client,
      "Couldn't filter by action. Use --action challenge or --action deny.",
      'firewall persistent-actions'
    );
  }

  const limitFlag = parsed.flags['--limit'] as number | undefined;
  if (
    limitFlag !== undefined &&
    (!Number.isFinite(limitFlag) || limitFlag < 1)
  ) {
    return failFirewall(
      client,
      "Couldn't use --limit. Pass a positive number.",
      'firewall persistent-actions'
    );
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
    return failFirewall(
      client,
      err instanceof Error ? err.message : String(err),
      'firewall persistent-actions'
    );
  }

  const filters: EventListFilters = {
    type,
    action,
    ip: parsed.flags['--ip'] as string | undefined,
    host: parsed.flags['--host'] as string | undefined,
    search: parsed.flags['--search'] as string | undefined,
  };

  output.spinner(`Fetching persistent actions for ${chalk.bold(project.name)}`);

  try {
    const { actions } = await getFirewallEvents(client, {
      projectId: project.id,
      teamId,
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
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch persistent actions',
      nextCommand: 'firewall persistent-actions',
      permissionAction: 'read persistent actions',
      projectName: project.name,
      timeoutJob: 'persistent actions',
    });
  } finally {
    output.stopSpinner();
  }
}
