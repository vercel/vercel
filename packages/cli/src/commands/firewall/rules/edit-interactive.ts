import chalk from 'chalk';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { buildConditionInteractive } from './add-interactive';
import {
  CONDITION_TYPES,
  VALID_ACTIONS,
  VALID_DURATIONS,
} from '../../../util/firewall/condition-types';
import {
  fetchPlanInfo,
  getAvailableConditionTypes,
  getActionLabel,
  getOperatorDisplayName,
  validateConditionValue,
  type PlanInfo,
} from '../../../util/firewall/interactive-helpers';
import {
  formatConditionCompact,
  formatActionDisplay,
} from '../../../util/firewall/format';
import type {
  FirewallRule,
  FirewallCondition,
  FirewallConditionGroup,
  FirewallRuleAction,
} from '../../../util/firewall/types';

/**
 * Field-by-field interactive edit loop.
 * Shows current values and lets the user pick what to modify.
 * Returns the modified rule, or null if the user cancels.
 */
export async function runInteractiveEditLoop(
  client: Client,
  rule: FirewallRule
): Promise<FirewallRule | null> {
  // Clone to avoid mutating the original
  const edited: FirewallRule = JSON.parse(JSON.stringify(rule));

  // Fetch plan info for condition type filtering
  const planInfo = await fetchPlanInfo(client);

  for (;;) {
    const condCount = edited.conditionGroup.reduce(
      (sum, g) => sum + g.conditions.length,
      0
    );
    const groupCount = edited.conditionGroup.length;
    const actionLabel = formatActionDisplay(edited.action);

    const choice = await client.input.select({
      message: 'What would you like to edit?',
      choices: [
        {
          value: 'name',
          name: `Name (${chalk.cyan(edited.name)})`,
        },
        {
          value: 'description',
          name: `Description (${chalk.cyan(edited.description || chalk.dim('none'))})`,
        },
        {
          value: 'conditions',
          name: `Conditions (${chalk.cyan(`${condCount} condition${condCount !== 1 ? 's' : ''} in ${groupCount} group${groupCount !== 1 ? 's' : ''}`)})`,
        },
        {
          value: 'action',
          name: `Action (${chalk.cyan(actionLabel)})`,
        },
        {
          value: 'active',
          name: `Status (${edited.active ? chalk.green('Enabled') : chalk.dim('Disabled')})`,
        },
        {
          value: 'done',
          name: chalk.bold('Done — save changes'),
        },
      ],
    });

    switch (choice) {
      case 'name': {
        edited.name = await client.input.text({
          message: 'Rule name:',
          default: edited.name,
          validate: (val: string) => {
            if (!val.trim()) return 'Name is required.';
            if (val.length > 160) return 'Name must be 160 characters or less.';
            return true;
          },
        });
        break;
      }

      case 'description': {
        edited.description = await client.input.text({
          message: 'Description (press Enter to keep, empty to clear):',
          default: edited.description || '',
          validate: (val: string) => {
            if (val.length > 256) {
              return 'Description must be 256 characters or less.';
            }
            return true;
          },
        });
        if (edited.description === '') {
          edited.description = undefined;
        }
        break;
      }

      case 'conditions': {
        const result = await editConditions(
          client,
          edited.conditionGroup,
          planInfo
        );
        if (result) {
          edited.conditionGroup = result;
        }
        break;
      }

      case 'action': {
        edited.action = await editAction(client, edited.action);
        break;
      }

      case 'active': {
        const toggle = await client.input.select({
          message: 'Rule status:',
          choices: [
            { value: 'active', name: 'Enabled' },
            { value: 'inactive', name: 'Disabled' },
          ],
          default: edited.active ? 'active' : 'inactive',
        });
        edited.active = toggle === 'active';
        break;
      }

      case 'done': {
        if (edited.conditionGroup.length === 0) {
          output.warn(
            'Rule has no conditions. Please add at least one condition.'
          );
          continue;
        }
        return edited;
      }
    }
  }
}

