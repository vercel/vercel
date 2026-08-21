import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { overviewSubcommand } from './command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  requireFirewallTeam,
  failFirewallApi,
} from './shared';
import getFirewallMetrics from '../../util/firewall/get-firewall-metrics';
import { getFirewallAlerts } from '../../util/firewall/get-firewall-alerts';
import {
  formatOverviewOutput,
  flattenOverviewHints,
  getOverviewSectionHints,
  OVERVIEW_TOP_RULES,
  type OverviewRuleRow,
} from '../../util/firewall/format-overview';
import { getTopList } from '../../util/firewall/get-firewall-traffic';
import { getDimension } from '../../util/firewall/dimensions';
import { resolveRuleDisplayName } from '../../util/firewall/rule-names';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import getBypass from '../../util/firewall/get-bypass';
import {
  formatStatusOutput,
  getBotProtectionConfig,
  owaspJsonStatus,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { fetchPlanInfo } from '../../util/firewall/interactive-helpers';
import type { ProjectSecurityResponse } from '../../util/firewall/types';

export default async function overview(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, overviewSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = requireFirewallTeam(client, org, 'Firewall overview');
  if (typeof teamId === 'number') return teamId;

  try {
    // Sequential steps on purpose: concurrent auth/SAML retries on first run
    // can appear to hang, and progressive spinner text shows which step is
    // slow.
    output.spinner(`Fetching firewall config for ${chalk.bold(project.name)}`);
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    output.spinner(`Fetching firewall status for ${chalk.bold(project.name)}`);
    const [bypassList, freshProject, planInfo] = await Promise.all([
      getBypass(client, project.id, { teamId }),
      client.fetch<ProjectSecurityResponse>(
        `/v9/projects/${encodeURIComponent(project.id)}`,
        { accountId: teamId }
      ),
      fetchPlanInfo(client),
    ]);
    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };

    output.spinner(`Fetching firewall metrics for ${chalk.bold(project.name)}`);
    const metrics = await getFirewallMetrics(client, {
      projectId: project.id,
      ownerId: teamId,
    });

    output.spinner(`Fetching traffic by rule for ${chalk.bold(project.name)}`);
    const ruleDim = getDimension('rule');
    const topRules = await getTopList(client, {
      ownerId: teamId,
      projectId: project.id,
      groupBy: [ruleDim?.field ?? 'waf_rule_id'],
      filter: ruleDim?.excludeFilter,
      startTime: new Date(metrics.startTime),
      endTime: new Date(metrics.endTime),
      top: OVERVIEW_TOP_RULES,
    });
    const rules: OverviewRuleRow[] = topRules.map(row => {
      const id = row.values.waf_rule_id || '';
      return {
        id,
        name: resolveRuleDisplayName(id, active),
        total: row.total,
      };
    });

    output.spinner(`Fetching firewall alerts for ${chalk.bold(project.name)}`);
    const alerts = await getFirewallAlerts(client, {
      projectId: project.id,
      teamId,
      sinceDays: 1,
    });

    const windowStart = new Date(metrics.startTime).getTime();
    const windowEnd = new Date(metrics.endTime).getTime();
    const annotations = alerts.all.filter(
      a => a.startedAt >= windowStart && a.startedAt <= windowEnd
    );
    const suggest = (template: string) => withGlobalFlags(client, template);
    const next = flattenOverviewHints(
      getOverviewSectionHints({
        series: metrics.series,
        rules,
        annotations,
        suggest,
      })
    );

    if (parsed.flags['--json']) {
      const botProtection = getBotProtectionConfig(active?.managedRules);
      const aiBots = active?.managedRules?.ai_bots;
      const owasp = active?.managedRules?.owasp;
      outputJson(client, {
        // Config summary; run `firewall status --json` for the full config.
        status: {
          firewallEnabled: active?.firewallEnabled ?? false,
          attackMode,
          botProtection: {
            enabled: botProtection?.active ?? false,
            action: botProtection?.action ?? null,
          },
          aiBots: {
            enabled: aiBots?.active ?? false,
            action: aiBots?.action ?? null,
          },
          owasp: owaspJsonStatus(owasp, planInfo),
        },
        period: {
          start: metrics.startTime,
          end: metrics.endTime,
          granularity: metrics.granularity,
        },
        stats: {
          attacksMitigated: alerts.attacksMitigated,
          ...metrics.totals,
        },
        series: metrics.series,
        rules,
        annotations,
        next,
      });
      return 0;
    }

    output.print('\n');
    output.print(
      formatStatusOutput(active, draft, bypassList.result, attackMode, planInfo)
    );
    output.print('\n\n');
    output.print(
      formatOverviewOutput({
        series: metrics.series,
        attacksMitigated: alerts.attacksMitigated,
        annotations,
        rules,
        startTime: metrics.startTime,
        endTime: metrics.endTime,
        granularity: metrics.granularity,
        suggest,
      })
    );

    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall overview',
      nextCommand: 'firewall overview',
      permissionAction: 'query firewall metrics',
      projectName: project.name,
      timeoutJob: 'firewall overview',
    });
  } finally {
    output.stopSpinner();
  }
}
