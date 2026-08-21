import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { persistentActionsInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewall,
  failFirewallApi,
  requireFirewallTeam,
} from '../shared';
import { resolveTimeRange } from '../../../util/time-utils';
import { getFirewallEvents } from '../../../util/firewall/get-firewall-events';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import {
  attributePersistentActionRule,
  type AttributedPersistentActionRule,
} from '../../../util/firewall/attribute-persistent-action-rule';
import {
  DEFAULT_EVENTS_SINCE,
  formatEventDetailOutput,
  getPersistentActionInspectHints,
  isRedactedEvent,
  matchesEventFilters,
  parseEventTime,
  type EventActionFilter,
  type EventListFilters,
} from '../../../util/firewall/format-events';
import { andFilters, eqFilter } from '../../../util/firewall/dimensions';
import {
  getGroupedTimeseries,
  getTopList,
} from '../../../util/firewall/get-firewall-traffic';
import { AGENT_REASON } from '../../../util/agent-output-constants';
import { formatHintLine } from '../../../util/firewall/format-utils';
import type { FirewallActionRow } from '../../../util/firewall/types';

/** Dashboard persistent-action sheet chart pads the enforcement window by 15 minutes. */
const CHART_PADDING_MS = 900_000;
const DEFAULT_TOP_PATHS = 5;

function parseActionFilter(
  value: unknown
): EventActionFilter | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'challenge' || normalized === 'deny') return normalized;
  return null;
}

function findMatchingPersistentActions(
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

export default async function inspectPersistentAction(
  client: Client,
  argv: string[]
) {
  const parsed = await parseSubcommandArgs(
    argv,
    persistentActionsInspectSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const ip = parsed.args[0] as string | undefined;
  if (!ip) {
    return failFirewall(
      client,
      'Specify an IP address. Run `vercel firewall persistent-actions` to list them.',
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

  const topFlag = parsed.flags['--top'] as number | undefined;
  if (topFlag !== undefined && (!Number.isFinite(topFlag) || topFlag < 1)) {
    return failFirewall(
      client,
      "Couldn't use --top. Pass a positive number.",
      'firewall persistent-actions'
    );
  }
  const top = topFlag ?? DEFAULT_TOP_PATHS;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireFirewallTeam(client, org, 'Persistent actions inspect');
  if (typeof teamId === 'number') return teamId;

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
    ip,
    action,
    host: parsed.flags['--host'] as string | undefined,
  };

  try {
    output.spinner(`Looking up persistent actions for ${chalk.bold(ip)}`);
    const { actions } = await getFirewallEvents(client, {
      projectId: project.id,
      teamId,
      startTime,
      endTime,
    });

    const matches = findMatchingPersistentActions(actions, ip, filters);
    const persistentAction = matches[0];
    if (!persistentAction) {
      return failFirewall(
        client,
        `No persistent action found for IP "${ip}". Run \`vercel firewall persistent-actions\` to list them.`,
        'firewall persistent-actions',
        AGENT_REASON.NOT_FOUND
      );
    }
    if (isRedactedEvent(persistentAction)) {
      return failFirewall(
        client,
        'That persistent action is redacted on the Hobby plan. Upgrade or inspect a more recent one.',
        'firewall persistent-actions'
      );
    }

    const actionStart = parseEventTime(persistentAction.startTime) ?? startTime;
    const actionEnd = parseEventTime(persistentAction.endTime) ?? endTime;
    const chartStart = new Date(actionStart.getTime() - CHART_PADDING_MS);
    const chartEnd = new Date(actionEnd.getTime() + CHART_PADDING_MS);
    const actionFilter = andFilters(
      eqFilter('client_ip', persistentAction.public_ip),
      persistentAction.host
        ? eqFilter('request_hostname', persistentAction.host)
        : undefined
    );

    output.spinner(`Fetching request timeseries for ${chalk.bold(ip)}`);
    const timeseries = await getGroupedTimeseries(client, {
      ownerId: teamId,
      projectId: project.id,
      groupBy: ['waf_action'],
      filter: andFilters(actionFilter, "waf_action ne ''"),
      startTime: chartStart,
      endTime: chartEnd,
    });

    output.spinner(`Fetching top request paths for ${chalk.bold(ip)}`);
    const topPaths = await getTopList(client, {
      ownerId: teamId,
      projectId: project.id,
      groupBy: ['request_path'],
      filter: andFilters(actionFilter, "request_path ne ''"),
      startTime: actionStart,
      endTime: actionEnd,
      top,
    });

    let attributedRule: AttributedPersistentActionRule | undefined;
    if (persistentAction.action_type !== 'system-action') {
      output.spinner(`Attributing rule for ${chalk.bold(ip)}`);
      try {
        const wafAction =
          persistentAction.action === 'block'
            ? 'deny'
            : persistentAction.action;
        const [configList, ruleActivity] = await Promise.all([
          listFirewallConfigs(client, project.id, { teamId }),
          getTopList(client, {
            ownerId: teamId,
            projectId: project.id,
            groupBy: ['waf_rule_id'],
            filter: andFilters(
              actionFilter,
              eqFilter('waf_action', wafAction),
              "(waf_rule_id ne '')"
            ),
            startTime: actionStart,
            endTime: actionEnd,
            top: 50,
          }),
        ]);
        const config = configList.draft ?? configList.active;
        attributedRule = attributePersistentActionRule({
          actionType: persistentAction.action_type,
          publicIp: persistentAction.public_ip,
          customRules: config?.rules ?? [],
          ipRules: config?.ips ?? [],
          ruleActivity: ruleActivity.map(row => ({
            ruleId: row.values.waf_rule_id || '',
            total: row.total,
          })),
          config,
        });
      } catch {
        // Attribution is enrichment. Inspect still renders without a rule id.
      }
    }

    if (parsed.flags['--json']) {
      outputJson(client, {
        persistentAction,
        matchCount: matches.length,
        attributedRule: attributedRule ?? null,
        window: {
          start: actionStart.toISOString(),
          end: actionEnd.toISOString(),
          chartStart: chartStart.toISOString(),
          chartEnd: chartEnd.toISOString(),
        },
        filter: actionFilter ?? null,
        timeseries: {
          axis: timeseries.axis,
          groups: timeseries.groups.map(g => ({
            action: g.values.waf_action ?? g.key,
            total: g.total,
            series: g.series,
          })),
          granularity: timeseries.granularity,
        },
        topPaths: topPaths.map(row => ({
          path: row.values.request_path,
          total: row.total,
        })),
      });
      return 0;
    }

    output.print(
      formatEventDetailOutput({
        event: persistentAction,
        matchCount: matches.length,
        timeseries,
        topPaths,
        attributedRule,
      })
    );

    const hints = getPersistentActionInspectHints(
      persistentAction,
      template => withGlobalFlags(client, template),
      attributedRule
    );
    if (hints.length > 0) {
      output.print(
        `\n${hints.map(h => formatHintLine(h.label, h.command)).join('\n')}\n`
      );
    }
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch persistent action',
      nextCommand: 'firewall persistent-actions',
      permissionAction: 'read persistent actions',
      projectName: project.name,
      timeoutJob: 'persistent actions',
    });
  } finally {
    output.stopSpinner();
  }
}
