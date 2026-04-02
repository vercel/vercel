import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { rulesEditSubcommand } from '../command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  resolveRule,
  withGlobalFlags,
} from '../shared';
import listFirewallConfigs from '../../../util/firewall/list-firewall-configs';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import generateFirewallRule from '../../../util/firewall/generate-firewall-rule';
import { parseConditionFlags } from '../../../util/firewall/parse-conditions';
import {
  VALID_ACTIONS,
  VALID_DURATIONS,
  VALID_ALGORITHMS,
  type FirewallActionType,
} from '../../../util/firewall/condition-types';
import { formatRuleExpanded } from '../../../util/firewall/format';
import type {
  FirewallRule,
  FirewallRuleAction,
} from '../../../util/firewall/types';
import { runInteractiveEditLoop } from './edit-interactive';
import stamp from '../../../util/output/stamp';
import { outputAgentError } from '../../../util/agent-output';
import { getCommandName } from '../../../util/pkg-name';

export default async function edit(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    rulesEditSubcommand,
    client,
    'rules edit'
  );
  if (typeof parsed === 'number') return parsed;

  const identifier = parsed.args[0];
  if (!identifier) {
    output.error('Missing required argument: <name-or-id>');
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  // Resolve the rule
  output.spinner(`Fetching rules for ${chalk.bold(project.name)}`);

  const { active, draft } = await listFirewallConfigs(client, project.id, {
    teamId,
  });

  const currentRules = draft?.rules || active?.rules || [];
  const matches = resolveRule(currentRules, identifier);

  if (matches.length === 0) {
    output.error(
      `No rule found for "${identifier}". Run ${chalk.cyan(getCommandName('firewall rules list'))} to view all rules.`
    );
    return 1;
  }

  let originalRule = matches[0];

  if (matches.length > 1) {
    output.stopSpinner();
    if (client.nonInteractive || !client.stdin.isTTY) {
      output.error(
        `Multiple rules match "${identifier}". Specify the full rule ID to disambiguate.`
      );
      return 1;
    }

    const selectedId = await client.input.select({
      message: `Multiple rules match "${identifier}". Select one:`,
      choices: matches.map(r => ({
        value: r.id,
        name: `${r.name} [${r.active ? 'Active' : 'Inactive'}] (${r.id})`,
      })),
    });

    const selected = matches.find(r => r.id === selectedId);
    if (!selected) {
      output.error('No rule selected');
      return 1;
    }
    originalRule = selected;
  }

  output.stopSpinner();

  // Mode dispatch
  const aiPrompt = parsed.flags['--ai'] as string | undefined;
  const jsonInput = parsed.flags['--json'] as string | undefined;
  const conditionFlags = parsed.flags['--condition'] as string[] | undefined;

  // Mutual exclusivity
  const modeCount = [aiPrompt, jsonInput, conditionFlags].filter(
    Boolean
  ).length;
  if (modeCount > 1) {
    output.error(
      'Cannot use --ai, --json, and --condition together. Use only one mode.'
    );
    return 1;
  }

  // AI mode
  if (aiPrompt) {
    return handleAIEdit(client, project, teamId, originalRule, {
      prompt: aiPrompt,
      skipPrompts: !!parsed.flags['--yes'],
    });
  }

  // JSON mode
  if (jsonInput) {
    return handleJsonEdit(
      client,
      parsed,
      originalRule,
      jsonInput,
      project,
      teamId
    );
  }

  // Flag overrides
  const hasEditFlags =
    conditionFlags ||
    parsed.flags['--action'] ||
    parsed.flags['--name'] ||
    parsed.flags['--description'] !== undefined ||
    parsed.flags['--duration'] ||
    parsed.flags['--active'] ||
    parsed.flags['--inactive'] ||
    parsed.flags['--rate-limit-algo'] ||
    parsed.flags['--rate-limit-window'] ||
    parsed.flags['--rate-limit-requests'] ||
    parsed.flags['--rate-limit-keys'] ||
    parsed.flags['--redirect-url'] ||
    parsed.flags['--redirect-permanent'];

  if (hasEditFlags) {
    return handleFlagEdit(client, parsed, originalRule, argv, project, teamId);
  }

  // Interactive mode
  if (client.stdin.isTTY && !client.nonInteractive) {
    // Show current rule
    output.print(`\n${chalk.bold('Current rule:')}\n`);
    output.print(`${formatRuleExpanded(originalRule)}\n\n`);

    const mode = await client.input.select({
      message: 'How would you like to edit this rule?',
      choices: [
        { value: 'ai', name: 'Describe changes (AI-powered)' },
        { value: 'manual', name: 'Edit manually (field by field)' },
      ],
    });

    if (mode === 'ai') {
      return handleAIEdit(client, project, teamId, originalRule, {
        skipPrompts: false,
      });
    }

    // Manual edit
    const modified = await runInteractiveEditLoop(client, originalRule);
    if (!modified) {
      output.log('Canceled');
      return 0;
    }

    // Check for changes
    if (JSON.stringify(modified) === JSON.stringify(originalRule)) {
      output.log('No changes detected.');
      return 0;
    }

    return saveEdit(client, project, teamId, originalRule, modified, parsed);
  }

  // Non-interactive with no flags
  outputAgentError(client, {
    status: 'error',
    reason: 'missing_flags',
    message:
      'No edit flags provided. Use --ai, --json, --condition, --action, --name, etc.',
    next: [
      {
        command: withGlobalFlags(
          client,
          `firewall rules edit "${identifier}" --ai "Change action to challenge" --yes`
        ),
      },
    ],
  });
  process.exit(1);
  return 1;
}

