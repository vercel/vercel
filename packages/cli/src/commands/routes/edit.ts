import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { editSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoute,
  offerAutoPromote,
  formatCondition as formatConditionDisplay,
  formatTransform as formatTransformDisplay,
} from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import editRoute from '../../util/routes/edit-route';
import { parseConditions } from '../../util/routes/parse-conditions';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_CONDITIONS,
  VALID_SYNTAXES,
  REDIRECT_STATUS_CODES,
  VALID_ACTION_TYPES,
  stripQuotes,
  extractTransformFlags,
  collectHeadersAndTransforms,
  hasAnyTransformFlags,
  collectActionDetails,
  collectInteractiveConditions,
  collectInteractiveHeaders,
} from '../../util/routes/interactive';
import type {
  RoutingRule,
  HasField,
  Transform,
  SrcSyntax,
} from '../../util/routes/types';

// ---------------------------------------------------------------------------
// Helpers for displaying current route state
// ---------------------------------------------------------------------------

/**
 * Determines the primary action type of a route based on its dest/status fields.
 */
function getPrimaryActionType(
  route: RoutingRule
): 'rewrite' | 'redirect' | 'set-status' | null {
  const { dest, status } = route.route;
  if (dest && status && REDIRECT_STATUS_CODES.includes(status)) {
    return 'redirect';
  }
  if (dest) return 'rewrite';
  if (status) return 'set-status';
  return null;
}

/**
 * Returns a human-readable label for the primary action.
 */
function getPrimaryActionLabel(route: RoutingRule): string {
  const actionType = getPrimaryActionType(route);
  switch (actionType) {
    case 'rewrite':
      return `Rewrite → ${route.route.dest}`;
    case 'redirect':
      return `Redirect → ${route.route.dest} (${route.route.status})`;
    case 'set-status':
      return `Set Status ${route.route.status}`;
    default:
      return '(none)';
  }
}

/**
 * Gets response headers from the route's headers object.
 */
