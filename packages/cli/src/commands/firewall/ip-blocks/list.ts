import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { ipBlocksListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  resolveFirewallScope,
  mapFirewallApiError,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import {
  annotateIpRules,
  formatIpBlocksTable,
} from '../../../util/firewall/format';
import { outputAgentError } from '../../../util/agent-output';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    ipBlocksListSubcommand,
    client,
    'ip-blocks list'
  );
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  output.spinner(
    `Fetching IP blocking rules for ${chalk.bold(scope.displayName)}`
  );

  try {
    const { active, draft } = await listFirewallConfigs(client, scope);

    const activeIps = active?.ips || [];
    const draftIps = draft?.ips || null;
    const changes = draft?.changes || [];
    const hasDraftChanges = changes.length > 0;

    const annotated = annotateIpRules(activeIps, draftIps, changes);

    if (parsed.flags['--json']) {
      outputJson(client, {
        rules: annotated.map(a => ({
          ...a.rule,
          _status: a.status,
        })),
        hasDraft: hasDraftChanges,
        pendingChanges: changes.length,
      });
      return 0;
    }

    if (annotated.length === 0) {
      output.log('No IP blocking rules configured.');
      return 0;
    }

    output.print(`\n${formatIpBlocksTable(annotated)}\n`);

    const ipChanges = changes.filter(c => c.action.startsWith('ip.')).length;
    if (ipChanges > 0) {
      output.print(
        `\n  ${chalk.yellow(`${ipChanges} unpublished IP block change${ipChanges !== 1 ? 's' : ''}.`)} Run ${chalk.cyan(withGlobalFlags(client, 'firewall publish', scope))} to publish.\n`
      );
    } else {
      output.print(`\n  ${chalk.dim('Showing live configuration.')}\n`);
    }

    output.print('\n');
    return 0;
  } catch (e: unknown) {
    const msg = mapFirewallApiError(
      e,
      scope,
      'Failed to fetch IP blocking rules'
    );
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(client, 'firewall ip-blocks list', scope),
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
