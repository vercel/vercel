import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { botManagementSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  failFirewallApi,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import { formatManagedBotRulesTable } from '../../../util/firewall/format';
import {
  getManagedBotRules,
  managedBotJson,
  suggestedManagedBotAction,
} from '../../../util/firewall/managed-bot-rules';
import { formatHintLine } from '../../../util/firewall/format-utils';

export default async function botManagement(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    botManagementSubcommand,
    client,
    'bot-management'
  );
  if (typeof parsed === 'number') return parsed;

  const link = await requireProjectContext(
    client,
    'firewall',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching bot management for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });
    const managed = getManagedBotRules(draft ?? active);

    if (parsed.flags['--json']) {
      outputJson(client, { managed: managed.map(managedBotJson) });
      return 0;
    }

    output.print(`\n${formatManagedBotRulesTable(managed)}\n`);
    output.print(
      `\n${managed
        .map(rule =>
          formatHintLine(
            'Edit rule',
            withGlobalFlags(
              client,
              `firewall rules edit ${rule.id} --action ${suggestedManagedBotAction(rule)}`
            )
          )
        )
        .join('\n')}\n\n`
    );
    return 0;
  } catch (e: unknown) {
    return failFirewallApi(client, e, {
      fallback: 'Failed to fetch bot management',
      nextCommand: 'firewall bot-management',
      permissionAction: 'read firewall config',
      projectName: project.name,
      timeoutJob: 'bot management',
    });
  } finally {
    output.stopSpinner();
  }
}
