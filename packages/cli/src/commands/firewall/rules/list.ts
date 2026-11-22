import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  outputJson,
  withGlobalFlags,
  resolveFirewallScope,
  failPriorityProjectGate,
  mapFirewallApiError,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import {
  annotateRules,
  formatRulesTable,
  formatRuleExpanded,
  formatManagedBotRulesTable,
} from '../../../util/firewall/format';
import {
  getManagedBotRules,
  managedBotJson,
} from '../../../util/firewall/managed-bot-rules';
import type { FirewallConfigChange } from '../../../util/firewall/types';
import { outputAgentError } from '../../../util/agent-output';

function unpublishedRuleChangeCount(changes: FirewallConfigChange[]): number {
  return changes.filter(
    c =>
      c.action.startsWith('rules.') ||
      c.action === 'managedRules.update' ||
      c.action === 'botId.toggle'
  ).length;
}

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesListSubcommand,
    client,
    'rules list'
  );
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  output.spinner(`Fetching rules for ${chalk.bold(scope.displayName)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, scope);

    const config = draft ?? active;
    const managed = scope.type === 'project' ? getManagedBotRules(config) : [];
    const activeRules = active?.rules || [];
    const draftRules = draft?.rules || null;
    const changes = draft?.changes || [];

    const annotated = annotateRules(activeRules, draftRules, changes);

    if (parsed.flags['--json']) {
      outputJson(client, {
        ...(scope.type === 'project'
          ? { managed: managed.map(managedBotJson) }
          : {}),
        rules: annotated.map(a => ({
          ...a.rule,
          _status: a.status,
        })),
        hasDraft: changes.length > 0,
        pendingChanges: changes.length,
      });
      return 0;
    }

    if (scope.type === 'project') {
      output.print(`\n${formatManagedBotRulesTable(managed)}\n`);
    }

    if (annotated.length === 0) {
      if (scope.type === 'project') {
        output.print(`\n  ${chalk.bold('Custom')}\n`);
        output.print(`\n  ${chalk.dim('No custom rules configured.')}\n`);
      } else {
        output.log('No custom rules configured.');
        return 0;
      }
    } else if (parsed.flags['--expand']) {
      if (scope.type === 'project') {
        output.print(`\n  ${chalk.bold('Custom')}\n\n`);
      } else {
        output.print('\n');
      }
      for (let i = 0; i < annotated.length; i++) {
        const { rule, status } = annotated[i];
        let colorFn: (s: string) => string = (s: string) => s;
        let prefix = '';
        if (status === 'added') {
          colorFn = chalk.green;
          prefix = '+ ';
        } else if (status === 'removed') {
          colorFn = chalk.red;
          prefix = '- ';
        } else if (status === 'modified') {
          colorFn = chalk.yellow;
          prefix = '~ ';
        }

        const expanded = formatRuleExpanded(rule, i);
        if (prefix) {
          // Color the first line with prefix
          const expandedLines = expanded.split('\n');
          expandedLines[0] = colorFn(
            expandedLines[0].replace(/^ {2}/, `  ${prefix}`)
          );
          output.print(expandedLines.join('\n'));
        } else {
          output.print(expanded);
        }

        if (i < annotated.length - 1) {
          output.print('\n\n');
        }
      }
      output.print('\n');
    } else {
      if (scope.type === 'project') {
        output.print(`\n  ${chalk.bold('Custom')}\n\n`);
      } else {
        output.print('\n');
      }
      output.print(`${formatRulesTable(annotated, client.stderr.columns)}\n`);
    }

    const ruleChanges = unpublishedRuleChangeCount(changes);
    if (ruleChanges > 0) {
      output.print(
        `\n  ${chalk.yellow(`${ruleChanges} unpublished rule change${ruleChanges !== 1 ? 's' : ''}.`)} Run ${chalk.cyan(withGlobalFlags(client, 'firewall publish', scope))} to publish.\n`
      );
    } else {
      output.print(`\n  ${chalk.dim('Showing live configuration.')}\n`);
    }

    output.print('\n');
    return 0;
  } catch (e: unknown) {
    const priority = failPriorityProjectGate(client, e, scope, {
      json: parsed.flags['--json'] === true,
    });
    if (priority !== null) return priority;
    const msg = mapFirewallApiError(e, scope, 'Failed to fetch custom rules');
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          { command: withGlobalFlags(client, 'firewall rules list', scope) },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