function getResponseHeaders(
  route: RoutingRule
): { key: string; value: string }[] {
  const headers = route.route.headers ?? {};
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

/**
 * Gets transforms of a specific type from the route.
 */
function getTransformsByType(route: RoutingRule, type: string): Transform[] {
  const transforms = (route.route.transforms ?? []) as Transform[];
  return transforms.filter(t => t.type === type);
}

/**
 * Prints the current route configuration in detail.
 */
function printRouteConfig(route: RoutingRule): void {
  output.print('\n');
  output.print(`  ${chalk.cyan('Name:')}         ${route.name}\n`);
  if (route.description) {
    output.print(`  ${chalk.cyan('Description:')}  ${route.description}\n`);
  }
  output.print(
    `  ${chalk.cyan('Source:')}       ${route.route.src}  ${chalk.gray(`(${route.srcSyntax ?? 'regex'})`)}\n`
  );
  output.print(
    `  ${chalk.cyan('Status:')}       ${route.enabled === false ? chalk.red('Disabled') : chalk.green('Enabled')}\n`
  );

  // Primary action
  const actionLabel = getPrimaryActionLabel(route);
  output.print(`  ${chalk.cyan('Action:')}       ${actionLabel}\n`);

  // Has conditions
  const hasConds = (route.route.has ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;
  if (hasConds.length > 0) {
    output.print(`\n  ${chalk.cyan('Has conditions:')}\n`);
    for (const c of hasConds) {
      output.print(`    ${formatConditionDisplay(c)}\n`);
    }
  }

  // Missing conditions
  const missingConds = (route.route.missing ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;
  if (missingConds.length > 0) {
    output.print(`\n  ${chalk.cyan('Missing conditions:')}\n`);
    for (const c of missingConds) {
      output.print(`    ${formatConditionDisplay(c)}\n`);
    }
  }

  // Response headers
  const responseHeaders = getResponseHeaders(route);
  if (responseHeaders.length > 0) {
    output.print(`\n  ${chalk.cyan('Response Headers:')}\n`);
    for (const h of responseHeaders) {
      output.print(`    ${chalk.cyan(h.key)} = ${h.value}\n`);
    }
  }

  // Request headers
  const requestHeaders = getTransformsByType(route, 'request.headers');
  if (requestHeaders.length > 0) {
    output.print(`\n  ${chalk.cyan('Request Headers:')}\n`);
    for (const t of requestHeaders) {
      output.print(`    ${formatTransformDisplay(t)}\n`);
    }
  }

  // Request query
  const requestQuery = getTransformsByType(route, 'request.query');
  if (requestQuery.length > 0) {
    output.print(`\n  ${chalk.cyan('Request Query:')}\n`);
    for (const t of requestQuery) {
      output.print(`    ${formatTransformDisplay(t)}\n`);
    }
  }

  output.print('\n');
}

// ---------------------------------------------------------------------------
// Deep clone helper
// ---------------------------------------------------------------------------

/**
 * Deep-clones a routing rule so we can safely mutate it.
 */
function cloneRoute(route: RoutingRule): RoutingRule {
  return JSON.parse(JSON.stringify(route));
}

// ---------------------------------------------------------------------------
// Flag-based mutations
// ---------------------------------------------------------------------------

/**
 * Applies flag-based mutations to a cloned route.
 * Returns an error message if invalid, or null on success.
 */
function applyFlagMutations(
  route: RoutingRule,
  flags: Record<string, unknown>
): string | null {
  // Metadata
  if (flags['--name'] !== undefined) {
    const name = flags['--name'] as string;
    if (name.length > MAX_NAME_LENGTH) {
      return `Name must be ${MAX_NAME_LENGTH} characters or less.`;
    }
    route.name = name;
  }

  if (flags['--description'] !== undefined) {
    const desc = flags['--description'] as string;
    if (desc.length > MAX_DESCRIPTION_LENGTH) {
      return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`;
    }
    route.description = desc || undefined;
  }

  // Source
  if (flags['--src'] !== undefined) {
    route.route.src = stripQuotes(flags['--src'] as string);
  }

  if (flags['--src-syntax'] !== undefined) {
    const syntax = flags['--src-syntax'] as string;
    if (!VALID_SYNTAXES.includes(syntax as SrcSyntax)) {
      return `Invalid syntax: "${syntax}". Valid options: ${VALID_SYNTAXES.join(', ')}`;
    }
    route.srcSyntax = syntax as SrcSyntax;
  }

  // Primary action
  const actionFlag = flags['--action'] as string | undefined;
  const destFlag = flags['--dest'] as string | undefined;
  const statusFlag = flags['--status'] as number | undefined;
  const noDest = flags['--no-dest'] as boolean | undefined;
  const noStatus = flags['--no-status'] as boolean | undefined;

  if (actionFlag) {
    // Explicit action type change
    if (!VALID_ACTION_TYPES.includes(actionFlag as any)) {
      return `Invalid action type: "${actionFlag}". Valid types: ${VALID_ACTION_TYPES.join(', ')}`;
    }

    switch (actionFlag) {
      case 'rewrite': {
        const dest = destFlag ? stripQuotes(destFlag) : undefined;
        if (!dest) return '--action rewrite requires --dest.';
        route.route.dest = dest;
        delete (route.route as any).status;
        break;
      }
      case 'redirect': {
        const dest = destFlag ? stripQuotes(destFlag) : undefined;
        if (!dest) return '--action redirect requires --dest.';
        if (statusFlag === undefined)
          return `--action redirect requires --status (${REDIRECT_STATUS_CODES.join(', ')}).`;
        if (!REDIRECT_STATUS_CODES.includes(statusFlag))
          return `Invalid redirect status: ${statusFlag}. Must be one of: ${REDIRECT_STATUS_CODES.join(', ')}`;
        route.route.dest = dest;
        route.route.status = statusFlag;
        break;
      }
      case 'set-status': {
        if (statusFlag === undefined)
          return '--action set-status requires --status.';
        if (statusFlag < 100 || statusFlag > 599)
          return 'Status code must be between 100 and 599.';
        delete (route.route as any).dest;
        route.route.status = statusFlag;
        break;
      }
    }
  } else {
    // No --action: modify existing values in-place
    if (destFlag !== undefined) {
      route.route.dest = stripQuotes(destFlag);
    }
    if (statusFlag !== undefined) {
      route.route.status = statusFlag;
    }
    if (noDest) {
      delete (route.route as any).dest;
    }
    if (noStatus) {
      delete (route.route as any).status;
    }
  }

  // Clear flags (applied before additive flags)
  if (flags['--clear-conditions']) {
    (route.route as any).has = [];
    (route.route as any).missing = [];
  }

  if (flags['--clear-headers']) {
    route.route.headers = {};
  }

  if (flags['--clear-transforms']) {
    (route.route as any).transforms = [];
  }

  // Additive: response headers
  const transformFlags = extractTransformFlags(flags);
  try {
    const { headers, transforms } = collectHeadersAndTransforms(transformFlags);

    // Merge response headers (set headers overwrite same key)
    if (Object.keys(headers).length > 0) {
      route.route.headers = {
        ...(route.route.headers ?? {}),
        ...headers,
      };
    }

    // Append new transforms
    if (transforms.length > 0) {
      const existing = ((route.route as any).transforms ?? []) as Transform[];
      (route.route as any).transforms = [...existing, ...transforms];
    }
  } catch (e) {
    return `Invalid transform format. ${e instanceof Error ? e.message : ''}`;
  }

  // Additive: conditions
  const hasFlags = flags['--has'] as string[] | undefined;
  const missingFlags = flags['--missing'] as string[] | undefined;

  try {
    if (hasFlags) {
      const newHas = parseConditions(hasFlags);
      const existingHas = ((route.route as any).has ?? []) as HasField[];
      (route.route as any).has = [...existingHas, ...newHas];
    }
    if (missingFlags) {
      const newMissing = parseConditions(missingFlags);
      const existingMissing = ((route.route as any).missing ??
        []) as HasField[];
      (route.route as any).missing = [...existingMissing, ...newMissing];
    }
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid condition format';
  }

  // Validate max conditions
  const totalConditions =
    ((route.route as any).has ?? []).length +
    ((route.route as any).missing ?? []).length;
  if (totalConditions > MAX_CONDITIONS) {
    return `Too many conditions: ${totalConditions}. Maximum is ${MAX_CONDITIONS}.`;
  }

  // Validate the route still has some action after mutations
  const hasDest = !!route.route.dest;
  const hasStatus = !!route.route.status;
  const hasHeaders = Object.keys(route.route.headers ?? {}).length > 0;
  const hasTransforms = ((route.route as any).transforms ?? []).length > 0;

  if (!hasDest && !hasStatus && !hasHeaders && !hasTransforms) {
    return 'This edit would leave the route with no action. Add --action, headers, or transforms.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Interactive edit sub-menus
// ---------------------------------------------------------------------------

async function editName(client: Client, route: RoutingRule): Promise<void> {
  const name = await client.input.text({
    message: `Name (current: ${route.name}):`,
    validate: val => {
      if (!val) return 'Route name is required';
      if (val.length > MAX_NAME_LENGTH)
        return `Name must be ${MAX_NAME_LENGTH} characters or less`;
      return true;
    },
  });
  route.name = name;
}

async function editDescription(
  client: Client,
  route: RoutingRule
): Promise<void> {
  const desc = await client.input.text({
    message: `Description${route.description ? ` (current: ${route.description})` : ''}:`,
    validate: val =>
      val && val.length > MAX_DESCRIPTION_LENGTH
        ? `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
        : true,
  });
  route.description = desc || undefined;
}

async function editSource(client: Client, route: RoutingRule): Promise<void> {
  const syntaxChoice = await client.input.select({
    message: `Path syntax (current: ${route.srcSyntax ?? 'regex'}):`,
    choices: [
      {
        name: 'Path pattern (e.g., /api/:version/users/:id)',
        value: 'path-to-regexp',
      },
      { name: 'Exact match (e.g., /about)', value: 'equals' },
      { name: 'Regular expression (e.g., ^/api/(.*)$)', value: 'regex' },
    ],
  });
  route.srcSyntax = syntaxChoice as SrcSyntax;

  const src = await client.input.text({
    message: `Path pattern (current: ${route.route.src}):`,
    validate: val => {
      if (!val) return 'Path pattern is required';
      return true;
    },
  });
  route.route.src = src;
}

async function editPrimaryAction(
  client: Client,
  route: RoutingRule
): Promise<void> {
  const currentType = getPrimaryActionType(route);

  const choices: Array<{ name: string; value: string }> = [];

  if (currentType === 'rewrite' || currentType === 'redirect') {
    choices.push({ name: 'Change destination', value: 'change-dest' });
  }
  if (currentType === 'redirect' || currentType === 'set-status') {
    choices.push({ name: 'Change status code', value: 'change-status' });
  }

  // Offer to switch to a different type
  if (currentType !== 'rewrite') {
    choices.push({ name: 'Switch to Rewrite', value: 'switch-rewrite' });
  }
  if (currentType !== 'redirect') {
    choices.push({ name: 'Switch to Redirect', value: 'switch-redirect' });
  }
  if (currentType !== 'set-status') {
    choices.push({
      name: 'Switch to Set Status Code',
      value: 'switch-set-status',
    });
  }
  if (currentType) {
    choices.push({
      name: 'Remove primary action',
      value: 'remove',
    });
  } else {
    choices.push({ name: 'Add Rewrite', value: 'switch-rewrite' });
    choices.push({ name: 'Add Redirect', value: 'switch-redirect' });
    choices.push({ name: 'Add Set Status Code', value: 'switch-set-status' });
  }

  choices.push({ name: 'Back', value: 'back' });

  const action = await client.input.select({
    message: `Primary action (current: ${getPrimaryActionLabel(route)}):`,
    choices,
  });

  const flags: Record<string, unknown> = {};

  switch (action) {
    case 'change-dest': {
      const dest = await client.input.text({
        message: `Destination (current: ${route.route.dest}):`,
        validate: val => (val ? true : 'Destination is required'),
      });
      route.route.dest = dest;
      break;
    }
    case 'change-status': {
      if (currentType === 'redirect') {
        const status = await client.input.select({
          message: `Status code (current: ${route.route.status}):`,
          choices: [
            { name: '307 - Temporary Redirect', value: 307 },
            { name: '308 - Permanent Redirect', value: 308 },
            { name: '301 - Moved Permanently', value: 301 },
            { name: '302 - Found', value: 302 },
            { name: '303 - See Other', value: 303 },
          ],
        });
        route.route.status = status as number;
      } else {
        const statusCode = await client.input.text({
          message: `Status code (current: ${route.route.status}):`,
          validate: val => {
            const num = parseInt(val, 10);
            if (isNaN(num) || num < 100 || num > 599) {
              return 'Status code must be between 100 and 599';
            }
            return true;
          },
        });
        route.route.status = parseInt(statusCode, 10);
      }
      break;
    }
    case 'switch-rewrite': {
      await collectActionDetails(client, 'rewrite', flags);
      route.route.dest = flags['--dest'] as string;
      delete (route.route as any).status;
      break;
    }
    case 'switch-redirect': {
      await collectActionDetails(client, 'redirect', flags);
      route.route.dest = flags['--dest'] as string;
      route.route.status = flags['--status'] as number;
      break;
    }
    case 'switch-set-status': {
      await collectActionDetails(client, 'set-status', flags);
      delete (route.route as any).dest;
      route.route.status = flags['--status'] as number;
      break;
    }
    case 'remove': {
      delete (route.route as any).dest;
      delete (route.route as any).status;
      break;
    }
    // 'back' — do nothing
  }
}

async function editConditions(
  client: Client,
  route: RoutingRule
): Promise<void> {
  while (true) {
    const hasConds = ((route.route as any).has ?? []) as Array<{
      type: string;
      key?: string;
      value?: unknown;
    }>;
    const missingConds = ((route.route as any).missing ?? []) as Array<{
      type: string;
      key?: string;
      value?: unknown;
    }>;

    if (hasConds.length > 0 || missingConds.length > 0) {
      output.print('\n');
      if (hasConds.length > 0) {
        output.print(`  ${chalk.cyan('Has conditions:')}\n`);
        hasConds.forEach((c, i) => {
          output.print(
            `    ${chalk.gray(`${i + 1}.`)} ${formatConditionDisplay(c)}\n`
          );
        });
      }
      if (missingConds.length > 0) {
        output.print(`  ${chalk.cyan('Missing conditions:')}\n`);
        missingConds.forEach((c, i) => {
          output.print(
            `    ${chalk.gray(`${hasConds.length + i + 1}.`)} ${formatConditionDisplay(c)}\n`
          );
        });
      }
      output.print('\n');
    } else {
      output.print('\n  No conditions set.\n\n');
    }

    const choices = [];
    if (hasConds.length > 0 || missingConds.length > 0) {
      choices.push({ name: 'Remove a condition', value: 'remove' });
    }
    choices.push({ name: 'Add a new condition', value: 'add' });
    choices.push({ name: 'Back', value: 'back' });

    const action = await client.input.select({
      message: 'Conditions:',
      choices,
    });

    if (action === 'back') break;

    if (action === 'remove') {
      const allConds = [
        ...hasConds.map((c, i) => ({
          label: `[has] ${formatConditionDisplay(c)}`,
          idx: i,
          kind: 'has' as const,
        })),
        ...missingConds.map((c, i) => ({
          label: `[missing] ${formatConditionDisplay(c)}`,
          idx: i,
          kind: 'missing' as const,
        })),
      ];

      const toRemove = await client.input.select({
        message: 'Select condition to remove:',
        choices: [
          ...allConds.map((c, i) => ({
            name: c.label,
            value: i,
          })),
          { name: 'Cancel', value: -1 },
        ],
      });

      if (toRemove !== -1) {
        const selected = allConds[toRemove as number];
        if (selected.kind === 'has') {
          hasConds.splice(selected.idx, 1);
          (route.route as any).has = hasConds;
        } else {
          missingConds.splice(selected.idx, 1);
          (route.route as any).missing = missingConds;
        }
      }
    }

    if (action === 'add') {
      // Pre-populate temp flags with existing conditions so the collector
      // displays all conditions (existing + new) during the add flow
      const { formatCondition: formatCond } = await import(
        '../../util/routes/parse-conditions'
      );
      const existingHasStrings = hasConds.map((c: any) =>
        formatCond(c as HasField)
      );
      const existingMissingStrings = missingConds.map((c: any) =>
        formatCond(c as HasField)
      );
      const tempFlags: Record<string, unknown> = {
        '--has': existingHasStrings.length > 0 ? existingHasStrings : undefined,
        '--missing':
          existingMissingStrings.length > 0
            ? existingMissingStrings
            : undefined,
      };

      const hasBefore = existingHasStrings.length;
      const missingBefore = existingMissingStrings.length;

      await collectInteractiveConditions(client, tempFlags);

      // Only append the NEW conditions (after the existing ones)
      const allHas = (tempFlags['--has'] as string[]) || [];
      const allMissing = (tempFlags['--missing'] as string[]) || [];
      const newHas = allHas.slice(hasBefore);
      const newMissing = allMissing.slice(missingBefore);

      if (newHas.length > 0) {
        const parsed = parseConditions(newHas);
        const existing = ((route.route as any).has ?? []) as HasField[];
        (route.route as any).has = [...existing, ...parsed];
      }
      if (newMissing.length > 0) {
        const parsed = parseConditions(newMissing);
        const existing = ((route.route as any).missing ?? []) as HasField[];
        (route.route as any).missing = [...existing, ...parsed];
      }
    }
  }
}

/**
 * Represents a response header operation from either the headers object (set)
 * or the transforms array (append/delete).
 */
interface ResponseHeaderItem {
  op: 'set' | 'append' | 'delete';
  key: string;
  value?: string;
  /** 'headers' = from route.headers object, 'transform' = from route.transforms array */
  source: 'headers' | 'transform';
}

/**
 * Collects all response header operations from both the headers object
 * and the transforms array into a unified list.
 */
function getAllResponseHeaders(route: RoutingRule): ResponseHeaderItem[] {
  const items: ResponseHeaderItem[] = [];

  // Set operations from headers object
  for (const [key, value] of Object.entries(route.route.headers ?? {})) {
    items.push({ op: 'set', key, value, source: 'headers' });
  }

  // Append/delete operations from transforms
  const transforms = ((route.route as any).transforms ?? []) as Transform[];
  for (const t of transforms) {
    if (t.type === 'response.headers') {
      items.push({
        op: t.op as 'append' | 'delete',
        key:
          typeof t.target.key === 'string'
            ? t.target.key
            : JSON.stringify(t.target.key),
        value: typeof t.args === 'string' ? t.args : undefined,
        source: 'transform',
      });
    }
  }

  return items;
}

function formatResponseHeaderItem(item: ResponseHeaderItem): string {
  if (item.op === 'delete') {
    return `${chalk.yellow(item.op)} ${chalk.cyan(item.key)}`;
  }
  return `${chalk.yellow(item.op)} ${chalk.cyan(item.key)} = ${item.value}`;
}

async function editResponseHeaders(
  client: Client,
  route: RoutingRule
): Promise<void> {
  while (true) {
    const allHeaders = getAllResponseHeaders(route);

    if (allHeaders.length > 0) {
      output.print('\n');
      output.print(`  ${chalk.cyan('Response Headers:')}\n`);
      allHeaders.forEach((h, i) => {
        output.print(
          `    ${chalk.gray(`${i + 1}.`)} ${formatResponseHeaderItem(h)}\n`
        );
      });
      output.print('\n');
    } else {
      output.print('\n  No response headers set.\n\n');
    }

    const choices = [];
    if (allHeaders.length > 0) {
      choices.push({ name: 'Remove a header', value: 'remove' });
    }
    choices.push({ name: 'Add/modify a header', value: 'add' });
    choices.push({ name: 'Back', value: 'back' });

    const action = await client.input.select({
      message: 'Response Headers:',
      choices,
    });

    if (action === 'back') break;

    if (action === 'remove') {
      const toRemove = await client.input.select({
        message: 'Select header to remove:',
        choices: [
          ...allHeaders.map((h, i) => ({
            name:
              h.op === 'delete'
                ? `${h.op} ${h.key}`
                : `${h.op} ${h.key} = ${h.value}`,
            value: i,
          })),
          { name: 'Cancel', value: -1 },
        ],
      });

      if (toRemove !== -1) {
        const item = allHeaders[toRemove as number];
        if (item.source === 'headers') {
          // Remove from headers object
          const currentHeaders = { ...(route.route.headers ?? {}) };
          delete currentHeaders[item.key];
          route.route.headers = currentHeaders;
        } else {
          // Remove from transforms array — find the matching response.headers transform
          const transforms = ((route.route as any).transforms ??
            []) as Transform[];
          const idx = transforms.findIndex(
            t =>
              t.type === 'response.headers' &&
              t.op === item.op &&
              (typeof t.target.key === 'string'
                ? t.target.key
                : JSON.stringify(t.target.key)) === item.key
          );
          if (idx !== -1) {
            transforms.splice(idx, 1);
            (route.route as any).transforms = transforms;
          }
        }
      }
    }

    if (action === 'add') {
      const tempFlags: Record<string, unknown> = {};
      await collectInteractiveHeaders(client, 'response', tempFlags);

      // Merge set headers into headers object
      const setHeaders = (tempFlags['--set-response-header'] as string[]) || [];
      for (const h of setHeaders) {
        const eqIdx = h.indexOf('=');
        if (eqIdx !== -1) {
          const key = h.slice(0, eqIdx).trim();
          const value = h.slice(eqIdx + 1);
          route.route.headers = {
            ...(route.route.headers ?? {}),
            [key]: value,
          };
        }
      }

      // Append/delete as transforms
      const appendHeaders =
        (tempFlags['--append-response-header'] as string[]) || [];
      const deleteHeaders =
        (tempFlags['--delete-response-header'] as string[]) || [];

      const existing = ((route.route as any).transforms ?? []) as Transform[];
      const newTransforms: Transform[] = [];

      for (const h of appendHeaders) {
        const eqIdx = h.indexOf('=');
        if (eqIdx !== -1) {
          newTransforms.push({
            type: 'response.headers',
            op: 'append',
            target: { key: h.slice(0, eqIdx).trim() },
            args: h.slice(eqIdx + 1),
          });
        }
      }
      for (const key of deleteHeaders) {
        newTransforms.push({
          type: 'response.headers',
          op: 'delete',
          target: { key: key.trim() },
        });
      }

      if (newTransforms.length > 0) {
        (route.route as any).transforms = [...existing, ...newTransforms];
      }
    }
  }
}

async function editTransformsByType(
  client: Client,
  route: RoutingRule,
  transformType: 'request.headers' | 'request.query',
  headerType: 'request-header' | 'request-query'
): Promise<void> {
  const label =
    transformType === 'request.headers' ? 'Request Headers' : 'Request Query';

  while (true) {
    const allTransforms = ((route.route as any).transforms ??
      []) as Transform[];
    const matching = allTransforms.filter(t => t.type === transformType);

    if (matching.length > 0) {
      output.print('\n');
      output.print(`  ${chalk.cyan(`${label}:`)}\n`);
      matching.forEach((t, i) => {
        output.print(
          `    ${chalk.gray(`${i + 1}.`)} ${formatTransformDisplay(t)}\n`
        );
      });
      output.print('\n');
    } else {
      output.print(`\n  No ${label.toLowerCase()} set.\n\n`);
    }

    const choices = [];
    if (matching.length > 0) {
      choices.push({ name: 'Remove a transform', value: 'remove' });
    }
    choices.push({ name: 'Add a transform', value: 'add' });
    choices.push({ name: 'Back', value: 'back' });

    const action = await client.input.select({
      message: `${label}:`,
      choices,
    });

    if (action === 'back') break;

    if (action === 'remove') {
      const toRemove = await client.input.select({
        message: 'Select transform to remove:',
        choices: [
          ...matching.map((t, i) => ({
            name: formatTransformDisplay(t),
            value: i,
          })),
          { name: 'Cancel', value: -1 },
        ],
      });

      if (toRemove !== -1) {
        // Find the actual index in the full transforms array
        let matchIdx = 0;
        const removeIdx = allTransforms.findIndex(t => {
          if (t.type === transformType) {
            if (matchIdx === (toRemove as number)) return true;
            matchIdx++;
          }
          return false;
        });

        if (removeIdx !== -1) {
          allTransforms.splice(removeIdx, 1);
          (route.route as any).transforms = allTransforms;
        }
      }
    }

    if (action === 'add') {
      const tempFlags: Record<string, unknown> = {};
      await collectInteractiveHeaders(client, headerType, tempFlags);

      // Collect new transforms from temp flags
      const tfFlags = extractTransformFlags(tempFlags);
      const { transforms } = collectHeadersAndTransforms(tfFlags);

      if (transforms.length > 0) {
        (route.route as any).transforms = [...allTransforms, ...transforms];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main edit command
// ---------------------------------------------------------------------------

export default async function edit(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, editSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const identifier = args[0];

  // Track telemetry
  const { RoutesEditTelemetryClient } = await import(
    '../../util/telemetry/commands/routes'
  );
  const telemetry = new RoutesEditTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  telemetry.trackCliArgumentNameOrId(identifier);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliOptionName(flags['--name'] as string | undefined);
  telemetry.trackCliOptionDescription(
    flags['--description'] as string | undefined
  );
  telemetry.trackCliOptionSrc(flags['--src'] as string | undefined);
  telemetry.trackCliOptionSrcSyntax(
    flags['--src-syntax'] as string | undefined
  );
  telemetry.trackCliOptionAction(flags['--action'] as string | undefined);
  telemetry.trackCliOptionDest(flags['--dest'] as string | undefined);
  telemetry.trackCliOptionStatus(flags['--status'] as number | undefined);
  telemetry.trackCliFlagNoDest(flags['--no-dest'] as boolean | undefined);
  telemetry.trackCliFlagNoStatus(flags['--no-status'] as boolean | undefined);
  telemetry.trackCliFlagClearConditions(
    flags['--clear-conditions'] as boolean | undefined
  );
  telemetry.trackCliFlagClearHeaders(
    flags['--clear-headers'] as boolean | undefined
  );
  telemetry.trackCliFlagClearTransforms(
    flags['--clear-transforms'] as boolean | undefined
  );
  telemetry.trackCliOptionSetResponseHeader(
    flags['--set-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendResponseHeader(
    flags['--append-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteResponseHeader(
    flags['--delete-response-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestHeader(
    flags['--set-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestHeader(
    flags['--append-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestHeader(
    flags['--delete-request-header'] as [string] | undefined
  );
  telemetry.trackCliOptionSetRequestQuery(
    flags['--set-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionAppendRequestQuery(
    flags['--append-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionDeleteRequestQuery(
    flags['--delete-request-query'] as [string] | undefined
  );
  telemetry.trackCliOptionHas(flags['--has'] as [string] | undefined);
  telemetry.trackCliOptionMissing(flags['--missing'] as [string] | undefined);

  if (!identifier) {
    output.error(
      `Route name or ID is required. Usage: ${getCommandName('routes edit <name-or-id>')}`
    );
    return 1;
  }

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // Fetch all routes
  output.spinner('Fetching routes');
  const { routes } = await getRoutes(client, project.id, { teamId });
  output.stopSpinner();

  if (routes.length === 0) {
    output.error('No routes found in this project.');
    return 1;
  }

  // Resolve the route
  const originalRoute = await resolveRoute(client, routes, identifier);
  if (!originalRoute) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  // Clone the route for mutation
  const route = cloneRoute(originalRoute);

  // Determine mode: flag-based or interactive
  const hasEditFlags =
    flags['--name'] !== undefined ||
    flags['--description'] !== undefined ||
    flags['--src'] !== undefined ||
    flags['--src-syntax'] !== undefined ||
    flags['--action'] !== undefined ||
    flags['--dest'] !== undefined ||
    flags['--status'] !== undefined ||
    flags['--no-dest'] !== undefined ||
    flags['--no-status'] !== undefined ||
    flags['--has'] !== undefined ||
    flags['--missing'] !== undefined ||
    flags['--clear-conditions'] !== undefined ||
    flags['--clear-headers'] !== undefined ||
    flags['--clear-transforms'] !== undefined ||
    hasAnyTransformFlags(flags);

  if (hasEditFlags) {
    // --- Flag-based mode ---
    const error = applyFlagMutations(route, flags);
    if (error) {
      output.error(error);
      return 1;
    }
  } else {
    // --- Interactive mode ---
    if (!client.stdin.isTTY) {
      output.error(
        `No edit flags provided. When running non-interactively, use flags like --name, --dest, --src, etc. Run ${getCommandName('routes edit --help')} for all options.`
      );
      return 1;
    }

    output.log(`\nEditing route "${originalRoute.name}"`);
    printRouteConfig(route);

    while (true) {
      const hasConds = ((route.route as any).has ?? []).length;
      const missingConds = ((route.route as any).missing ?? []).length;
      const responseHeaders = getAllResponseHeaders(route).length;
      const requestHeaders = getTransformsByType(
        route,
        'request.headers'
      ).length;
      const requestQuery = getTransformsByType(route, 'request.query').length;

      const syntaxLabel =
        route.srcSyntax === 'path-to-regexp'
          ? 'Pattern'
          : route.srcSyntax === 'equals'
            ? 'Exact'
            : 'Regex';
      const descriptionPreview = route.description
        ? route.description.length > 40
          ? route.description.slice(0, 40) + '...'
          : route.description
        : '';

      const editChoices = [
        { name: `Name (${route.name})`, value: 'name' },
        {
          name: descriptionPreview
            ? `Description (${descriptionPreview})`
            : 'Description',
          value: 'description',
        },
        {
          name: `Source (${syntaxLabel}: ${route.route.src})`,
          value: 'source',
        },
        {
          name: `Primary action (${getPrimaryActionLabel(route)})`,
          value: 'action',
        },
        {
          name: `Conditions (${hasConds} has, ${missingConds} missing)`,
          value: 'conditions',
        },
        {
          name: `Response Headers (${responseHeaders})`,
          value: 'response-headers',
        },
        {
          name: `Request Headers (${requestHeaders})`,
          value: 'request-headers',
        },
        {
          name: `Request Query (${requestQuery})`,
          value: 'request-query',
        },
        { name: 'Done - save changes', value: 'done' },
      ];

      const choice = await client.input.select({
        message: 'What would you like to edit?',
        choices: editChoices,
        pageSize: editChoices.length,
        loop: false,
      });

      switch (choice) {
        case 'name':
          await editName(client, route);
          break;
        case 'description':
          await editDescription(client, route);
          break;
        case 'source':
          await editSource(client, route);
          break;
        case 'action':
          await editPrimaryAction(client, route);
          break;
        case 'conditions':
          await editConditions(client, route);
          break;
        case 'response-headers':
          await editResponseHeaders(client, route);
          break;
        case 'request-headers':
          await editTransformsByType(
            client,
            route,
            'request.headers',
            'request-header'
          );
          break;
        case 'request-query':
          await editTransformsByType(
            client,
            route,
            'request.query',
            'request-query'
          );
          break;
        case 'done':
          break;
      }

      if (choice === 'done') {
        // Validate route has some action before saving
        const hasDest = !!route.route.dest;
        const hasStatus = !!route.route.status;
        const hasHeaders = Object.keys(route.route.headers ?? {}).length > 0;
        const hasTransforms =
          ((route.route as any).transforms ?? []).length > 0;

        if (!hasDest && !hasStatus && !hasHeaders && !hasTransforms) {
          output.warn(
            'Route has no action (no destination, status, or headers). Add an action before saving.'
          );
          continue;
        }
        break;
      }
    }
  }

  // Check if anything actually changed
  if (JSON.stringify(route) === JSON.stringify(originalRoute)) {
    output.log('No changes made.');
    return 0;
  }

  // Send the update
  const editStamp = stamp();
  output.spinner(`Updating route "${route.name}"`);

  try {
    const { version } = await editRoute(
      client,
      project.id,
      originalRoute.id,
      {
        route: {
          name: route.name,
          description: route.description,
          enabled: route.enabled,
          srcSyntax: route.srcSyntax,
          route: route.route,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Updated')} route "${route.name}" ${chalk.gray(editStamp())}`
    );

    // Auto-promote offer
    await offerAutoPromote(
      client,
      project.id,
      version,
      !!existingStagingVersion,
      { teamId, skipPrompts: skipConfirmation }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string; code?: string };
    if (error.code === 'feature_not_enabled') {
      output.error(
        'Project-level routes are not enabled for this project. Please contact support.'
      );
    } else {
      output.error(error.message || 'Failed to update route');
    }
    return 1;
  }
}
