/**
 * Shared interactive helpers for route commands (add, edit).
 * Contains constants, pure utilities, flag processing, and interactive collectors
 * for actions, conditions, and transforms.
 */
import type Client from '../client';
import output from '../../output-manager';
import {
  collectTransforms,
  collectResponseHeaders,
  type TransformFlags,
} from './parse-transforms';
import type { Transform, SrcSyntax } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_NAME_LENGTH = 256;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_CONDITIONS = 16;
export const VALID_SYNTAXES: SrcSyntax[] = [
  'regex',
  'path-to-regexp',
  'equals',
];
export const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];
export const VALID_ACTION_TYPES = [
  'rewrite',
  'redirect',
  'set-status',
] as const;
export type ActionType = (typeof VALID_ACTION_TYPES)[number];

// ---------------------------------------------------------------------------
// Action choices for interactive menus
// ---------------------------------------------------------------------------

export interface ActionChoice {
  name: string;
  value: string;
  exclusive?: boolean;
}

export const ALL_ACTION_CHOICES: ActionChoice[] = [
  { name: 'Rewrite', value: 'rewrite', exclusive: true },
  { name: 'Redirect', value: 'redirect', exclusive: true },
  { name: 'Set Status Code', value: 'set-status', exclusive: true },
  { name: 'Response Headers', value: 'response-headers' },
  { name: 'Request Headers', value: 'request-headers' },
  { name: 'Request Query', value: 'request-query' },
];

// ---------------------------------------------------------------------------
// Pure utilities
// ---------------------------------------------------------------------------

/**
 * Strips leading and trailing quotes (single or double) from a string.
 */
export function stripQuotes(str: string): string {
  if (str.startsWith('"') && str.endsWith('"') && str.length >= 2) {
    return str.slice(1, -1);
  }
  if (str.startsWith("'") && str.endsWith("'") && str.length >= 2) {
    return str.slice(1, -1);
  }
  return str;
}

// Condition operators and compilation are in parse-conditions.ts

// ---------------------------------------------------------------------------
// Flag processing
// ---------------------------------------------------------------------------

/**
 * Extracts transform flags from parsed CLI flags into a typed object.
 */
export function extractTransformFlags(
  flags: Record<string, unknown>
): TransformFlags {
  return {
    setResponseHeader: flags['--set-response-header'] as string[] | undefined,
    appendResponseHeader: flags['--append-response-header'] as
      | string[]
      | undefined,
    deleteResponseHeader: flags['--delete-response-header'] as
      | string[]
      | undefined,
    setRequestHeader: flags['--set-request-header'] as string[] | undefined,
    appendRequestHeader: flags['--append-request-header'] as
      | string[]
      | undefined,
    deleteRequestHeader: flags['--delete-request-header'] as
      | string[]
      | undefined,
    setRequestQuery: flags['--set-request-query'] as string[] | undefined,
    appendRequestQuery: flags['--append-request-query'] as string[] | undefined,
    deleteRequestQuery: flags['--delete-request-query'] as string[] | undefined,
  };
}

/**
 * Collects headers and transforms from transform flags.
 * Response header 'set' operations go to headers object (matching frontend behavior).
 * All other operations go to transforms array.
 */
export function collectHeadersAndTransforms(transformFlags: TransformFlags): {
  headers: Record<string, string>;
  transforms: Transform[];
} {
  const headers = transformFlags.setResponseHeader
    ? collectResponseHeaders(transformFlags.setResponseHeader)
    : {};

  const transforms = collectTransforms({
    ...transformFlags,
    setResponseHeader: undefined, // Already handled in headers
  });

  return { headers, transforms };
}

/**
 * Returns true if any transform flags are set.
 */
export function hasAnyTransformFlags(flags: Record<string, unknown>): boolean {
  const tf = extractTransformFlags(flags);
  return !!(
    tf.setResponseHeader ||
    tf.appendResponseHeader ||
    tf.deleteResponseHeader ||
    tf.setRequestHeader ||
    tf.appendRequestHeader ||
    tf.deleteRequestHeader ||
    tf.setRequestQuery ||
    tf.appendRequestQuery ||
    tf.deleteRequestQuery
  );
}

// ---------------------------------------------------------------------------
// Action type validation for flag mode
// ---------------------------------------------------------------------------

/**
 * Validates the --action flag value and its required companion flags.
 * Returns an error message string or null if valid.
 */
