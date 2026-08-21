import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { statusSubcommand } from './command';
import {
  parseSubcommandArgs,
  outputJson,
  failFirewall,
  failFirewallApi,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import getBypass from '../../util/firewall/get-bypass';
import {
  formatStatusOutput,
  getBotProtectionConfig,
  owaspJsonStatus,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { fetchPlanInfo } from '../../util/firewall/interactive-helpers';
import { formatGraphOutput } from '../../util/firewall/format-graph';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type { ProjectSecurityResponse } from '../../util/firewall/types';

export default async function status(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, statusSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  if (parsed.flags['--json'] && parsed.flags['--graph']) {
    return failFirewall(
      client,
      'Cannot use --json and --graph together. Pick one.',
      'firewall status --json',
      AGENT_REASON.INVALID_ARGUMENTS
    );
  }

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall status for ${chalk.bold(project.name)}`);

  try {
    const [configList, bypassList, freshProject, planInfo] = await Promise.all([
      listFirewallConfigs(client, project.id, { teamId }),
      getBypass(client, project.id, { teamId }),
      client.fetch<ProjectSecurityResponse>(
        `/v9/projects/${encodeURIComponent(project.id)}`,
        { accountId: teamId }
      ),
      fetchPlanInfo(client),
    ]);

    const { active, draft } = configList;

    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };
    const botProtection = getBotProtectionConfig(active?.managedRules);
    const aiBots = active?.managedRules?.ai_bots;
    const owasp = active?.managedRules?.owasp;

    if (parsed.flags['--json']) {
      outputJson(client, {
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
        rules: {
          active: active?.rules.filter(r => r.active).length ?? 0,
          inactive: active?.rules.filter(r => !r.active).length ?? 0,
          total: active?.rules.length ?? 0,
        },
        ipBlocks: active?.ips.length ?? 0,
        draftChanges: draft?.changes.length ?? 0,
      });
      return 0;
    }

    output.print('\n');
    if (parsed.flags['--graph']) {
      output.print(formatGraphOutput(active, bypassList.result, attackMode));
    } else {
      output.print(
        formatStatusOutput(
          active,
          draft,
          bypassList.result,
          attackMode,
          planInfo
        )
      );
      output.print('\n\n');
    }

    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch firewall status',
      nextCommand: parsed.flags['--json']
        ? 'firewall status --json'
        : parsed.flags['--graph']
          ? 'firewall status --graph'
          : 'firewall status',
      permissionAction: 'read firewall status',
      projectName: project.name,
      timeoutJob: 'firewall status',
    });
  } finally {
    output.stopSpinner();
  }
}
