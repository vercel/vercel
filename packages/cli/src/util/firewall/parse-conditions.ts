import type { FirewallCondition, FirewallConditionGroup } from './types';
import { CONDITION_TYPE_MAP, ALL_OPERATORS } from './condition-types';

export interface ParsedConditionGroups {
  groups: FirewallConditionGroup[];
}

/**
 * Parse --condition flags and --or separators into condition groups.
 *
 * --condition flags within the same group are AND'd.
 * --or starts a new OR group.
 *
 * Example:
 *   --condition "user_agent:sub:crawler" --condition "geo_country:inc:CN,RU" --or --condition "ip_address:eq:1.2.3.4"
 *
 * Produces:
 *   Group 1 (AND): user_agent contains crawler AND geo_country is any of CN,RU
 *   Group 2 (OR):  ip_address equals 1.2.3.4
 */
export function parseConditionFlags(
  conditionFlags: string[]
): ParsedConditionGroups | string {
  if (conditionFlags.length === 0) {
    return 'At least one --condition is required.';
  }

  const groups: FirewallConditionGroup[] = [{ conditions: [] }];

  for (const flag of conditionFlags) {
    // --or separator (represented as the literal string "--or" in the flags array)
    if (flag === '--or') {
      if (groups[groups.length - 1].conditions.length === 0) {
        return '--or cannot be placed before any conditions or consecutively.';
      }
      groups.push({ conditions: [] });
      continue;
    }

    const result = parseConditionFlag(flag);
    if (typeof result === 'string') {
      return result;
    }
    groups[groups.length - 1].conditions.push(result);
  }

  // Check the last group isn't empty (trailing --or)
  if (groups[groups.length - 1].conditions.length === 0) {
    return '--or cannot be the last flag — add conditions after it.';
  }

  return { groups };
}

/**
 * Parse a single --condition flag value.
 *
 * Format:
 *   Non-key types: "type:op:value"       → split on first 2 colons
 *   Key types:     "type:key:op:value"    → split on first 3 colons
 *   Negation:      "type:!op:value"       → neg: true, strip the !
 *   Multi-value:   "type:inc:val1,val2"   → string[] value
 *   Exists:        "type:ex" or "type:key:ex" → no value
 *
 * Returns a FirewallCondition object or an error string.
 */
export function parseConditionFlag(flag: string): FirewallCondition | string {
  const parts = flag.split(':');

  if (parts.length < 2) {
    return `Invalid condition format: "${flag}". Expected "type:op:value" or "type:key:op:value".`;
  }

  const type = parts[0];
  const meta = CONDITION_TYPE_MAP[type];

  // Allow unknown types (lenient — the API will validate)
  // but warn-level: we can still parse the format
  const requiresKey = meta?.requiresKey ?? false;

  let key: string | undefined;
  let opRaw: string;
  let valueRaw: string | undefined;

  if (requiresKey) {
    // type:key:op:value — split on first 3 colons
    if (parts.length < 3) {
      return `Condition type "${type}" requires a key. Format: "${type}:key:op:value".`;
    }
    key = parts[1];
    opRaw = parts[2];
    valueRaw = parts.length > 3 ? parts.slice(3).join(':') : undefined;
  } else {
    // type:op:value — split on first 2 colons
    opRaw = parts[1];
    valueRaw = parts.length > 2 ? parts.slice(2).join(':') : undefined;
  }

  // Handle negation prefix
  let neg = false;
  let op = opRaw;
  if (opRaw.startsWith('!')) {
    neg = true;
    op = opRaw.slice(1);
  }

  // Validate operator
  if (!ALL_OPERATORS.includes(op)) {
    const validOps = meta
      ? meta.operators.join(', ')
      : ALL_OPERATORS.join(', ');
    return `Invalid operator "${opRaw}" for condition type "${type}". Valid operators: ${validOps}`;
  }

  // Build the condition
  const condition: FirewallCondition = { type, op };

  if (neg) {
    condition.neg = true;
  }

  if (key) {
    condition.key = key;
  }

  // Handle value based on operator
  if (op === 'ex') {
    // Exists operator — no value
  } else if (op === 'inc') {
    // Multi-value — split on commas
    if (!valueRaw) {
      return `Operator "inc" requires a value. Format: "${type}:inc:val1,val2".`;
    }
    condition.value = valueRaw.split(',').map(v => v.trim());
  } else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    // Numeric operators
    if (!valueRaw) {
      return `Operator "${op}" requires a numeric value.`;
    }
    const num = Number(valueRaw);
    if (Number.isNaN(num)) {
      return `Operator "${op}" requires a numeric value, got "${valueRaw}".`;
    }
    condition.value = num;
  } else if (op === 're') {
    // Regex operator — validate as valid RegExp
    if (!valueRaw) {
      return `Operator "re" requires a regex pattern.`;
    }
    try {
      new RegExp(valueRaw);
    } catch {
      return `Invalid regex pattern: "${valueRaw}". Please provide a valid regular expression.`;
    }
    condition.value = valueRaw;
  } else {
    // String operators — value required
    if (!valueRaw) {
      return `Operator "${op}" requires a value. Format: "${type}:${op}:value".`;
    }
    condition.value = valueRaw;
  }

  return condition;
}