// --- Condition editor ---

async function editConditions(
  client: Client,
  groups: FirewallConditionGroup[],
  planInfo: PlanInfo
): Promise<FirewallConditionGroup[] | null> {
  const edited: FirewallConditionGroup[] = JSON.parse(JSON.stringify(groups));

  for (;;) {
    // Display current conditions
    output.print(`\n${chalk.bold('  Current conditions:')}\n`);
    let condIndex = 1;
    for (let g = 0; g < edited.length; g++) {
      if (edited.length > 1) {
        output.print(`  ${chalk.dim(`Group ${g + 1} (AND):`)}\n`);
      }
      for (const cond of edited[g].conditions) {
        output.print(`    ${condIndex}. ${formatConditionCompact(cond)}\n`);
        condIndex++;
      }
      if (g < edited.length - 1) {
        output.print(`  ${chalk.dim('OR')}\n`);
      }
    }
    output.print('\n');

    // Build choices — Done first, then add, remove, edit
    const choices: { value: string; name: string }[] = [];

    choices.push({
      value: 'done',
      name: chalk.bold('Done with conditions'),
    });

    // Add
    if (edited.length > 0) {
      choices.push({
        value: 'add-and',
        name: `Add condition to ${edited.length > 1 ? 'a group' : 'current group'} (AND)`,
      });
    }
    choices.push({
      value: 'add-or',
      name: 'Add new group (OR)',
    });

    // Remove
    if (condIndex > 1) {
      choices.push({
        value: 'remove',
        name: 'Remove a condition',
      });
    }

    // Edit individual conditions
    let idx = 1;
    for (let g = 0; g < edited.length; g++) {
      for (let c = 0; c < edited[g].conditions.length; c++) {
        choices.push({
          value: `edit:${g}:${c}`,
          name: `Edit condition ${idx} (${formatConditionCompact(edited[g].conditions[c])})`,
        });
        idx++;
      }
    }

    const action = await client.input.select({
      message: 'What would you like to do?',
      choices,
    });

    if (action === 'done') {
      return edited;
    }

    if (action.startsWith('edit:')) {
      const [, gStr, cStr] = action.split(':');
      const g = Number.parseInt(gStr, 10);
      const c = Number.parseInt(cStr, 10);
      const newCond = await editSingleCondition(
        client,
        edited[g].conditions[c],
        planInfo
      );
      edited[g].conditions[c] = newCond;
      continue;
    }

    if (action === 'remove') {
      const removeChoices: { value: string; name: string }[] = [];
      let removeIdx = 1;
      for (let g = 0; g < edited.length; g++) {
        for (let c = 0; c < edited[g].conditions.length; c++) {
          removeChoices.push({
            value: `${g}:${c}`,
            name: `${removeIdx}. ${formatConditionCompact(edited[g].conditions[c])}`,
          });
          removeIdx++;
        }
      }

      const removeTarget = await client.input.select({
        message: 'Which condition to remove?',
        choices: removeChoices,
      });

      const [gStr, cStr] = removeTarget.split(':');
      const g = Number.parseInt(gStr, 10);
      const c = Number.parseInt(cStr, 10);
      edited[g].conditions.splice(c, 1);

      // Remove empty groups
      if (edited[g].conditions.length === 0) {
        edited.splice(g, 1);
        output.log('Empty group removed.');
      }
      continue;
    }

    if (action === 'add-and') {
      let targetGroup = 0;
      if (edited.length > 1) {
        const groupChoice = await client.input.select({
          message: 'Add to which group?',
          choices: edited.map((_, i) => ({
            value: String(i),
            name: `Group ${i + 1} (${edited[i].conditions.length} conditions)`,
          })),
        });
        targetGroup = Number.parseInt(groupChoice, 10);
      }
      const newCond = await buildCondition(client, planInfo);
      edited[targetGroup].conditions.push(newCond);
      continue;
    }

    if (action === 'add-or') {
      const newCond = await buildCondition(client, planInfo);
      edited.push({ conditions: [newCond] });
    }
  }
}

