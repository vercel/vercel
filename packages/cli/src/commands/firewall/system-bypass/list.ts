import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { systemBypassListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  outputJson,
  withGlobalFlags,
} from '../shared';
import getBypass from '../../../util/firewall/get-bypass';
import {
  formatBypassTable,
  isAllSourcesBypass,
} from '../../../util/firewall/format';
import { outputAgentError } from '../../../util/agent-output';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    systemBypassListSubcommand,
    client,
    'system-bypass list'
  );
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(
    `Fetching system bypass rules for ${chalk.bold(project.name)}`
  );

  try {
    const { result: allBypasses } = await getBypass(client, project.id, {
      teamId,
    });

    // Filter out system mitigations bypass entries (0.0.0.0/0, ::/0)
    const bypasses = allBypasses.filter(b => !isAllSourcesBypass(b.Ip));

    if (parsed.flags['--json']) {
      outputJson(client, bypasses);
      return 0;
    }

    if (bypasses.length === 0) {
      output.log('No system bypass rules configured.');
      return 0;
    }

    output.print(`\n${formatBypassTable(bypasses)}\n\n`);
    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch bypass rules';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(client, 'firewall system-bypass list'),
          },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