export function validateActionFlags(
  action: string | undefined,
  dest: string | undefined,
  status: number | undefined
): string | null {
  if (!action) {
    // No --action flag. If dest or status is provided, that's an error.
    if (dest || status !== undefined) {
      return '--action is required when using --dest or --status. Use --action rewrite, --action redirect, or --action set-status.';
    }
    return null;
  }

  if (!VALID_ACTION_TYPES.includes(action as ActionType)) {
    return `Invalid action type: "${action}". Valid types: ${VALID_ACTION_TYPES.join(', ')}`;
  }

  switch (action) {
    case 'rewrite':
      if (!dest) return '--action rewrite requires --dest.';
      if (status !== undefined)
        return '--action rewrite does not accept --status.';
      break;
    case 'redirect':
      if (!dest) return '--action redirect requires --dest.';
      if (status === undefined)
        return '--action redirect requires --status (301, 302, 307, or 308).';
      if (!REDIRECT_STATUS_CODES.includes(status))
        return `Invalid redirect status: ${status}. Must be one of: ${REDIRECT_STATUS_CODES.join(', ')}`;
      break;
    case 'set-status':
      if (dest) return '--action set-status does not accept --dest.';
      if (status === undefined) return '--action set-status requires --status.';
      if (status < 100 || status > 599)
        return 'Status code must be between 100 and 599.';
      break;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Interactive collectors
// ---------------------------------------------------------------------------

/**
 * Collects the details for a specific action type interactively.
 * Prompts for destination, status code, etc. based on the action type.
 * Sets the result on the flags object for later processing.
 */
export async function collectActionDetails(
  client: Client,
  actionType: string,
  flags: Record<string, unknown>
): Promise<void> {
  switch (actionType) {
    case 'rewrite': {
      const dest = await client.input.text({
        message: 'Destination URL:',
        validate: val => (val ? true : 'Destination is required'),
      });
      Object.assign(flags, { '--dest': dest });
      break;
    }
    case 'redirect': {
      const dest = await client.input.text({
        message: 'Destination URL:',
        validate: val => (val ? true : 'Destination is required'),
      });
      const status = await client.input.select({
        message: 'Status code:',
        choices: [
          { name: '307 - Temporary Redirect (preserves method)', value: 307 },
          { name: '308 - Permanent Redirect (preserves method)', value: 308 },
          { name: '301 - Moved Permanently (may change to GET)', value: 301 },
          { name: '302 - Found (may change to GET)', value: 302 },
        ],
      });
      Object.assign(flags, { '--dest': dest, '--status': status });
      break;
    }
    case 'set-status': {
      const statusCode = await client.input.text({
        message: 'HTTP status code:',
        validate: val => {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 100 || num > 599) {
            return 'Status code must be between 100 and 599';
          }
          return true;
        },
      });
      Object.assign(flags, { '--status': parseInt(statusCode, 10) });
      break;
    }
    case 'response-headers': {
      await collectInteractiveHeaders(client, 'response', flags);
      break;
    }
    case 'request-headers': {
      await collectInteractiveHeaders(client, 'request-header', flags);
      break;
    }
    case 'request-query': {
      await collectInteractiveHeaders(client, 'request-query', flags);
      break;
    }
  }
}

/**
 * Interactive condition collection with operator support.
 * Supports equals, contains, matches (regex), and exists operators,
 * matching the frontend's condition-rows.tsx behavior.
 */
export async function collectInteractiveConditions(
  client: Client,
  flags: Record<string, unknown>
): Promise<void> {
  let addMore = true;

  while (addMore) {
    const currentHas = (flags['--has'] as string[]) || [];
    const currentMissing = (flags['--missing'] as string[]) || [];

    if (currentHas.length > 0 || currentMissing.length > 0) {
      output.log('\nCurrent conditions:');
      for (const c of currentHas) {
        output.print(`  has: ${c}\n`);
      }
      for (const c of currentMissing) {
        output.print(`  missing: ${c}\n`);
      }
      output.print('\n');
    }

    const conditionType = await client.input.select({
      message: 'Condition type:',
      choices: [
        { name: 'has - Request must have this', value: 'has' },
        { name: 'missing - Request must NOT have this', value: 'missing' },
      ],
    });

    const targetType = await client.input.select({
      message: 'What to check:',
      choices: [
        { name: 'Header', value: 'header' },
        { name: 'Cookie', value: 'cookie' },
        { name: 'Query Parameter', value: 'query' },
        { name: 'Host', value: 'host' },
      ],
    });

    let conditionValue: string;

    if (targetType === 'host') {
      const operator = await client.input.select({
        message: 'How to match the host:',
        choices: [
          { name: 'Equals', value: 'eq' },
          { name: 'Contains', value: 'contains' },
          { name: 'Matches (regex)', value: 're' },
        ],
      });

      const hostInput = await client.input.text({
        message: operator === 're' ? 'Host pattern (regex):' : 'Host value:',
        validate: val => {
          if (!val) return 'Host value is required';
          if (operator === 're') {
            try {
              new RegExp(val);
              return true;
            } catch {
              return 'Invalid regex pattern';
            }
          }
          return true;
        },
      });

      // Store as host:op=value — parseConditions will compile the operator
      conditionValue = `host:${operator}=${hostInput}`;
    } else {
      const key = await client.input.text({
        message: `${targetType.charAt(0).toUpperCase() + targetType.slice(1)} name:`,
        validate: val => (val ? true : `${targetType} name is required`),
      });

      const operator = await client.input.select({
        message: 'How to match the value:',
        choices: [
          { name: 'Exists (any value)', value: 'exists' },
          { name: 'Equals', value: 'eq' },
          { name: 'Contains', value: 'contains' },
          { name: 'Matches (regex)', value: 're' },
        ],
      });

      if (operator === 'exists') {
        // Store as type:key:exists — parseConditions will handle it
        conditionValue = `${targetType}:${key}:exists`;
      } else {
        const valueInput = await client.input.text({
          message: operator === 're' ? 'Value pattern (regex):' : 'Value:',
          validate: val => {
            if (!val) return 'Value is required';
            if (operator === 're') {
              try {
                new RegExp(val);
                return true;
              } catch {
                return 'Invalid regex pattern';
              }
            }
            return true;
          },
        });

        // Store as type:key:op=value — parseConditions will compile the operator
        conditionValue = `${targetType}:${key}:${operator}=${valueInput}`;
      }
    }

    const flagName = conditionType === 'has' ? '--has' : '--missing';
    const existing = (flags[flagName] as string[]) || [];
    flags[flagName] = [...existing, conditionValue];

    const totalConditions =
      ((flags['--has'] as string[]) || []).length +
      ((flags['--missing'] as string[]) || []).length;

    if (totalConditions >= MAX_CONDITIONS) {
      output.warn(`Maximum ${MAX_CONDITIONS} conditions reached.`);
      break;
    }

    addMore = await client.input.confirm('Add another condition?', false);
  }
}

/**
 * Formats currently collected headers/params from flags for display.
 */
export function formatCollectedItems(
  flags: Record<string, unknown>,
  type: 'response' | 'request-header' | 'request-query'
): string[] {
  const items: string[] = [];
  const prefix =
    type === 'response'
      ? 'response-header'
      : type === 'request-header'
        ? 'request-header'
        : 'request-query';

  const setItems = (flags[`--set-${prefix}`] as string[]) || [];
  const appendItems = (flags[`--append-${prefix}`] as string[]) || [];
  const deleteItems = (flags[`--delete-${prefix}`] as string[]) || [];

  for (const item of setItems) {
    items.push(`  set: ${item}`);
  }
  for (const item of appendItems) {
    items.push(`  append: ${item}`);
  }
  for (const item of deleteItems) {
    items.push(`  delete: ${item}`);
  }

  return items;
}

/**
 * Interactive header/transform collection for modify actions.
 * Supports response headers, request headers, and request query parameters.
 */
export async function collectInteractiveHeaders(
  client: Client,
  type: 'response' | 'request-header' | 'request-query',
  flags: Record<string, unknown>
): Promise<void> {
  const flagName =
    type === 'response'
      ? '--set-response-header'
      : type === 'request-header'
        ? '--set-request-header'
        : '--set-request-query';

  const sectionName =
    type === 'response'
      ? 'Response Headers'
      : type === 'request-header'
        ? 'Request Headers'
        : 'Request Query Parameters';

  const itemName =
    type === 'response'
      ? 'response header'
      : type === 'request-header'
        ? 'request header'
        : 'query parameter';

  output.log(`\n--- ${sectionName} ---`);

  let addMore = true;
  while (addMore) {
    const collected = formatCollectedItems(flags, type);
    if (collected.length > 0) {
      output.log(`\nCurrent ${sectionName.toLowerCase()}:`);
      for (const item of collected) {
        output.print(`${item}\n`);
      }
      output.print('\n');
    }

    const op = await client.input.select({
      message: `${sectionName} operation:`,
      choices: [
        { name: 'Set', value: 'set' },
        { name: 'Append', value: 'append' },
        { name: 'Delete', value: 'delete' },
      ],
    });

    const key = await client.input.text({
      message: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} name:`,
      validate: val => (val ? true : `${itemName} name is required`),
    });

    if (op === 'delete') {
      const opFlagName = flagName.replace('--set-', '--delete-');
      const existing = (flags[opFlagName] as string[]) || [];
      flags[opFlagName] = [...existing, key];
    } else {
      const value = await client.input.text({
        message: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} value:`,
      });
      const opFlagName =
        op === 'append' ? flagName.replace('--set-', '--append-') : flagName;
      const existing = (flags[opFlagName] as string[]) || [];
      flags[opFlagName] = [...existing, `${key}=${value}`];
    }

    addMore = await client.input.confirm(`Add another ${itemName}?`, false);
  }
}
