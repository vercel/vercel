import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesReorderSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRule,
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  withGlobalFlags,
} from '../shared';
import { formatActionDisplay } from '../../../util/firewall/format';
import { outputAgentError } from '../../../util/agent-output';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import stamp from '../../../util/output/stamp';
import { getCommandName } from '../../../util/pkg-name';

export default async function reorder(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesReorderSubcommand,
    client,
    'rules reorder'
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

  if (currentRules.length < 2) {
    output.stopSpinner();
    output.error('Need at least 2 rules to reorder.');
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
                  'firewall rules reorder <name-or-id> --first --yes'
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
        `Rule name or ID is required. Usage: ${getCommandName('firewall rules reorder <name-or-id> --position N --yes')}`
      );
      return 1;
    }

    const selectedId = await client.input.select({
      message: 'Select a rule to reorder:',
      choices: currentRules.map((r, i) => ({
        value: r.id,
        name: `${i + 1}. ${r.name} [${r.active ? 'Enabled' : 'Disabled'}] — ${formatActionDisplay(r.action)}`,
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
      `No rule found for "${identifier}". Run ${chalk.cyan(getCommandName('firewall rules list'))} to view all rules.`
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
              `firewall rules reorder "${r.id}" --first --yes`
            ),
            when: `reorder "${r.name}"`,
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

  const currentIndex = currentRules.findIndex(r => r.id === rule.id);

  // Determine target position
  const flagFirst = parsed.flags['--first'] as boolean | undefined;
  const flagLast = parsed.flags['--last'] as boolean | undefined;
  const flagPosition = parsed.flags['--position'] as number | undefined;

  // Mutual exclusivity
  const positionFlagCount = [flagFirst, flagLast, flagPosition].filter(
    Boolean
  ).length;
  if (positionFlagCount > 1) {
    output.error(
      'Cannot use --first, --last, and --position together. Use only one.'
    );
    return 1;
  }

  let targetIndex: number;

  if (flagFirst) {
    targetIndex = 0;
  } else if (flagLast) {
    targetIndex = currentRules.length - 1;
  } else if (flagPosition !== undefined) {
    if (flagPosition < 1) {
      output.error('Position must be at least 1.');
      return 1;
    }
    if (flagPosition > currentRules.length) {
      output.error(
        `Position ${flagPosition} exceeds the number of rules (${currentRules.length}).`
      );
      return 1;
    }
    targetIndex = flagPosition - 1; // Convert 1-based to 0-based
  } else {
    // No position flag provided
    if (client.nonInteractive || !client.stdin.isTTY) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'missing_arguments',
            message:
              'A position flag is required. Use --position N, --first, or --last.',
            next: [
              {
                command: withGlobalFlags(
                  client,
                  `firewall rules reorder "${rule.name}" --first --yes`
                ),
                when: 'move to first position',
              },
              {
                command: withGlobalFlags(
                  client,
                  `firewall rules reorder "${rule.name}" --last --yes`
                ),
                when: 'move to last position',
              },
            ],
          },
          1
        );
      }
      output.error(
        `A position flag is required. Use --position N, --first, or --last.`
      );
      return 1;
    }

    // Show current order
    output.print('\n  Current rule order:\n');
    for (let i = 0; i < currentRules.length; i++) {
      const r = currentRules[i];
      const marker = r.id === rule.id ? '→' : ' ';
      output.print(
        `  ${marker} ${i + 1}. ${r.name} [${r.active ? 'Enabled' : 'Disabled'}]\n`
      );
    }
    output.print('\n');

    const positionStr = await client.input.text({
      message: `Move "${rule.name}" to position (1-${currentRules.length}):`,
      validate: (val: string) => {
        const num = Number(val);
        if (Number.isNaN(num) || !Number.isInteger(num)) {
          return 'Enter a number.';
        }
        if (num < 1 || num > currentRules.length) {
          return `Position must be between 1 and ${currentRules.length}.`;
        }
        return true;
      },
    });

    targetIndex = Number(positionStr) - 1;
  }

  // Check if already at target
  if (currentIndex === targetIndex) {
    output.log(
      `Rule "${rule.name}" is already at position ${targetIndex + 1}.`
    );
    return 0;
  }

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'] as boolean,
    `Move "${rule.name}" from position ${currentIndex + 1} to position ${targetIndex + 1}?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const reorderStamp = stamp();
  output.spinner('Staging reorder');

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
        action: 'rules.priority',
        id: rule.id,
        value: targetIndex,
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Moved')} rule "${chalk.bold(rule.name)}" to position ${targetIndex + 1} ${chalk.gray(reorderStamp())}`
    );

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to reorder rule');
    return 1;
  }
}
