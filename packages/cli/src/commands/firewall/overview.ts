import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { overviewSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  outputJson,
  withGlobalFlags,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import getBypass from '../../util/firewall/get-bypass';
import {
  formatStatusOutput,
  type AttackModeStatus,
} from '../../util/firewall/format';
import { outputAgentError } from '../../util/agent-output';
import type { ProjectSecurityResponse } from '../../util/firewall/types';

export default async function overview(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, overviewSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall overview for ${chalk.bold(project.name)}`);

  try {
    const [configList, bypassList, freshProject] = await Promise.all([
      listFirewallConfigs(client, project.id, { teamId }),
      getBypass(client, project.id, { teamId }),
      client.fetch<ProjectSecurityResponse>(
        `/v9/projects/${encodeURIComponent(project.id)}`,
        { accountId: teamId }
      ),
    ]);

    const { active, draft } = configList;

    const attackMode: AttackModeStatus = {
      enabled: freshProject.security?.attackModeEnabled ?? false,
      activeUntil: freshProject.security?.attackModeActiveUntil,
    };

    if (parsed.flags['--json']) {
      outputJson(client, {
        active,
        draft,
        bypass: bypassList.result,
        attackMode,
      });
      return 0;
    }

    output.print('\n');
    output.print(
      formatStatusOutput(active, draft, bypassList.result, attackMode)
    );
    output.print('\n\n');

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch firewall overview';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall overview') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
