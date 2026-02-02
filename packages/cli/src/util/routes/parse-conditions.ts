import type { HasField } from './types';

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
 * Parses condition strings from CLI flags into HasField objects.
 *
 * Format: type:key or type:key:value
 *
 * Examples:
 *   - header:Authorization -> { type: 'header', key: 'Authorization' }
 *   - header:X-API-Key:secret.* -> { type: 'header', key: 'X-API-Key', value: 'secret.*' }
 *   - cookie:session -> { type: 'cookie', key: 'session' }
 *   - query:debug -> { type: 'query', key: 'debug' }
 *   - query:version:2 -> { type: 'query', key: 'version', value: '2' }
 *   - host:api.example.com -> { type: 'host', value: 'api.example.com' }
 *
 * Note: Condition values are interpreted as regex patterns by the server,
 * so this function validates that any provided value is a valid regex.
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
  // Split by colon, but only on the first two colons (to allow colons in values)
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
    // Host only has type:value format
    const value = parts.slice(1).join(':');
    if (!value) {
      throw new Error('Host condition requires a value');
    }
    // Validate host value as regex pattern
    validateRegexPattern(value, 'host condition');
    return { type: 'host', value };
  }

  // For header, cookie, query: key is required
  const key = parts[1];
  if (!key) {
    throw new Error(`${type} condition requires a key`);
  }

  // Value is optional (everything after the second colon)
  const value = parts.length > 2 ? parts.slice(2).join(':') : undefined;

  // Validate value as regex pattern if provided
  if (value !== undefined) {
    validateRegexPattern(value, `${type} condition value`);
  }

  return {
    type: type as 'header' | 'cookie' | 'query',
    key,
    ...(value !== undefined && { value }),
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
