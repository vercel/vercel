import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesEnableSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRule,
  detectExistingDraft,
  offerAutoPublish,
  withGlobalFlags,
  printActionImpactWarning,
} from '../shared';
import { formatActionDisplay } from '../../../util/firewall/format';
import { outputAgentError } from '../../../util/agent-output';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import stamp from '../../../util/output/stamp';
import { getCommandName } from '../../../util/pkg-name';

export default async function enable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesEnableSubcommand,
    client,
    'rules enable'
  );
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  let identifier = parsed.args[0] as string | undefined;

  output.spinner(`Fetching rules for ${chalk.bold(project.name)}`);

  const { active, draft } = await listFirewallConfigs(client, project.id, {
    teamId,
  });
  const currentRules = draft?.rules || active?.rules || [];

  if (currentRules.length === 0) {
    output.stopSpinner();
    output.error(
      'No custom rules configured. Create one first with `vercel firewall rules add`.'
    );
    return 1;
  }

  if (!identifier) {
    output.stopSpinner();

    if (client.nonInteractive || !client.stdin.isTTY) {
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
                  'firewall rules enable <name-or-id>'
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
        `Rule name or ID is required. Usage: ${getCommandName('firewall rules enable <name-or-id>')}`
      );
      return 1;
    }

    const disabledRules = currentRules.filter(r => r.active === false);
    if (disabledRules.length === 0) {
      output.log('All rules are already enabled.');
      return 0;
    }

    const selectedId = await client.input.select({
      message: 'Select a rule to enable:',
      choices: disabledRules.map(r => ({
        value: r.id,
        name: `${r.name} — ${formatActionDisplay(r.action)}`,
      })),
    });

    const selected = currentRules.find(r => r.id === selectedId);
    if (!selected) {
      output.error('No rule selected');
      return 1;
    }
    identifier = selected.name;
  }

  const allMatches = resolveRule(currentRules, identifier);

  if (allMatches.length === 0) {
    output.stopSpinner();
    output.error(
      `No rule found for "${identifier}". Run ${chalk.cyan(getCommandName('firewall rules list'))} to view all rules.`
    );
    return 1;
  }

  // Filter to only disabled rules
  const matches = allMatches.filter(r => r.active === false);

  if (matches.length === 0) {
    output.stopSpinner();
    if (allMatches.length === 1) {
      output.log(`Rule "${allMatches[0].name}" is already enabled.`);
    } else {
      output.log(`All matching rules are already enabled.`);
    }
    return 0;
  }

  let rule = matches[0];

  if (matches.length > 1) {
    output.stopSpinner();
    if (client.nonInteractive || !client.stdin.isTTY) {
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'ambiguous_match',
          message: `Multiple rules match "${identifier}". Specify the full rule ID.`,
          next: matches.map(r => ({
            command: withGlobalFlags(
              client,
              `firewall rules enable "${r.id}" --yes`
            ),
            when: `enable "${r.name}"`,
          })),
        });
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
        name: `${r.name} — ${formatActionDisplay(r.action)}`,
      })),
    });

    const selected = matches.find(r => r.id === selectedId);
    if (!selected) {
      output.error('No rule selected');
      return 1;
    }
    rule = selected;
  }

  output.stopSpinner();

  const enableStamp = stamp();
  output.spinner('Staging changes');

  try {
    const hadExistingDraft = await detectExistingDraft(
      client,
      project.id,
      teamId
    );

    await patchFirewallDraft(
      client,
      project.id,
      {
        action: 'rules.update',
        id: rule.id,
        value: {
          name: rule.name,
          description: rule.description,
          active: true,
          conditionGroup: rule.conditionGroup,
          action: rule.action,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Enabled')} rule "${chalk.bold(rule.name)}" ${chalk.gray(enableStamp())}`
    );
    printActionImpactWarning(rule.action);

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to enable rule');
    return 1;
  }
}