// --- Single condition editor (pre-populated) ---

async function editSingleCondition(
  client: Client,
  current: FirewallCondition,
  planInfo: PlanInfo
): Promise<FirewallCondition> {
  output.print(
    `\n  ${chalk.dim('Current:')} ${formatConditionCompact(current)}\n\n`
  );

  // Condition type — pre-select current
  const availableTypes = getAvailableConditionTypes(planInfo);

  const type = await client.input.select({
    message: 'Condition type:',
    choices: availableTypes.map(ct => ({
      value: ct.type,
      name: `${ct.displayName}  ${chalk.dim(ct.description)}`,
    })),
    default: current.type,
  });

  const meta = CONDITION_TYPES.find(ct => ct.type === type);

  // Key
  let key: string | undefined;
  if (meta?.requiresKey) {
    key = await client.input.text({
      message: `${meta.displayName} key:`,
      default: current.type === type ? current.key : undefined,
      validate: (val: string) => (val.trim() ? true : 'Key is required.'),
    });
  }

  // Operator — pre-select current
  const operatorChoices = (meta?.operators || ['eq']).flatMap(op => [
    { value: op, name: getOperatorDisplayName(op, false) },
    { value: `!${op}`, name: getOperatorDisplayName(op, true) },
  ]);

  const currentOpValue =
    current.type === type
      ? current.neg
        ? `!${current.op}`
        : current.op
      : undefined;

  const opChoice = await client.input.select({
    message: 'Operator:',
    choices: operatorChoices,
    default: currentOpValue,
  });

  const neg = opChoice.startsWith('!');
  const op = neg ? opChoice.slice(1) : opChoice;

  // Value
  let value: string | string[] | number | undefined;
  if (op !== 'ex') {
    const currentValue =
      current.type === type && current.op === op ? current.value : undefined;

    if (op === 'inc' && meta?.presetValues) {
      const currentArr = Array.isArray(currentValue) ? currentValue : [];
      for (;;) {
        const selected = await client.input.checkbox<string>({
          message: 'Select values:',
          choices: meta.presetValues.map(p => ({
            name: p.label,
            value: p.value,
            checked: currentArr.includes(p.value),
          })),
          pageSize: meta.presetValues.length,
        });
        if (selected.length === 0) {
          output.warn('Please select at least one value.');
          continue;
        }
        value = selected;
        break;
      }
    } else if (op === 'inc') {
      const defaultVal = Array.isArray(currentValue)
        ? currentValue.join(', ')
        : '';
      const valStr = await client.input.text({
        message: 'Values (comma-separated):',
        default: defaultVal,
        validate: (val: string) =>
          val.trim() ? true : 'At least one value is required.',
      });
      value = valStr.split(',').map((v: string) => v.trim());
    } else if (op === 'eq' && meta?.presetValues) {
      value = await client.input.select({
        message: 'Value:',
        choices: meta.presetValues.map(p => ({
          name: p.label,
          value: p.value,
        })),
        default: typeof currentValue === 'string' ? currentValue : undefined,
        pageSize: meta.presetValues.length,
      });
    } else {
      const defaultVal = typeof currentValue === 'string' ? currentValue : '';
      const valStr = await client.input.text({
        message: 'Value:',
        default: defaultVal,
        validate: (val: string) => {
          if (!val.trim()) return 'Value is required.';
          return validateConditionValue(val, meta);
        },
      });
      value = valStr;
    }
  }

  const condition: FirewallCondition = { type, op };
  if (neg) condition.neg = true;
  if (key) condition.key = key;
  if (value !== undefined) condition.value = value;

  return condition;
}

// --- Build a new condition (delegates to add-interactive's builder) ---

