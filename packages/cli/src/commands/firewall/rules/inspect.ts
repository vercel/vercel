import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesInspectSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRule,
  outputJson,
  withGlobalFlags,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import { formatRuleDetail } from '../../../util/firewall/format';
import { getCommandName } from '../../../util/pkg-name';
import { outputAgentError } from '../../../util/agent-output';

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesInspectSubcommand,
    client,
    'rules inspect'
  );
  if (typeof parsed === 'number') return parsed;

  const identifier = parsed.args[0];
  if (!identifier) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: 'Rule name or ID is required.',
          next: [
            {
              command: withGlobalFlags(
                client,
                'firewall rules inspect <name-or-id>'
              ),
              when: 'replace <name-or-id>',
            },
            {
              command: withGlobalFlags(client, 'firewall rules list'),
              when: 'list rules',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Rule name or ID is required. Usage: ${getCommandName('firewall rules inspect <name-or-id>')}`
    );
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching rules for ${chalk.bold(project.name)}`);

  try {
    const { active, draft } = await listFirewallConfigs(client, project.id, {
      teamId,
    });

    // Resolve against draft (if exists) or active
    const currentRules = draft?.rules || active?.rules || [];
    const matches = resolveRule(currentRules, identifier);

    if (matches.length === 0) {
      output.stopSpinner();
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'not_found',
            message: `No rule found for "${identifier}".`,
            next: [
              {
                command: withGlobalFlags(client, 'firewall rules list'),
                when: 'list rules',
              },
            ],
          },
          1
        );
      }
      output.error(
        `No rule found for "${identifier}". Run ${chalk.cyan(getCommandName('firewall rules list'))} to view all rules.`
      );
      return 1;
    }

    let rule = matches[0];

    // Disambiguate if multiple matches
    if (matches.length > 1) {
      output.stopSpinner();
      if (client.nonInteractive || !client.stdin.isTTY) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'ambiguous_match',
              message: `Multiple rules match "${identifier}". Specify the full rule ID.`,
              next: matches.map(r => ({
                command: withGlobalFlags(
                  client,
                  `firewall rules inspect "${r.id}"`
                ),
                when: `inspect "${r.name}"`,
              })),
            },
            1
          );
        }
        output.error(
          `Multiple rules match "${identifier}". Specify the full rule ID to disambiguate.`
        );
        return 1;
      }

      const selectedId = await client.input.select({
        message: `Multiple rules match "${identifier}". Select one:`,
        choices: matches.map(r => ({
          value: r.id,
          name: `${r.name} [${r.active ? 'Enabled' : 'Disabled'}] (${r.id})`,
        })),
      });

      const selected = matches.find(r => r.id === selectedId);
      if (!selected) {
        output.error('No rule selected');
        return 1;
      }
      rule = selected;
    }

    if (parsed.flags['--json']) {
      outputJson(client, rule);
      return 0;
    }

    output.print(`\n${formatRuleDetail(rule)}\n\n`);
    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to fetch rules';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall rules inspect ${identifier}`
            ),
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
