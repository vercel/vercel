import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesAddSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  withGlobalFlags,
  printActionImpactWarning,
} from '../shared';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import { parseConditionFlags } from '../../../util/firewall/parse-conditions';
import {
  VALID_ACTIONS,
  type FirewallActionType,
} from '../../../util/firewall/condition-types';
import { buildActionFromFlags } from '../../../util/firewall/build-action';
import { formatRuleExpanded } from '../../../util/firewall/format';
import type {
  FirewallRule,
  FirewallConditionGroup,
} from '../../../util/firewall/types';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';
import { getCommandName } from '../../../util/pkg-name';
import { handleAIAdd } from './add-ai';
import { addInteractive } from './add-interactive';

export default async function add(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesAddSubcommand,
    client,
    'rules add'
  );
  if (typeof parsed === 'number') return parsed;

  const aiPrompt = parsed.flags['--ai'] as string | undefined;
  const jsonInput = parsed.flags['--json'] as string | undefined;
  const conditionFlags = parsed.flags['--condition'] as string[] | undefined;

  // Mutual exclusivity check
  const modeCount = [aiPrompt, jsonInput, conditionFlags].filter(
    Boolean
  ).length;
  if (modeCount > 1) {
    output.error(
      'Cannot use --ai, --json, and --condition together. Use only one mode.'
    );
    return 1;
  }

  // Mode dispatch
  if (aiPrompt) {
    // AI mode — blocked for agents/non-interactive (AI output requires human review)
    if (client.nonInteractive || !client.stdin.isTTY) {
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'ai_not_available',
          message:
            'AI mode is not available in non-interactive mode. AI-generated rules require human review before staging. Use --json or --condition flags instead.',
          next: [
            {
              command: withGlobalFlags(
                client,
                'firewall rules add "Name" --condition \'{"type":"path","op":"pre","value":"/api"}\' --action deny --yes'
              ),
              when: 'create with flags',
            },
            {
              command: withGlobalFlags(
                client,
                'firewall rules add --json \'{"name":"...","conditionGroup":[...],"action":{...}}\' --yes'
              ),
              when: 'create with JSON',
            },
          ],
        });
      }
      output.error(
        'AI mode is not available in non-interactive mode. Use --json or --condition flags instead.'
      );
      return 1;
    }

    // AI mode
    const link = await ensureProjectLink(client);
    if (typeof link === 'number') return link;
    const { project, org } = link;
    const teamId = org.type === 'team' ? org.id : undefined;
    return handleAIAdd(client, project, teamId, {
      prompt: aiPrompt,
      name: parsed.args[0],
      skipPrompts: !!parsed.flags['--yes'],
    });
  }

  if (jsonInput) {
    // JSON mode
    return handleJsonAdd(client, parsed, jsonInput);
  }

  if (conditionFlags) {
    // Flag mode
    return handleFlagAdd(client, parsed, conditionFlags);
  }

  // No mode specified — interactive or error
  if (client.stdin.isTTY && !client.nonInteractive) {
    // Interactive mode: offer AI vs manual choice
    const mode = await client.input.select({
      message: 'How would you like to create the rule?',
      choices: [
        {
          value: 'ai',
          name: 'Describe what you want (AI-powered)',
        },
        {
          value: 'manual',
          name: 'Build manually (step by step)',
        },
        {
          value: 'json',
          name: 'Paste JSON',
        },
      ],
    });

    const link = await ensureProjectLink(client);
    if (typeof link === 'number') return link;
    const { project, org } = link;
    const teamId = org.type === 'team' ? org.id : undefined;

    if (mode === 'ai') {
      return handleAIAdd(client, project, teamId, {
        skipPrompts: false,
      });
    }

    if (mode === 'json') {
      const jsonStr = await client.input.text({
        message: 'Paste the JSON rule definition:',
      });
      return handleJsonAdd(client, parsed, jsonStr);
    }

    // Manual interactive mode
    return addInteractive(client, project, teamId, {
      skipPrompts: !!parsed.flags['--yes'],
    });
  }

  // Non-interactive with no flags — error with guidance
  if (client.nonInteractive) {
    outputAgentError(client, {
      status: 'error',
      reason: 'missing_flags',
      message: 'No rule definition provided. Use --json or --condition flags.',
      next: [
        {
          command: withGlobalFlags(
            client,
            'firewall rules add "Name" --condition \'{"type":"path","op":"pre","value":"/api"}\' --action deny --yes'
          ),
          when: 'create with flags',
        },
        {
          command: withGlobalFlags(
            client,
            'firewall rules add --json \'{"name":"Name","conditionGroup":[...],"action":{"mitigate":{"action":"deny"}}}\' --yes'
          ),
          when: 'create with JSON',
        },
      ],
    });
  }
  output.error(
    'Interactive mode is not available. Use --ai, --json, or --condition flags to create a rule.'
  );
  return 1;
}

