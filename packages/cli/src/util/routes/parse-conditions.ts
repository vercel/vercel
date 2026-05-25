import type { HasField } from './types';

/**
 * Condition operators supported by the CLI.
 * These match the frontend's condition-rows.tsx operators.
 */
export type ConditionOperator = 'eq' | 'contains' | 're' | 'exists';
const CONDITION_OPERATORS: ConditionOperator[] = [
  'eq',
  'contains',
  're',
  'exists',
];

/**
 * Escapes special regex characters in a string.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a condition operator and value to a regex pattern for the API.
 * Matches the frontend's buildConditionValue() in form-state.ts.
 *
 * - exists → undefined (no value, presence check only)
 * - re → raw regex string
 * - contains → .*escapedValue.*
 * - eq → ^escapedValue$
 */
export function buildConditionValue(
  operator: ConditionOperator,
  value: string
): string | undefined {
  if (operator === 'exists') return undefined;
  if (operator === 're') return value;
  const escapedValue = escapeRegExp(value);
  if (operator === 'contains') return `.*${escapedValue}.*`;
  // 'eq'
  return `^${escapedValue}$`;
}

/**
 * Validates that a string is a valid regex pattern.
 * Throws an error if the pattern is invalid.
 */
function validateRegexPattern(pattern: string, context: string): void {
  try {
    new RegExp(pattern);
  } catch (e) {
    throw new Error(
      `Invalid regex in ${context}: "${pattern}". ${e instanceof Error ? e.message : ''}`
    );
  }
}

/**
 * Detects if a value string uses the operator syntax: op=value
 * Returns the operator and raw value, or null if no operator detected.
 *
 * Known operators: eq, contains, re, exists
 */
function parseOperatorValue(
  valuePart: string
): { operator: ConditionOperator; rawValue: string } | null {
  // Check for "exists" (no = needed)
  if (valuePart === 'exists') {
    return { operator: 'exists', rawValue: '' };
  }

  // Check for op=value pattern
  const eqIdx = valuePart.indexOf('=');
  if (eqIdx === -1) return null;

  const maybeOp = valuePart.slice(0, eqIdx);
  if (CONDITION_OPERATORS.includes(maybeOp as ConditionOperator)) {
    return {
      operator: maybeOp as ConditionOperator,
      rawValue: valuePart.slice(eqIdx + 1),
    };
  }

  return null;
}

/**
 * Parses condition strings from CLI flags into HasField objects.
 *
 * Supported formats:
 *   type:key                         → exists (no value)
 *   type:key:value                   → raw regex value (backward compatible)
 *   type:key:eq=value                → equals (compiled to ^escapedValue$)
 *   type:key:contains=value          → contains (compiled to .*escapedValue.*)
 *   type:key:re=value                → explicit regex
 *   type:key:exists                  → explicit exists
 *   host:value                       → raw regex (backward compatible)
 *   host:eq=value                    → equals
 *   host:contains=value              → contains
 *
 * Examples:
 *   header:Authorization             → { type: 'header', key: 'Authorization' }
 *   header:X-API-Key:eq=secret       → { type: 'header', key: 'X-API-Key', value: '^secret$' }
 *   header:Accept:contains=json      → { type: 'header', key: 'Accept', value: '.*json.*' }
 *   header:Accept:text/html          → { type: 'header', key: 'Accept', value: 'text/html' }
 *   cookie:session:exists            → { type: 'cookie', key: 'session' }
 *   host:eq=example.com              → { type: 'host', value: '^example\\.com$' }
 *   host:api.example.com             → { type: 'host', value: 'api.example.com' }
 *
 * @param conditions Array of condition strings from CLI
 * @returns Array of HasField objects
 * @throws Error if a condition is invalid or contains invalid regex
 */
export function parseConditions(conditions: string[]): HasField[] {
  return conditions.map(parseCondition);
}

/**
 * Parses a single condition string into a HasField object.
 */
export function parseCondition(condition: string): HasField {
  const parts = condition.split(':');

  if (parts.length < 2) {
    throw new Error(
      `Invalid condition format: "${condition}". Expected format: type:key or type:key:value`
    );
  }

  const type = parts[0].toLowerCase();
  const validTypes = ['header', 'cookie', 'query', 'host'];

  if (!validTypes.includes(type)) {
    throw new Error(
      `Invalid condition type: "${type}". Valid types: ${validTypes.join(', ')}`
    );
  }

  if (type === 'host') {
    // Host format: host:value or host:op=value
    const rawValue = parts.slice(1).join(':');
    if (!rawValue) {
      throw new Error('Host condition requires a value');
    }

    // Check for operator syntax
    const opResult = parseOperatorValue(rawValue);
    if (opResult) {
      if (opResult.operator === 'exists') {
        throw new Error(
          'Host condition does not support "exists" operator (host always has a value)'
        );
      }
      if (opResult.operator !== 're' && !opResult.rawValue) {
        throw new Error(
          `Host condition with "${opResult.operator}" operator requires a value`
        );
      }
      const compiledValue = buildConditionValue(
        opResult.operator,
        opResult.rawValue
      );
      if (compiledValue !== undefined) {
        validateRegexPattern(compiledValue, 'host condition');
      }
      return { type: 'host', value: compiledValue! };
    }

    // No operator — treat as raw regex (backward compatible)
    validateRegexPattern(rawValue, 'host condition');
    return { type: 'host', value: rawValue };
  }

  // For header, cookie, query: key is required
  const key = parts[1];
  if (!key) {
    throw new Error(`${type} condition requires a key`);
  }

  // Value part is everything after type:key
  const valuePart = parts.length > 2 ? parts.slice(2).join(':') : undefined;

  if (valuePart === undefined) {
    // No value → exists check
    return { type: type as 'header' | 'cookie' | 'query', key };
  }

  // Check for operator syntax in value part
  const opResult = parseOperatorValue(valuePart);
  if (opResult) {
    if (opResult.operator === 'exists') {
      // Explicit exists — return without value
      return { type: type as 'header' | 'cookie' | 'query', key };
    }
    if (opResult.operator !== 're' && !opResult.rawValue) {
      throw new Error(
        `Condition "${opResult.operator}" operator requires a value after "="`
      );
    }
    const compiledValue = buildConditionValue(
      opResult.operator,
      opResult.rawValue
    );
    if (compiledValue !== undefined) {
      validateRegexPattern(compiledValue, `${type} condition value`);
    }
    return {
      type: type as 'header' | 'cookie' | 'query',
      key,
      ...(compiledValue !== undefined && { value: compiledValue }),
    };
  }

  // No operator — treat as raw regex (backward compatible)
  validateRegexPattern(valuePart, `${type} condition value`);
  return {
    type: type as 'header' | 'cookie' | 'query',
    key,
    value: valuePart,
  };
}

/**
 * Formats a HasField object back to CLI format for display.
 */
export function formatCondition(field: HasField): string {
  if (field.type === 'host') {
    return `host:${field.value}`;
  }
  if (field.value) {
    return `${field.type}:${field.key}:${field.value}`;
  }
  return `${field.type}:${field.key}`;
}
