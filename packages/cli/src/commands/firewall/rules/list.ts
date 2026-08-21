import chalk from 'chalk';
import type Client from '../../../util/client';
import { requireProjectContext } from '../../../util/projects/require-project-context';
import output from '../../../output-manager';
import { rulesListSubcommand } from '../command';
import { parseSubcommandArgs, outputJson, withGlobalFlags } from '../shared';
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
  suggestedManagedBotAction,
} from '../../../util/firewall/managed-bot-rules';
import { formatHintLine } from '../../../util/firewall/format-utils';
import { outputAgentError } from '../../../util/agent-output';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesListSubcommand,
    client,
    'rules list'
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

  output.spinner(`Fetching rules for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    const config = draft ?? active;
    const managed = getManagedBotRules(config);
    const activeRules = active?.rules || [];
    const draftRules = draft?.rules || null;
    const changes = draft?.changes || [];

    const annotated = annotateRules(activeRules, draftRules, changes);

    if (parsed.flags['--json']) {
      outputJson(client, {
        managed: managed.map(managedBotJson),
        rules: annotated.map(a => ({
          ...a.rule,
          _status: a.status,
        })),
        hasDraft: changes.length > 0,
        pendingChanges: changes.length,
      });
      return 0;
    }

    output.print(`\n${formatManagedBotRulesTable(managed)}\n`);

    if (annotated.length === 0) {
      output.print(`\n  ${chalk.bold('Custom')}\n`);
      output.print(`\n  ${chalk.dim('No custom rules configured.')}\n`);
    } else if (parsed.flags['--expand']) {
      output.print(`\n  ${chalk.bold('Custom')}\n\n`);
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
      output.print(`\n  ${chalk.bold('Custom')}\n\n`);
      output.print(`${formatRulesTable(annotated)}\n`);
    }

    const ruleChanges = changes.filter(c =>
      c.action.startsWith('rules.')
    ).length;
    if (ruleChanges > 0) {
      output.print(
        `\n  ${chalk.yellow(`${ruleChanges} unpublished rule change${ruleChanges !== 1 ? 's' : ''}.`)} Run ${chalk.cyan(withGlobalFlags(client, 'firewall publish'))} to publish.\n`
      );
    } else {
      output.print(`\n  ${chalk.dim('Showing live configuration.')}\n`);
    }

    const first = managed[0];
    if (first) {
      output.print(
        `\n${formatHintLine(
          'Edit rule',
          withGlobalFlags(
            client,
            `firewall rules edit ${first.id} --action ${suggestedManagedBotAction(first)}`
          )
        )}\n`
      );
    }

    output.print('\n');
    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch rules';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'firewall rules list') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