// --- AI Edit ---

async function handleAIEdit(
  client: Client,
  project: { id: string; name: string },
  teamId: string | undefined,
  originalRule: FirewallRule,
  opts: { prompt?: string; skipPrompts?: boolean }
): Promise<number> {
  let prompt = opts.prompt;
  if (!prompt) {
    if (!client.stdin.isTTY || client.nonInteractive) {
      output.error('--ai requires a description.');
      return 1;
    }
    prompt = await client.input.text({
      message: 'Describe the changes you want:',
      validate: (val: string) =>
        val.trim() ? true : 'Please describe the changes.',
    });
  }

  let currentRule: FirewallRule = JSON.parse(JSON.stringify(originalRule));

  for (;;) {
    output.spinner('Generating changes with AI...');

    try {
      const response = await generateFirewallRule(
        client,
        project.id,
        { prompt, currentRule },
        { teamId }
      );

      output.stopSpinner();

      if (response.error) {
        if (client.stdin.isTTY && !client.nonInteractive && !opts.skipPrompts) {
          const retryChoice = await client.input.select({
            message: `AI could not update the rule: ${response.error}`,
            choices: [
              {
                value: 'retry',
                name: 'Try again with a different description',
              },
              { value: 'cancel', name: 'Cancel' },
            ],
          });
          if (retryChoice === 'cancel') {
            output.log('Canceled');
            return 0;
          }
          prompt = await client.input.text({
            message: 'Describe the changes you want:',
            validate: (val: string) =>
              val.trim() ? true : 'Please describe the changes.',
          });
          continue;
        }
        output.error(`AI could not update the rule: ${response.error}`);
        return 1;
      }

      if (!response.rule) {
        output.error('AI did not return a rule.');
        return 1;
      }

      currentRule = { ...response.rule, id: originalRule.id };
      break;
    } catch (e: unknown) {
      output.stopSpinner();
      const error = e as { message?: string };
      if (!client.stdin.isTTY || client.nonInteractive) {
        output.error(error.message || 'Failed to generate changes');
        return 1;
      }

      const retryChoice = await client.input.select({
        message: `Generation failed: ${error.message || 'Unknown error'}`,
        choices: [
          { value: 'retry', name: 'Try again' },
          { value: 'cancel', name: 'Cancel' },
        ],
      });
      if (retryChoice === 'cancel') {
        output.log('Canceled');
        return 0;
      }
    }
  }

  // Show preview
  output.print(`\n${formatRuleExpanded(currentRule)}\n\n`);

  // Auto-save with --yes
  if (opts.skipPrompts) {
    return saveEdit(client, project, teamId, originalRule, currentRule, {
      flags: { '--yes': true },
    });
  }

  // Review menu
  for (;;) {
    let choice: string;
    try {
      choice = await client.input.select({
        message: 'What would you like to do?',
        choices: [
          { value: 'save', name: 'Save changes' },
          { value: 'edit-ai', name: 'Edit with AI (describe more changes)' },
          { value: 'edit-manual', name: 'Edit manually (field by field)' },
          { value: 'discard', name: 'Discard' },
        ],
      });
    } catch {
      return 1;
    }

    if (choice === 'save') {
      return saveEdit(client, project, teamId, originalRule, currentRule, {
        flags: {},
      });
    }

    if (choice === 'edit-ai') {
      prompt = await client.input.text({
        message: 'Describe the changes you want:',
        validate: (val: string) =>
          val.trim() ? true : 'Please describe the changes.',
      });

      output.spinner('Regenerating...');

      try {
        const response = await generateFirewallRule(
          client,
          project.id,
          { prompt, currentRule },
          { teamId }
        );

        output.stopSpinner();

        if (response.error || !response.rule) {
          output.error(
            `AI could not update the rule: ${response.error || 'No rule returned'}`
          );
          continue;
        }

        currentRule = { ...response.rule, id: originalRule.id };
        output.print(`\n${formatRuleExpanded(currentRule)}\n\n`);
        continue;
      } catch (e: unknown) {
        output.stopSpinner();
        const error = e as { message?: string };
        output.error(error.message || 'Failed to regenerate');
        continue;
      }
    }

    if (choice === 'edit-manual') {
      const modified = await runInteractiveEditLoop(client, currentRule);
      if (!modified) {
        continue; // Back to review menu
      }
      currentRule = modified;
      output.print(`\n${formatRuleExpanded(currentRule)}\n\n`);
      continue;
    }

    if (choice === 'discard') {
      output.log('Discarded');
      return 0;
    }
  }
}

