import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { overviewSubcommand } from './command';
import { parseSubcommandArgs, outputJson, failFirewallApi } from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import { projectScope } from '../../util/firewall/scope';
import getBypass from '../../util/firewall/get-bypass';
import { fetchPlanInfo } from '../../util/firewall/interactive-helpers';
import getFirewallMetrics, {
  isActivityTimeout,
} from '../../util/firewall/get-firewall-metrics';
import {
  FIREWALL_ACTIVITY_PLAN_MESSAGE,
  alertOverlapsWindow,
  alertsIncompleteMessage,
  countAttacksMitigated,
  getFirewallAlertsDetailed,
} from '../../util/firewall/get-firewall-alerts';
import {
  getTopList,
  RULE_ID_DIMENSION,
  RULE_TRAFFIC_FILTER,
} from '../../util/firewall/get-firewall-traffic';
import { resolveRuleDisplayName } from '../../util/firewall/rule-names';
import {
  formatOverviewOutput,
  OVERVIEW_TOP_RULES,
  type OverviewRuleRow,
} from '../../util/firewall/format-overview';
import {
  formatStatusOutput,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { isAPIError } from '../../util/errors-ts';
import {
  readBypassResult,
  resolveFirewallEntitlements,
} from '../../util/firewall/plan-gate';
import type {
  FirewallConfigResponse,
  ProjectSecurityResponse,
} from '../../util/firewall/types';

/**
 * Whether the activity window is unavailable to this account rather than
 * broken. Observability answers 402 when the plan lacks Observability Plus.
 *
 * Deliberately narrow, matching `plan-gate.ts`: 403 means the user lacks
 * access and 404 means the resource is missing. Reporting either as an upsell
 * would bury a failure the caller can do something about.
 */
function isActivityUnavailable(error: unknown): boolean {
  return isAPIError(error) && error.status === 402;
}

/** Why the activity block is missing, when it is missing for a known reason. */
interface ActivityIssue {
  reason: 'plan' | 'timeout';
  message: string;
}

/**
 * A timeout costs the caller the configuration block too if it propagates,
 * so report it and keep the rest. The activity queries scan the whole window
 * and a day of a busy project can exceed what the warehouse will spend, but a
 * timeout can equally be load at the time, so the message does not guess
 * which.
 */
function activityIssue(error: unknown): ActivityIssue | undefined {
  if (isActivityUnavailable(error)) {
    return { reason: 'plan', message: FIREWALL_ACTIVITY_PLAN_MESSAGE };
  }
  if (isActivityTimeout(error)) {
    return {
      reason: 'timeout',
      message: 'Traffic and alerts timed out.',
    };
  }
  return undefined;
}

/** Return a settled result's value, rethrowing if it rejected. */
function unwrap<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}

/** The activity block reports the past day. */
const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch the activity window shown beneath the configuration block: traffic
 * totals, the busiest rules, and alerts raised in the same period.
 *
 * The window is fixed here, before anything is sent, so all three queries
 * cover the same period and none has to wait on another to learn it. Both
 * observability queries are cold-cache slow, so running them together rather
 * than back to back is most of the command's wall clock.
 */
async function fetchActivity(
  client: Client,
  projectId: string,
  teamId: string,
  active: FirewallConfigResponse | null
) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - ACTIVITY_WINDOW_MS);

  output.spinner('Fetching firewall activity');
  const [metrics, alertsResult, topRules] = await Promise.all([
    getFirewallMetrics(client, {
      projectId,
      ownerId: teamId,
      startTime,
      endTime,
    }),
    getFirewallAlertsDetailed(client, { projectId, teamId, sinceDays: 1 }),
    getTopList(client, {
      ownerId: teamId,
      projectId,
      groupBy: [RULE_ID_DIMENSION],
      filter: RULE_TRAFFIC_FILTER,
      startTime,
      endTime,
      top: OVERVIEW_TOP_RULES,
    }),
  ]);

  const rules: OverviewRuleRow[] = topRules.map(row => {
    const id = row.values[RULE_ID_DIMENSION] || '';
    return { id, name: resolveRuleDisplayName(id, active), total: row.total };
  });

  // Alerts open at any point in the window, by the same rule the attack count
  // uses. Listing only the ones raised inside it would drop an attack that
  // began earlier and is still running — the row a reader most wants — while
  // still counting it above.
  const windowStart = startTime.getTime();
  const windowEnd = endTime.getTime();
  const annotations = alertsResult.alerts.filter(a =>
    alertOverlapsWindow(a, windowStart, windowEnd)
  );

  return {
    metrics,
    rules,
    annotations,
    attacksMitigated: countAttacksMitigated(
      alertsResult.alerts,
      windowStart,
      windowEnd
    ),
    // A source that could not be read leaves the count above a floor. Carried
    // out so both output modes can say so rather than presenting it as a
    // total.
    alertsUnavailable:
      alertsResult.errors.length > 0
        ? {
            sources: alertsResult.errors.map(e => e.source),
            message: alertsIncompleteMessage(alertsResult.errors),
          }
        : undefined,
  };
}