async function buildCondition(
  client: Client,
  planInfo: PlanInfo
): Promise<FirewallCondition> {
  // Reuse the same builder logic as add-interactive
  return buildConditionInteractive(client, planInfo);
}

// --- Action editor ---

async function editAction(
  client: Client,
  current: FirewallRuleAction
): Promise<FirewallRuleAction> {
  const currentActionType = current.mitigate?.action;

  const actionType = (await client.input.select({
    message: 'Action:',
    choices: VALID_ACTIONS.map(a => ({
      value: a,
      name: getActionLabel(a),
    })),
    default: currentActionType,
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
    const currentRL = current.mitigate?.rateLimit;

    output.print(
      `  ${chalk.dim('Algorithm:')} Fixed Window ${chalk.dim('(Token Bucket available on Enterprise via flags)')}\n`
    );

    const windowStr = await client.input.text({
      message: 'Window in seconds (10-3600):',
      default: String(currentRL?.window || 60),
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
      default: String(currentRL?.limit || 100),
      validate: (val: string) => {
        const n = Number(val);
        if (Number.isNaN(n) || !Number.isInteger(n))
          return 'Please enter a whole number.';
        if (n < 1) return 'Minimum 1 request.';
        if (n > 10_000_000) return 'Maximum 10,000,000 requests.';
        return true;
      },
    });

    const currentKeys = currentRL?.keys || ['ip'];
    const selectedKeys = await client.input.checkbox<string>({
      message: 'Rate limit keys:',
      choices: [
        {
          name: 'IP Address (ip)',
          value: 'ip',
          checked: currentKeys.includes('ip'),
        },
        {
          name: 'JA4 Digest (ja4)',
          value: 'ja4',
          checked: currentKeys.includes('ja4'),
        },
        {
          name: 'User Agent (header:user-agent)',
          value: 'header:user-agent',
          checked: currentKeys.includes('header:user-agent'),
        },
      ],
      pageSize: 3,
    });

    let keys = [...selectedKeys];
    // Preserve custom keys from the original
    const customKeys = currentKeys.filter(
      k => !['ip', 'ja4', 'header:user-agent'].includes(k)
    );
    if (customKeys.length > 0) {
      output.print(
        `  ${chalk.dim('Custom keys preserved:')} ${customKeys.join(', ')}\n`
      );
      keys = [...keys, ...customKeys];
    }
    if (keys.length === 0) keys = ['ip'];

    const subAction = await client.input.select({
      message: 'Action when limit is exceeded:',
      choices: [
        { value: 'deny', name: 'Deny (403)' },
        { value: 'challenge', name: 'Challenge' },
        { value: 'log', name: 'Log only' },
        { value: 'rate_limit', name: 'Rate limit (429)' },
      ],
      default: currentRL?.action || 'deny',
    });

    action.mitigate!.rateLimit = {
      algo:
        (currentRL?.algo as 'fixed_window' | 'token_bucket') || 'fixed_window',
      window: Number(windowStr),
      limit: Number(limitStr),
      keys,
      action: subAction as string,
    };
  }

  // Redirect config
  if (actionType === 'redirect') {
    const currentRD = current.mitigate?.redirect;

    const location = await client.input.text({
      message: 'Redirect URL or path:',
      default: currentRD?.location || '',
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
      currentRD?.permanent ?? false
    );
    action.mitigate!.redirect = { location, permanent };
  }

  // Duration
  if (['deny', 'challenge', 'rate_limit'].includes(actionType)) {
    const currentDuration = current.mitigate?.actionDuration;
    const durationChoice = await client.input.select({
      message: 'Action duration:',
      choices: [
        { value: 'none', name: 'None (no persistent block)' },
        ...VALID_DURATIONS.map(d => ({ value: d, name: d })),
      ],
      default: currentDuration || 'none',
    });
    if (durationChoice !== 'none') {
      action.mitigate!.actionDuration = durationChoice;
    }
  }

  return action;
}
