import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { diffSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  outputJson,
  withGlobalFlags,
} from './shared';
import listFirewallConfigs from '../../util/firewall/list-firewall-configs';
import { formatDiffOutput } from '../../util/firewall/format';
import { getCommandName } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';

export default async function diff(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, diffSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching draft changes for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    if (!draft || draft.changes.length === 0) {
      if (parsed.flags['--json']) {
        outputJson(client, { changes: [] });
        return 0;
      }
      output.log('No pending changes.');
      return 0;
    }

    if (parsed.flags['--json']) {
      outputJson(client, { changes: draft.changes });
      return 0;
    }

    // Build a lookup map of active rules for smarter change descriptions
    const activeRulesMap = new Map((active?.rules || []).map(r => [r.id, r]));

    output.print(
      `\n${chalk.bold(`Pending changes (${draft.changes.length}):`)}\n\n`
    );
    output.print(formatDiffOutput(draft.changes, activeRulesMap));
    output.print('\n\n');
    output.print(
      `  Run ${chalk.cyan(getCommandName('firewall publish'))} to publish, or ${chalk.cyan(getCommandName('firewall discard'))} to discard.\n\n`
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch draft changes';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall diff') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