// --- JSON Edit ---

async function handleJsonEdit(
  client: Client,
  parsed: { args: string[]; flags: Record<string, unknown> },
  originalRule: FirewallRule,
  jsonStr: string,
  project: { id: string; name: string },
  teamId: string | undefined
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
  if (!ruleData.action || typeof ruleData.action !== 'object') {
    output.error('JSON must include an "action" field (object).');
    return 1;
  }
  if ((ruleData.name as string).length > 160) {
    output.error('Rule name must be 160 characters or less.');
    return 1;
  }
  if (ruleData.description !== undefined && ruleData.description !== null) {
    if (typeof ruleData.description !== 'string') {
      output.error('JSON "description" field must be a string.');
      return 1;
    }
    if (ruleData.description.length > 256) {
      output.error('Rule description must be 256 characters or less.');
      return 1;
    }
  }

  const modified: FirewallRule = {
    id: originalRule.id,
    name: ruleData.name as string,
    description: ruleData.description as string | undefined,
    active: ruleData.active !== false,
    conditionGroup: ruleData.conditionGroup as FirewallRule['conditionGroup'],
    action: ruleData.action as FirewallRule['action'],
  };

  return saveEdit(client, project, teamId, originalRule, modified, parsed);
}

// --- Flag Edit ---

function extractConditionFlags(argv: string[]): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === '--or') {
      result.push('--or');
      i++;
    } else if (argv[i] === '--condition' && i + 1 < argv.length) {
      result.push(argv[i + 1]);
      i += 2;
    } else if (argv[i].startsWith('--condition=')) {
      result.push(argv[i].slice('--condition='.length));
      i++;
    } else {
      i++;
    }
  }
  return result;
}

async function handleFlagEdit(
  client: Client,
  parsed: { args: string[]; flags: Record<string, unknown> },
  originalRule: FirewallRule,
  rawArgv: string[],
  project: { id: string; name: string },
  teamId: string | undefined
): Promise<number> {
  // Clone the original rule
  const modified: FirewallRule = JSON.parse(JSON.stringify(originalRule));

  // Apply flag overrides
  const newName = parsed.flags['--name'] as string | undefined;
  if (newName) {
    if (newName.length > 160) {
      output.error('Rule name must be 160 characters or less.');
      return 1;
    }
    modified.name = newName;
  }

  if (parsed.flags['--description'] !== undefined) {
    const desc = parsed.flags['--description'] as string;
    modified.description = desc === '' ? undefined : desc;
  }

  if (parsed.flags['--active']) {
    modified.active = true;
  }
  if (parsed.flags['--inactive']) {
    modified.active = false;
  }

  // Condition replacement
  const conditionFlags = parsed.flags['--condition'] as string[] | undefined;
  if (conditionFlags) {
    const interleaved = extractConditionFlags(rawArgv);
    if (interleaved.length === 0) {
      output.error('At least one --condition is required.');
      return 1;
    }
    const condResult = parseConditionFlags(interleaved);
    if (typeof condResult === 'string') {
      output.error(condResult);
      return 1;
    }
    modified.conditionGroup = condResult.groups;
  }

  // Action override
  const actionType = parsed.flags['--action'] as string | undefined;
  if (actionType) {
    if (!VALID_ACTIONS.includes(actionType as FirewallActionType)) {
      output.error(
        `Invalid action "${actionType}". Valid actions: ${VALID_ACTIONS.join(', ')}`
      );
      return 1;
    }
    const actionResult = buildActionFromFlags(parsed.flags, actionType);
    if (typeof actionResult === 'string') {
      output.error(actionResult);
      return 1;
    }
    modified.action = actionResult;
  } else {
    // Duration-only change (preserve existing action)
    const duration = parsed.flags['--duration'] as string | undefined;
    if (duration) {
      if (
        !VALID_DURATIONS.includes(duration as (typeof VALID_DURATIONS)[number])
      ) {
        output.error(
          `Invalid duration "${duration}". Valid durations: ${VALID_DURATIONS.join(', ')}`
        );
        return 1;
      }
      if (modified.action.mitigate) {
        modified.action.mitigate.actionDuration = duration;
      }
    }
  }

  // Check for changes
  if (JSON.stringify(modified) === JSON.stringify(originalRule)) {
    output.log('No changes detected.');
    return 0;
  }

  return saveEdit(client, project, teamId, originalRule, modified, parsed);
}

