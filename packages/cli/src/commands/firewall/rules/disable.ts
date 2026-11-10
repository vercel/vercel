import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesDisableSubcommand } from '../command';
import {
  withGlobalFlags,
  parseSubcommandArgs,
  resolveRule,
  detectExistingDraft,
  offerAutoPublish,
  resolveFirewallScope,
  refuseManagedBotMutation,
  mentionsPriorityProject,
  mapFirewallApiError,
} from '../shared';
import { formatActionDisplay } from '../../../util/firewall/format';
import {
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
  type AgentErrorPayload,
} from '../../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
} from '../../../util/agent-output-constants';
import { quoteArg } from '../../../util/flags/quote-arg';
import { apiServerMessage } from '../../../util/firewall/server-message';
import { teamCache } from '../../../util/teams/get-team-by-id-or-slug';
import type { FirewallScope } from '../../../util/firewall/scope';
import type { FirewallRule } from '../../../util/firewall/types';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import stamp from '../../../util/output/stamp';

export default async function disable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesDisableSubcommand,
    client,
    'rules disable'
  );
  if (typeof parsed === 'number') return parsed;

  const scope = await resolveFirewallScope(client, parsed.flags);
  if (typeof scope === 'number') return scope;

  let identifier = parsed.args[0] as string | undefined;

  const reserved = refuseManagedBotMutation(
    client,
    scope,
    identifier,
    'disable'
  );
  if (reserved !== null) return reserved;

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
                  'firewall rules disable <name-or-id>'
                ),
                when: 'replace <name-or-id>',
              },
              {
                command: withGlobalFlags(client, 'firewall rules list', scope),
                when: 'list rules',
              },
            ],
          },
          2
        );
      }
      output.error(
        `Rule name or ID is required. Usage: ${withGlobalFlags(client, 'firewall rules disable <name-or-id>', scope)}`
      );
      return 2;
    }

    const enabledRules = currentRules.filter(r => r.active !== false);
    if (enabledRules.length === 0) {
      output.log('All rules are already disabled.');
      return 0;
    }

    const selectedId = await client.input.select({
      message: 'Select a rule to disable:',
      choices: enabledRules.map(r => ({
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
      `No rule found for "${identifier}". Run ${chalk.cyan(withGlobalFlags(client, 'firewall rules list', scope))} to view all rules.`
    );
    return 1;
  }

  // Filter to only enabled rules
  const matches = allMatches.filter(r => r.active !== false);

  if (matches.length === 0) {
    output.stopSpinner();
    if (allMatches.length === 1) {
      output.log(`Rule "${allMatches[0].name}" is already disabled.`);
    } else {
      output.log(`All matching rules are already disabled.`);
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
              `firewall rules disable "${r.id}" --yes`,
              scope
            ),
            when: `disable "${r.name}"`,
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

  const disableStamp = stamp();
  output.spinner('Staging changes');

  try {
    const hadExistingDraft = await detectExistingDraft(client, scope);

    await patchFirewallDraft(client, scope, {
      action: 'rules.update',
      id: rule.id,
      value: {
        name: rule.name,
        description: rule.description,
        active: false,
        conditionGroup: rule.conditionGroup,
        action: rule.action,
      },
    });

    output.log(
      `${chalk.cyan('Disabled')} rule "${chalk.bold(rule.name)}" ${chalk.gray(disableStamp())}`
    );

    await offerAutoPublish(client, scope, hadExistingDraft, {
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    output.stopSpinner();
    const priority = failPriorityDisable(client, e, scope, rule);
    if (priority !== null) return priority;
    output.error(mapFirewallApiError(e, scope, 'Failed to disable rule'));
    return 1;
  }
}

/**
 * Disabling still submits the rule's conditions, and the API rejects a
 * Priority-only condition when the project is not Priority. Enabling Priority
 * would not let this disable succeed in a useful way: the rule has to be
 * removed.
 */
function failPriorityDisable(
  client: Client,
  error: unknown,
  scope: FirewallScope,
  rule: FirewallRule
): number | null {
  const serverMessage = apiServerMessage(error);
  if (!serverMessage || !mentionsPriorityProject(serverMessage)) return null;

  const cached = scope.teamId ? teamCache.get(scope.teamId) : undefined;
  const scopeArg =
    scope.type === 'team'
      ? scope.displayName
      : (scope.teamSlug ?? cached?.slug ?? scope.teamId);
  const scopeFlag = scopeArg ? ` --scope ${quoteArg(scopeArg)}` : '';
  const command = `firewall rules remove ${quoteArg(rule.name)}${scopeFlag}`;
  const message = `This rule cannot be disabled while ${scope.displayName} is not a Priority project. Remove it instead.`;
  const nextCommand = withGlobalFlags(client, command, scope, {
    preserveProject: true,
    excludeFlags: ['--non-interactive', '--yes', '--scope', '--team'],
  });
  const payload: AgentErrorPayload = {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.INVALID_ARGUMENTS,
    message,
    userActionRequired: true,
    hint: nextCommand,
    retryable: false,
    ...(scopeArg ? { scope: scopeArg } : {}),
    next: [
      {
        command: nextCommand,
        when: 'remove the rule instead of disabling it',
      },
    ],
  };
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(client, payload, 1);
  }
  output.error(message);
  output.log(nextCommand);
  return 1;
}