// --- JSON mode ---

async function handleJsonAdd(
  client: Client,
  parsed: { args: string[]; flags: Record<string, unknown> },
  jsonStr: string
): Promise<number> {
  let ruleData: Record<string, unknown>;
  try {
    ruleData = JSON.parse(jsonStr);
  } catch {
    output.error('Invalid JSON. Please provide a valid JSON object.');
    return 1;
  }

  // Validate required fields
  if (!ruleData.name || typeof ruleData.name !== 'string') {
    output.error('JSON must include a "name" field (string).');
    return 1;
  }
  if (!ruleData.conditionGroup || !Array.isArray(ruleData.conditionGroup)) {
    output.error('JSON must include a "conditionGroup" field (array).');
    return 1;
  }
  // Validate each condition group has a conditions array
  for (let i = 0; i < (ruleData.conditionGroup as unknown[]).length; i++) {
    const group = (ruleData.conditionGroup as Record<string, unknown>[])[i];
    if (!group.conditions || !Array.isArray(group.conditions)) {
      output.error(`conditionGroup[${i}] must have a "conditions" array.`);
      return 1;
    }
    for (let j = 0; j < (group.conditions as unknown[]).length; j++) {
      const cond = (group.conditions as Record<string, unknown>[])[j];
      if (!cond.type || typeof cond.type !== 'string') {
        output.error(
          `conditionGroup[${i}].conditions[${j}] must have a "type" field.`
        );
        return 1;
      }
      if (!cond.op || typeof cond.op !== 'string') {
        output.error(
          `conditionGroup[${i}].conditions[${j}] must have an "op" field.`
        );
        return 1;
      }
    }
  }
  if (!ruleData.action || typeof ruleData.action !== 'object') {
    output.error('JSON must include an "action" field (object).');
    return 1;
  }
  // Validate action structure
  const actionObj = ruleData.action as Record<string, unknown>;
  if (!actionObj.mitigate || typeof actionObj.mitigate !== 'object') {
    output.error(
      'action must have a "mitigate" field. Example: { "mitigate": { "action": "deny" } }'
    );
    return 1;
  }
  const mitigateObj = actionObj.mitigate as Record<string, unknown>;
  if (!mitigateObj.action || typeof mitigateObj.action !== 'string') {
    output.error(
      'action.mitigate must have an "action" field (string). Valid: deny, challenge, rate_limit, log, redirect.'
    );
    return 1;
  }

  // Validate limits
  if ((ruleData.name as string).length > 160) {
    output.error('Rule name must be 160 characters or less.');
    return 1;
  }
  if (ruleData.description && (ruleData.description as string).length > 256) {
    output.error('Rule description must be 256 characters or less.');
    return 1;
  }
  if ((ruleData.conditionGroup as unknown[]).length > 25) {
    output.error('Maximum 25 condition groups allowed.');
    return 1;
  }

  const rule = {
    name: ruleData.name,
    description: ruleData.description,
    active: ruleData.active !== false,
    conditionGroup: ruleData.conditionGroup,
    action: ruleData.action,
  };

  return createRule(
    client,
    parsed,
    rule as unknown as Omit<FirewallRule, 'id'>
  );
}