function buildActionFromFlags(
  flags: Record<string, unknown>,
  actionType: string
): FirewallRuleAction | string {
  const duration = flags['--duration'] as string | undefined;
  if (
    duration &&
    !VALID_DURATIONS.includes(duration as (typeof VALID_DURATIONS)[number])
  ) {
    return `Invalid duration "${duration}". Valid durations: ${VALID_DURATIONS.join(', ')}`;
  }

  const action: FirewallRuleAction = {
    mitigate: {
      action: actionType,
      rateLimit: null,
      redirect: null,
      actionDuration: duration || null,
    },
  };

  if (actionType === 'rate_limit') {
    const algo = (flags['--rate-limit-algo'] as string) || 'fixed_window';
    const window = flags['--rate-limit-window'] as number | undefined;
    const requests = flags['--rate-limit-requests'] as number | undefined;
    const keys = (flags['--rate-limit-keys'] as string[]) || ['ip'];

    if (!VALID_ALGORITHMS.includes(algo as (typeof VALID_ALGORITHMS)[number])) {
      return `Invalid rate limit algorithm "${algo}".`;
    }
    if (!window || window < 10) {
      return 'Rate limit --rate-limit-window is required (minimum 10 seconds).';
    }
    if (window > 3600) {
      return 'Rate limit --rate-limit-window maximum is 3600 seconds.';
    }
    if (!requests || requests < 1) {
      return 'Rate limit --rate-limit-requests is required (minimum 1).';
    }
    if (requests > 10_000_000) {
      return 'Rate limit --rate-limit-requests maximum is 10,000,000.';
    }

    action.mitigate!.rateLimit = {
      algo: algo as 'fixed_window' | 'token_bucket',
      window,
      limit: requests,
      keys,
    };
  }

  if (actionType === 'redirect') {
    const redirectUrl = flags['--redirect-url'] as string | undefined;
    const permanent = !!flags['--redirect-permanent'];
    if (!redirectUrl) {
      return 'Redirect action requires --redirect-url.';
    }
    if (
      !redirectUrl.startsWith('/') &&
      !redirectUrl.startsWith('http://') &&
      !redirectUrl.startsWith('https://')
    ) {
      return 'Redirect URL must start with /, http://, or https://';
    }
    action.mitigate!.redirect = { location: redirectUrl, permanent };
  }

  return action;
}

// --- Shared save logic ---

async function saveEdit(
  client: Client,
  project: { id: string; name: string },
  teamId: string | undefined,
  originalRule: FirewallRule,
  modified: FirewallRule,
  parsed: { flags: Record<string, unknown> }
): Promise<number> {
  // Show preview
  output.print(`\n${formatRuleExpanded(modified)}\n\n`);

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'] as boolean,
    `Save changes to "${modified.name}"?`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const editStamp = stamp();
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
        id: originalRule.id,
        value: {
          name: modified.name,
          description: modified.description,
          active: modified.active,
          conditionGroup: modified.conditionGroup,
          action: modified.action,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Rule "${chalk.bold(modified.name)}" updated and staged ${chalk.gray(editStamp())}`
    );

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: parsed.flags['--yes'] as boolean,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to stage rule changes';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `firewall rules edit "${originalRule.name}" --yes`
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
