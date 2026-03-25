import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { statusSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  outputJson,
  withGlobalFlags,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import getBypass from '../../util/firewall/get-bypass';
import { formatStatusOutput } from '../../util/firewall/format';
import { outputAgentError } from '../../util/agent-output';

export default async function status(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, statusSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching firewall status for ${chalk.bold(project.name)}`);

  try {
    const [configList, bypassList] = await Promise.all([
      listFirewallConfigs(client, project.id, { teamId }),
      getBypass(client, project.id, { teamId }),
    ]);

    const { active, draft } = configList;

    if (parsed.flags['--json']) {
      outputJson(client, {
        active,
        draft,
        bypass: bypassList.result,
      });
      return 0;
    }

    output.print('\n');
    output.print(formatStatusOutput(active, draft, bypassList.result));
    output.print('\n\n');

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
  }
}