export default async function overview(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, overviewSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const asJson = Boolean(parsed.flags['--json']);
  const suggestedCommand = `firewall overview${asJson ? ' --json' : ''}`;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall overview for ${chalk.bold(project.name)}`);

  try {
    const [configResult, bypassResult, projectResult, planResult] =
      await Promise.allSettled([
        listFirewallConfigs(client, projectScope(project, teamId)),
        getBypass(client, project.id, { teamId }),
        client.fetch<ProjectSecurityResponse>(
          `/v9/projects/${encodeURIComponent(project.id)}`,
          { accountId: teamId }
        ),
        // Only decides how the OWASP row is labelled; defaults on its own errors.
        fetchPlanInfo(client),
      ]);

    // The firewall config and project are required to render anything
    // meaningful, so their failures remain fatal.
    const { active, draft } = unwrap(configResult);
    const freshProject = unwrap(projectResult);

    // Bypass is plan-gated. When it is unavailable the rest of the overview is
    // still useful, so degrade to `null` rather than failing the command.
    const { bypass, unavailable: bypassUnavailable } =
      readBypassResult(bypassResult);

    // A plan-info failure must not fail the command; it only affects a label.
    // The project can carry Security+ on its own, so the team's view of the
    // entitlement is not the whole answer.
    const planInfo = resolveFirewallEntitlements(
      planResult.status === 'fulfilled' ? planResult.value : undefined,
      freshProject
    );

    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };

    // Traffic, rule attribution and alerts are team-scoped analytics, so a
    // personal account still gets the configuration block without them.
    let activity: Awaited<ReturnType<typeof fetchActivity>> | null = null;
    let activityIssueFound: ActivityIssue | undefined;
    if (teamId) {
      try {
        activity = await fetchActivity(client, project.id, teamId, active);
      } catch (e) {
        // The configuration block is still worth printing on its own, so an
        // account that cannot query traffic gets the overview without it.
        const issue = activityIssue(e);
        if (!issue) throw e;
        activityIssueFound = issue;
      }
    }
    if (asJson) {
      outputJson(client, {
        active,
        draft,
        bypass,
        ...(bypassUnavailable ? { bypassUnavailable } : {}),
        attackMode,
        period: activity
          ? {
              start: activity.metrics.startTime,
              end: activity.metrics.endTime,
              granularity: activity.metrics.granularity,
            }
          : null,
        stats: activity
          ? {
              attacksMitigated: activity.attacksMitigated,
              ...activity.metrics.totals,
            }
          : null,
        // Each series' `total` is already in `stats`, keyed by the same
        // action, so emitting it here would put the same number in the
        // payload twice with two chances to disagree. The terminal chart
        // still reads it off the metrics result.
        series:
          activity?.metrics.series.map(({ action, timeseries }) => ({
            action,
            timeseries,
          })) ?? null,
        // `rules` in `firewall status --json` is a count summary. Naming the
        // traffic rows differently keeps one key from meaning two shapes
        // across the command family.
        topRules: activity?.rules ?? null,
        annotations: activity?.annotations ?? null,
        // Without this an agent cannot tell a plan-gated activity window from
        // a personal account or from a genuinely quiet one: all three leave
        // the fields above null.
        ...(activityIssueFound
          ? { activityUnavailable: activityIssueFound }
          : {}),
        // Distinct from `activityUnavailable`, which covers traffic: the
        // activity block is present here, but `stats.attacksMitigated` and
        // `annotations` were drawn from a source that did not answer.
        ...(activity?.alertsUnavailable
          ? { alertsUnavailable: activity.alertsUnavailable }
          : {}),
      });
      return 0;
    }

    output.print('\n');
    output.print(
      formatStatusOutput({
        active,
        draft,
        bypass,
        attackMode,
        planInfo,
        firewallBypassIps: freshProject.security?.firewallBypassIps,
      })
    );
    output.print('\n\n');
    if (activityIssueFound) {
      output.print(`  ${chalk.dim(activityIssueFound.message)}\n`);
    }
    if (activity) {
      output.print(
        formatOverviewOutput({
          series: activity.metrics.series,
          attacksMitigated: activity.attacksMitigated,
          attacksMitigatedIncomplete: Boolean(activity.alertsUnavailable),
          annotations: activity.annotations,
          rules: activity.rules,
          startTime: activity.metrics.startTime,
          endTime: activity.metrics.endTime,
          granularity: activity.metrics.granularity,
        })
      );
    }
    if (activity?.alertsUnavailable) {
      output.print(`  ${chalk.dim(activity.alertsUnavailable.message)}\n`);
    }

    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall overview',
      nextCommand: suggestedCommand,
      permissionAction: 'read firewall configuration',
      projectName: project.name,
      timeoutJob: 'firewall overview',
    });
  }
}
