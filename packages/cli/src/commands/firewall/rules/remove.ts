import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesRemoveSubcommand } from '../command';
import {
  withGlobalFlags,
  parseSubcommandArgs,
  resolveRule,
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  resolveFirewallScope,
  mapFirewallApiError,
} from '../shared';
import { formatActionDisplay } from '../../../util/firewall/format';
import { outputAgentError } from '../../../util/agent-output';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import stamp from '../../../util/output/stamp';

export default async function remove(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesRemoveSubcommand,
    client,
    'rules remove'
  );
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  let identifier = parsed.args[0] as string | undefined;

  output.spinner(`Fetching rules for ${chalk.bold(scope.displayName)}`);

  const { active, draft } = await listFirewallConfigs(client, scope);
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
                  'firewall rules remove <name-or-id> --yes'
                ),
                when: 'replace <name-or-id>',
              },
              {
                command: withGlobalFlags(client, 'firewall rules list', scope),
                when: 'list rules',
              },
            ],
          },
          1
        );
      }
      output.error(
        `Rule name or ID is required. Usage: ${withGlobalFlags(client, 'firewall rules remove <name-or-id> --yes', scope)}`
      );
      return 1;
    }

    const selectedId = await client.input.select({
      message: 'Select a rule to remove:',
      choices: currentRules.map(r => ({
        value: r.id,
        name: `${r.name} [${r.active ? 'Enabled' : 'Disabled'}] — ${formatActionDisplay(r.action)}`,
      })),
    });

    const selected = currentRules.find(r => r.id === selectedId);
    if (!selected) {
      output.error('No rule selected');
      return 1;
    }
    identifier = selected.name;
  }

  const matches = resolveRule(currentRules, identifier);

  if (matches.length === 0) {
    output.stopSpinner();
    output.error(
      `No rule found for "${identifier}". Run ${chalk.cyan(withGlobalFlags(client, 'firewall rules list', scope))} to view all rules.`
    );
    return 1;
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
              `firewall rules remove "${r.id}" --yes`,
              scope
            ),
            when: `remove "${r.name}"`,
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
        name: `${r.name} [${r.active ? 'Enabled' : 'Disabled'}] — ${formatActionDisplay(r.action)}`,
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

  // Show summary
  const action = formatActionDisplay(rule.action);
  const conditionCount = rule.conditionGroup.reduce(
    (sum, g) => sum + g.conditions.length,
    0
  );
  output.log(
    `Rule: ${chalk.bold(rule.name)} [${rule.active ? 'Enabled' : 'Disabled'}] — ${action} (${conditionCount} condition${conditionCount !== 1 ? 's' : ''})`
  );

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'] as boolean,
    `Remove rule "${rule.name}"?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const removeStamp = stamp();
  output.spinner('Staging removal');

  try {
    const hadExistingDraft = await detectExistingDraft(client, scope);

    await patchFirewallDraft(client, scope, {
      action: 'rules.remove',
      id: rule.id,
      value: null,
    });

    output.log(
      `${chalk.cyan('Removed')} rule "${chalk.bold(rule.name)}" ${chalk.gray(removeStamp())}`
    );

    await offerAutoPublish(client, scope, hadExistingDraft, {
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    output.error(mapFirewallApiError(e, scope, 'Failed to remove rule'));
    return 1;
  }
}
