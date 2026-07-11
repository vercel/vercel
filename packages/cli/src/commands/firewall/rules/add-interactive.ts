import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import {
  confirmAction,
  detectExistingDraft,
  offerAutoPublish,
  printActionImpactWarning,
} from '../shared';
import {
  fetchPlanInfo,
  getAvailableConditionTypes,
  getActionLabel as getActionDisplayName,
  getOperatorDisplayName,
  validateConditionValue,
  type PlanInfo,
} from '../../../util/firewall/interactive-helpers';
import patchFirewallDraft from '../../../util/firewall/patch-firewall-draft';
import {
  CONDITION_TYPES,
  CATEGORY_LABELS,
  VALID_ACTIONS,
  VALID_DURATIONS,
  type ConditionTypeMeta,
} from '../../../util/firewall/condition-types';
import {
  formatRuleExpanded,
  formatConditionCompact,
} from '../../../util/firewall/format';
import type {
  FirewallRule,
  FirewallCondition,
  FirewallConditionGroup,
  FirewallRuleAction,
} from '../../../util/firewall/types';
import stamp from '../../../util/output/stamp';

interface AddInteractiveOptions {
  skipPrompts?: boolean;
  prePopulated?: Partial<FirewallRule>;
}

export async function addInteractive(
  client: Client,
  project: { id: string; name: string },
  teamId: string | undefined,
  opts: AddInteractiveOptions = {}
): Promise<number> {
  const pre = opts.prePopulated;

  // Fetch team plan info for condition type filtering
  const planInfo = await fetchPlanInfo(client);

  // 1. Name
  const name = await client.input.text({
    message: 'Rule name:',
    default: pre?.name,
    validate: (val: string) => {
      if (!val.trim()) return 'Name is required.';
      if (val.length > 160) return 'Name must be 160 characters or less.';
      return true;
    },
  });

  // 2. Description
  const description = await client.input.text({
    message: 'Description (optional, press Enter to skip):',
    default: pre?.description || '',
  });

  // 3. Condition builder
  const conditionGroups = await buildConditionGroupLoop(
    client,
    planInfo,
    pre?.conditionGroup
  );

  // 4. Action
  const action = await buildActionInteractive(client, pre?.action);

  // 5. Active
  const active = pre?.active !== undefined ? pre.active : true;

  // 6. Preview
  const previewRule = {
    id: '(new)',
    name,
    description: description || undefined,
    active,
    conditionGroup: conditionGroups,
    action,
  } as FirewallRule;

  output.print(`\n${formatRuleExpanded(previewRule)}\n\n`);

  const confirmed = await confirmAction(
    client,
    opts.skipPrompts ?? false,
    'Create this rule?'
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  // 7. Create
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
        value: {
          name,
          description: description || undefined,
          active,
          conditionGroup: conditionGroups,
          action,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Rule "${chalk.bold(name)}" staged ${chalk.gray(createStamp())}`
    );
    printActionImpactWarning(action);

    await offerAutoPublish(client, project.id, hadExistingDraft, {
      teamId,
      skipPrompts: opts.skipPrompts,
    });

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to stage rule');
    return 1;
  }
}

// --- Condition group loop ---

async function buildConditionGroupLoop(
  client: Client,
  planInfo: PlanInfo,
  prePopulated?: FirewallConditionGroup[]
): Promise<FirewallConditionGroup[]> {
  const groups: FirewallConditionGroup[] = prePopulated
    ? JSON.parse(JSON.stringify(prePopulated))
    : [];

  if (groups.length === 0) {
    // Build first condition
    const condition = await buildConditionInteractive(client, planInfo);
    groups.push({ conditions: [condition] });
  }

  // Loop: add more conditions or groups
  for (;;) {
    // Show current conditions
    output.print(`\n  ${chalk.bold('Current conditions:')}\n`);
    for (let g = 0; g < groups.length; g++) {
      if (groups.length > 1) {
        output.print(`  ${chalk.dim(`Group ${g + 1} (AND):`)}\n`);
      }
      for (const cond of groups[g].conditions) {
        output.print(`    ${formatConditionCompact(cond)}\n`);
      }
      if (g < groups.length - 1) {
        output.print(`  ${chalk.dim('OR')}\n`);
      }
    }
    output.print('\n');

    const choice = await client.input.select({
      message: 'What next?',
      choices: [
        {
          value: 'and',
          name: 'Add another condition (AND with current group)',
        },
        {
          value: 'or',
          name: 'Start new group (OR — matches if this group OR previous groups match)',
        },
        {
          value: 'done',
          name: 'Done with conditions',
        },
      ],
    });

    if (choice === 'done') {
      break;
    }

    const condition = await buildConditionInteractive(client, planInfo);

    if (choice === 'and') {
      groups[groups.length - 1].conditions.push(condition);
    } else {
      groups.push({ conditions: [condition] });
    }
  }

  return groups;
}

// --- Single condition builder ---

export async function buildConditionInteractive(
  client: Client,
  planInfo?: PlanInfo
): Promise<FirewallCondition> {
  const availableTypes = getAvailableConditionTypes(planInfo);

  // Group by category
  const categories = new Map<string, ConditionTypeMeta[]>();
  for (const ct of availableTypes) {
    const existing = categories.get(ct.category) || [];
    existing.push(ct);
    categories.set(ct.category, existing);
  }

  // Build select choices with category separators
  const choices: { value: string; name: string }[] = [];
  for (const [category, types] of categories) {
    const label = CATEGORY_LABELS[category] || category;
    choices.push({
      value: `__sep_${category}`,
      name: chalk.dim(`── ${label} ──`),
    });
    for (const ct of types) {
      choices.push({
        value: ct.type,
        name: `  ${ct.displayName}  ${chalk.dim(ct.description)}`,
      });
    }
  }

  let type: string;
  for (;;) {
    type = await client.input.select({
      message: 'Condition type:',
      choices,
    });
    // Skip separator items
    if (!type.startsWith('__sep_')) break;
  }

  const meta = CONDITION_TYPES.find(ct => ct.type === type);

  // Key (for header/query/cookie)
  let key: string | undefined;
  if (meta?.requiresKey) {
    key = await client.input.text({
      message: `${meta.displayName} key:`,
      validate: (val: string) => (val.trim() ? true : 'Key is required.'),
    });
  }

  // Operator
  const operatorChoices = (meta?.operators || ['eq']).flatMap(op => [
    { value: op, name: getOperatorDisplayName(op, false) },
    { value: `!${op}`, name: getOperatorDisplayName(op, true) },
  ]);

  const opChoice = await client.input.select({
    message: 'Operator:',
    choices: operatorChoices,
  });

  const neg = opChoice.startsWith('!');
  const op = neg ? opChoice.slice(1) : opChoice;

  // Value — context-dependent input based on operator and preset availability
  let value: string | string[] | number | undefined;
  const baseOp = op; // neg is tracked separately
  const hasPresets = meta?.presetValues && meta.presetValues.length > 0;

  if (baseOp === 'ex') {
    // Exists operator — no value needed
  } else if (baseOp === 'inc' && hasPresets) {
    // Multi-select from preset values (method, protocol, environment, continent)
    for (;;) {
      const selected = await client.input.checkbox<string>({
        message: 'Select values (space to toggle, enter to confirm):',
        choices: meta!.presetValues!.map(p => ({
          name: p.label,
          value: p.value,
        })),
        pageSize: meta!.presetValues!.length,
      });
      if (selected.length === 0) {
        output.warn('Please select at least one value.');
        continue;
      }
      value = selected;
      break;
    }
  } else if (baseOp === 'inc') {
    // Free text comma-separated for types without presets
    const valStr = await client.input.text({
      message: 'Values (comma-separated):',
      validate: (val: string) =>
        val.trim() ? true : 'At least one value is required.',
    });
    value = valStr.split(',').map((v: string) => v.trim());
  } else if (baseOp === 'eq' && hasPresets) {
    // Single select from preset values (method, protocol, environment, continent)
    value = await client.input.select({
      message: 'Value:',
      choices: meta!.presetValues!.map(p => ({
        name: p.label,
        value: p.value,
      })),
      pageSize: meta!.presetValues!.length,
    });
  } else if (baseOp === 're') {
    // Regex — validate as valid RegExp with length limit
    const valStr = await client.input.text({
      message: 'Regex pattern (max 512 chars):',
      validate: (val: string) => {
        if (!val.trim()) return 'Regex pattern is required.';
        if (val.length > 512)
          return 'Regex pattern must be 512 characters or less.';
        try {
          new RegExp(val);
          return true;
        } catch {
          return 'Invalid regex pattern. Please enter a valid regular expression.';
        }
      },
    });
    value = valStr;
  } else {
    // String value — with per-type validation
    const valStr = await client.input.text({
      message: 'Value:',
      validate: (val: string) => {
        if (!val.trim()) return 'Value is required.';
        return validateConditionValue(val, meta);
      },
    });
    value = valStr;
  }

  const condition: FirewallCondition = { type, op };
  if (neg) condition.neg = true;
  if (key) condition.key = key;
  if (value !== undefined) condition.value = value;

  return condition;
}

// --- Action builder ---

async function buildActionInteractive(
  client: Client,
  prePopulated?: FirewallRuleAction
): Promise<FirewallRuleAction> {
  const preAction = prePopulated?.mitigate?.action;

  const actionType = (await client.input.select({
    message: 'Action:',
    choices: VALID_ACTIONS.map(a => ({
      value: a,
      name: getActionDisplayName(a),
    })),
    default: preAction,
  })) as (typeof VALID_ACTIONS)[number];

  const action: FirewallRuleAction = {
    mitigate: {
      action: actionType,
      rateLimit: null,
      redirect: null,
      actionDuration: null,
    },
  };

  // Rate limit config
  if (actionType === 'rate_limit') {
    const rl = await buildRateLimitInteractive(client);
    action.mitigate!.rateLimit = rl;
  }

  // Redirect config
  if (actionType === 'redirect') {
    const location = await client.input.text({
      message: 'Redirect URL or path:',
      validate: (val: string) => {
        if (!val.trim()) return 'URL is required.';
        if (
          !val.startsWith('/') &&
          !val.startsWith('http://') &&
          !val.startsWith('https://')
        )
          return 'URL must start with /, http://, or https://';
        return true;
      },
    });
    const permanent = await client.input.confirm(
      'Permanent redirect (301)?',
      false
    );
    action.mitigate!.redirect = { location, permanent };
  }

  // Duration (for deny, challenge, rate_limit)
  if (['deny', 'challenge', 'rate_limit'].includes(actionType)) {
    const durationChoice = await client.input.select({
      message:
        'Action duration (optional — block matching clients for a period):',
      choices: [
        { value: 'none', name: 'None (no persistent block)' },
        ...VALID_DURATIONS.map(d => ({ value: d, name: d })),
      ],
    });
    if (durationChoice !== 'none') {
      action.mitigate!.actionDuration = durationChoice;
    }
  }

  return action;
}

async function buildRateLimitInteractive(client: Client) {
  // Only show Fixed Window by default — Token Bucket requires Enterprise
  const algo = 'fixed_window' as const;
  output.print(
    `  ${chalk.dim('Algorithm:')} Fixed Window ${chalk.dim('(Token Bucket available on Enterprise via --rate-limit-algo flag)')}\n`
  );

  const windowStr = await client.input.text({
    message: 'Window in seconds (10-3600):',
    default: '60',
    validate: (val: string) => {
      const n = Number(val);
      if (Number.isNaN(n) || !Number.isInteger(n))
        return 'Please enter a whole number.';
      if (n < 10) return 'Minimum 10 seconds.';
      if (n > 3600) return 'Maximum 3600 seconds (1 hour).';
      return true;
    },
  });

  const limitStr = await client.input.text({
    message: 'Max requests per window (1-10,000,000):',
    default: '100',
    validate: (val: string) => {
      const n = Number(val);
      if (Number.isNaN(n) || !Number.isInteger(n))
        return 'Please enter a whole number.';
      if (n < 1) return 'Minimum 1 request.';
      if (n > 10_000_000) return 'Maximum 10,000,000 requests.';
      return true;
    },
  });

  // Rate limit keys — multi-select from presets
  const selectedKeys = await client.input.checkbox<string>({
    message: 'Rate limit keys (space to toggle, enter to confirm):',
    choices: [
      { name: 'IP Address (ip)', value: 'ip', checked: true },
      { name: 'JA4 Digest (ja4)', value: 'ja4' },
      { name: 'User Agent (header:user-agent)', value: 'header:user-agent' },
    ],
    pageSize: 3,
  });

  // Optionally add custom header key
  let keys = [...selectedKeys];
  const addCustom = await client.input.confirm(
    'Add a custom header key?',
    false
  );
  if (addCustom) {
    const customKey = await client.input.text({
      message: 'Header name (e.g. x-api-key):',
      validate: (val: string) =>
        val.trim() ? true : 'Header name is required.',
    });
    keys.push(`header:${customKey}`);
  }

  if (keys.length === 0) {
    keys = ['ip']; // Default fallback
  }

  const subAction = await client.input.select({
    message: 'Action when limit is exceeded:',
    choices: [
      { value: 'deny', name: 'Deny (403)' },
      { value: 'challenge', name: 'Challenge' },
      { value: 'log', name: 'Log only' },
      { value: 'rate_limit', name: 'Rate limit (429)' },
    ],
  });

  return {
    algo,
    window: Number(windowStr),
    limit: Number(limitStr),
    keys,
    action: subAction as string,
  };
}
