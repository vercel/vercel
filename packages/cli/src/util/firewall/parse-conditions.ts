import type { FirewallCondition, FirewallConditionGroup } from './types';
import { CONDITION_TYPE_MAP, ALL_OPERATORS } from './condition-types';

export interface ParsedConditionGroups {
  groups: FirewallConditionGroup[];
}

/**
 * Parse --condition flags and --or separators into condition groups.
 *
 * Each --condition value is a JSON object matching the API's condition format:
 *   {"type":"path","op":"pre","value":"/api"}
 *   {"type":"geo_country","op":"eq","neg":true,"value":"US"}
 *   {"type":"header","key":"Authorization","op":"ex"}
 *
 * --condition flags within the same group are AND'd.
 * --or starts a new OR group.
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
 * Parse a single --condition flag value (JSON object).
 *
 * Required fields: type, op
 * Optional fields: value, key, neg
 *
 * Returns a FirewallCondition object or an error string.
 */
export function parseConditionFlag(flag: string): FirewallCondition | string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(flag);
  } catch {
    return `Invalid condition JSON: "${flag}". Expected a JSON object like {"type":"path","op":"pre","value":"/api"}.`;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return `Invalid condition: expected a JSON object, got ${typeof parsed}.`;
  }

  // Validate type
  const type = parsed.type;
  if (!type || typeof type !== 'string') {
    return 'Condition must have a "type" field (string).';
  }
  const meta = CONDITION_TYPE_MAP[type];

  // Validate op
  const op = parsed.op;
  if (!op || typeof op !== 'string') {
    return `Condition must have an "op" field (string). Valid operators: ${ALL_OPERATORS.join(', ')}`;
  }

  if (!ALL_OPERATORS.includes(op)) {
    const validOps = meta
      ? meta.operators.join(', ')
      : ALL_OPERATORS.join(', ');
    return `Invalid operator "${op}" for condition type "${type}". Valid operators: ${validOps}`;
  }

  // Validate key for keyed types
  const requiresKey = meta?.requiresKey ?? false;
  const key = parsed.key as string | undefined;
  if (requiresKey && !key) {
    return `Condition type "${type}" requires a "key" field. Example: {"type":"${type}","key":"name","op":"${op}","value":"..."}`;
  }

  // Validate neg
  const neg = parsed.neg === true;

  // Build the condition
  const condition: FirewallCondition = { type, op };

  if (neg) {
    condition.neg = true;
  }

  if (key) {
    condition.key = key;
  }

  // Handle value based on operator
  const value = parsed.value;

  if (op === 'ex' || op === 'nex') {
    // Exists / not-exists operators — no value needed
  } else if (op === 'inc' || op === 'ninc') {
    // Multi-value — accept array or comma-separated string
    if (!value) {
      return `Operator "inc" requires a "value" field. Example: {"type":"${type}","op":"inc","value":"val1,val2"}`;
    }
    if (Array.isArray(value)) {
      condition.value = value.map(String);
    } else {
      condition.value = String(value)
        .split(',')
        .map(v => v.trim());
    }
  } else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    // Numeric operators
    if (value === undefined || value === null) {
      return `Operator "${op}" requires a numeric "value" field.`;
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      return `Operator "${op}" requires a numeric value, got "${value}".`;
    }
    condition.value = num;
  } else if (op === 're') {
    // Regex operator
    if (!value) {
      return 'Operator "re" requires a "value" field with a regex pattern.';
    }
    try {
      new RegExp(String(value));
    } catch {
      return `Invalid regex pattern: "${value}".`;
    }
    condition.value = String(value);
  } else {
    // String operators — value required
    if (value === undefined || value === null) {
      return `Operator "${op}" requires a "value" field.`;
    }
    condition.value = String(value);
  }

  return condition;
}
