import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesListSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  outputJson,
  withGlobalFlags,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import {
  annotateRules,
  formatRulesTable,
  formatRuleExpanded,
} from '../../../util/firewall/format';
import { getCommandName } from '../../../util/pkg-name';
import { outputAgentError } from '../../../util/agent-output';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesListSubcommand,
    client,
    'rules list'
  );
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching custom rules for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    const activeRules = active?.rules || [];
    const draftRules = draft?.rules || null;
    const changes = draft?.changes || [];

    const annotated = annotateRules(activeRules, draftRules, changes);

    if (parsed.flags['--json']) {
      outputJson(client, {
        rules: annotated.map(a => ({
          ...a.rule,
          _status: a.status,
        })),
        hasDraft: changes.length > 0,
        pendingChanges: changes.length,
      });
      return 0;
    }

    if (annotated.length === 0) {
      output.log('No custom rules configured.');
      return 0;
    }

    // Expanded view — full condition details
    if (parsed.flags['--expand']) {
      output.print('\n');
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
      // Table view — compact with description
      output.print(`\n${formatRulesTable(annotated)}\n`);
    }

    const ruleChanges = changes.filter(c =>
      c.action.startsWith('rules.')
    ).length;
    if (ruleChanges > 0) {
      output.print(
        `\n  ${chalk.yellow(`${ruleChanges} unpublished rule change${ruleChanges !== 1 ? 's' : ''}.`)} Run ${chalk.cyan(getCommandName('firewall publish'))} to publish.\n`
      );
    } else {
      output.print(`\n  ${chalk.dim('Showing live configuration.')}\n`);
    }

    output.print('\n');
    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch custom rules';
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