// --- Flag mode ---

async function handleFlagAdd(
  client: Client,
  parsed: { args: string[]; flags: Record<string, unknown> },
  conditionFlags: string[]
): Promise<number> {
  // Parse name
  const name = parsed.args[0] as string | undefined;
  if (!name) {
    output.error(
      `Missing rule name. Provide as the first argument: ${chalk.cyan(getCommandName('firewall rules add "Rule name" --condition ...'))}`
    );
    return 1;
  }
  if (name.length > 160) {
    output.error('Rule name must be 160 characters or less.');
    return 1;
  }

  // Parse conditions (with --or support)
  // We need to reconstruct the interleaved --condition and --or flags
  // from the raw argv to preserve ordering
  const rawArgs = parsed.flags['--condition'] as string[] | undefined;
  if (!rawArgs || rawArgs.length === 0) {
    output.error('At least one --condition is required.');
    return 1;
  }

  // Build the interleaved flag list by scanning the original argv
  // The parsed flags give us --condition values and --or as boolean
  // But we need the ordering. For simplicity, treat all conditions as one AND group
  // unless --or is set, in which case we use the raw flag order.
  const hasOr = parsed.flags['--or'] as boolean | undefined;
  let conditionGroups: FirewallConditionGroup[];

  if (hasOr) {
    // Reconstruct interleaved order from argv
    const interleaved: string[] = [];
    const condValues = [...rawArgs];
    let condIdx = 0;

    // Walk through the original command argv to find --condition and --or ordering
    for (const arg of client.argv) {
      if (arg === '--or') {
        interleaved.push('--or');
      } else if (arg === '--condition' || arg.startsWith('--condition=')) {
        // The next value in condValues corresponds to this --condition
        if (condIdx < condValues.length) {
          interleaved.push(condValues[condIdx]);
          condIdx++;
        }
      }
    }

    const result = parseConditionFlags(interleaved);
    if (typeof result === 'string') {
      output.error(result);
      return 1;
    }
    conditionGroups = result.groups;
  } else {
    // Simple case: all conditions in one AND group
    const result = parseConditionFlags(rawArgs);
    if (typeof result === 'string') {
      output.error(result);
      return 1;
    }
    conditionGroups = result.groups;
  }

  // Parse action
  const actionType = parsed.flags['--action'] as string | undefined;
  if (!actionType) {
    output.error(
      `Missing --action. Valid actions: ${VALID_ACTIONS.join(', ')}`
    );
    return 1;
  }
  if (!VALID_ACTIONS.includes(actionType as FirewallActionType)) {
    output.error(
      `Invalid action "${actionType}". Valid actions: ${VALID_ACTIONS.join(', ')}`
    );
    return 1;
  }

  // Build action object
  const action = buildActionFromFlags(parsed.flags, actionType);
  if (typeof action === 'string') {
    output.error(action);
    return 1;
  }

  const description = parsed.flags['--description'] as string | undefined;
  if (description && description.length > 256) {
    output.error('Rule description must be 256 characters or less.');
    return 1;
  }

  const active = !parsed.flags['--disabled'];

  const rule = {
    name,
    description,
    active,
    conditionGroup: conditionGroups,
    action,
  };

  return createRule(client, parsed, rule);
}

// --- Shared create logic ---

async function createRule(
  client: Client,
  parsed: { args: string[]; flags: Record<string, unknown> },
  rule: Omit<FirewallRule, 'id'>
): Promise<number> {
  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  // Show preview and confirm
  const previewRule = { ...rule, id: '(new)' } as FirewallRule;
  output.print(`\n${formatRuleExpanded(previewRule)}\n\n`);

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'] as boolean,
    `Create this rule?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const createStamp = stamp();
  output.spinner('Staging rule');

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
        action: 'rules.insert',
        id: null,
        value: rule,
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Rule "${chalk.bold(rule.name)}" staged ${chalk.gray(createStamp())}`
    );
    printActionImpactWarning(rule.action);

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to stage rule';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(client, 'firewall rules add --yes'),
          },
        ],
      });
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
