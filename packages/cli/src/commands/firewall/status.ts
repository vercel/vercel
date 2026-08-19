import chalk from 'chalk';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { statusSubcommand } from './command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from './shared';
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
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import type { ProjectSecurityResponse } from '../../util/firewall/types';

export default async function status(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, statusSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  if (parsed.flags['--json'] && parsed.flags['--graph']) {
    const msg = 'Cannot use --json and --graph together. Pick one.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        next: [
          { command: withGlobalFlags(client, 'firewall status --json') },
          { command: withGlobalFlags(client, 'firewall status --graph') },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
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
        active,
        draft,
        bypass: bypassList.result,
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
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch firewall status';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall status') }],
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
