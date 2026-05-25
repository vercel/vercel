/**
 * Interactive edit loop and helpers for route editing.
 * Extracted from edit.ts so that both `routes edit` and `routes add`
 * (for the "Edit manually" after AI generation flow) can use it
 * without cross-command imports.
 */
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import {
  formatCondition as formatConditionDisplay,
  formatTransform as formatTransformDisplay,
} from './shared';
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
  collectActionDetails,
  collectInteractiveConditions,
  collectInteractiveHeaders,
} from '../../util/routes/interactive';
import {
  parseConditions,
  formatCondition,
} from '../../util/routes/parse-conditions';
import type {
  EditableRoute,
  HasField,
  Transform,
  SrcSyntax,
} from '../../util/routes/types';

// ---------------------------------------------------------------------------
// Helpers for displaying current route state
// ---------------------------------------------------------------------------

function getPrimaryActionType(
  route: EditableRoute
): 'rewrite' | 'redirect' | 'set-status' | null {
  const { dest, status } = route.route;
  if (dest && status && REDIRECT_STATUS_CODES.includes(status)) {
    return 'redirect';
  }
  if (dest) return 'rewrite';
  if (status) return 'set-status';
  return null;
}

function getPrimaryActionLabel(route: EditableRoute): string {
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

function getResponseHeaders(
  route: EditableRoute
): { key: string; value: string }[] {
  const headers = route.route.headers ?? {};
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function getTransformsByType(route: EditableRoute, type: string): Transform[] {
  const transforms = (route.route.transforms ?? []) as Transform[];
  return transforms.filter(t => t.type === type);
}

/**
 * Prints the current route configuration in detail.
 */
export function printRouteConfig(route: EditableRoute): void {
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

  const actionLabel = getPrimaryActionLabel(route);
  output.print(`  ${chalk.cyan('Action:')}       ${actionLabel}\n`);

  const hasConds = route.route.has ?? [];
  if (hasConds.length > 0) {
    output.print(`\n  ${chalk.cyan('Has conditions:')}\n`);
    for (const c of hasConds) {
      output.print(`    ${formatConditionDisplay(c)}\n`);
    }
  }

  const missingConds = route.route.missing ?? [];
  if (missingConds.length > 0) {
    output.print(`\n  ${chalk.cyan('Does not have conditions:')}\n`);
    for (const c of missingConds) {
      output.print(`    ${formatConditionDisplay(c)}\n`);
    }
  }

  const responseHeaders = getResponseHeaders(route);
  if (responseHeaders.length > 0) {
    output.print(`\n  ${chalk.cyan('Response Headers:')}\n`);
    for (const h of responseHeaders) {
      output.print(`    ${chalk.cyan(h.key)} = ${h.value}\n`);
    }
  }

  const requestHeaders = getTransformsByType(route, 'request.headers');
  if (requestHeaders.length > 0) {
    output.print(`\n  ${chalk.cyan('Request Headers:')}\n`);
    for (const t of requestHeaders) {
      output.print(`    ${formatTransformDisplay(t)}\n`);
    }
  }

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

export function cloneRoute(route: EditableRoute): EditableRoute {
  return JSON.parse(JSON.stringify(route));
}

// ---------------------------------------------------------------------------
// Flag-based mutations
// ---------------------------------------------------------------------------

/**
 * Applies flag-based mutations to a cloned route.
 * Returns an error message if invalid, or null on success.
 */
export function applyFlagMutations(
  route: EditableRoute,
  flags: Record<string, unknown>
): string | null {
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

  const actionFlag = flags['--action'] as string | undefined;
  const destFlag = flags['--dest'] as string | undefined;
  const statusFlag = flags['--status'] as number | undefined;
  const noDest = flags['--no-dest'] as boolean | undefined;
  const noStatus = flags['--no-status'] as boolean | undefined;

  if (actionFlag) {
    if (!(VALID_ACTION_TYPES as readonly string[]).includes(actionFlag)) {
      return `Invalid action type: "${actionFlag}". Valid types: ${VALID_ACTION_TYPES.join(', ')}`;
    }

    switch (actionFlag) {
      case 'rewrite': {
        const dest = destFlag ? stripQuotes(destFlag) : undefined;
        if (!dest) return '--action rewrite requires --dest.';
        route.route.dest = dest;
        delete route.route.status;
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
        delete route.route.dest;
        route.route.status = statusFlag;
        break;
      }
    }
  } else {
    if (destFlag !== undefined) {
      route.route.dest = stripQuotes(destFlag);
    }
    if (statusFlag !== undefined) {
      route.route.status = statusFlag;
    }
    if (noDest) {
      delete route.route.dest;
    }
    if (noStatus) {
      delete route.route.status;
    }
  }

  if (flags['--clear-conditions']) {
    route.route.has = [];
    route.route.missing = [];
  }

  if (flags['--clear-headers']) {
    route.route.headers = {};
  }

  if (flags['--clear-transforms']) {
    route.route.transforms = [];
  }

  const transformFlags = extractTransformFlags(flags);
  try {
    const { headers, transforms } = collectHeadersAndTransforms(transformFlags);

    if (Object.keys(headers).length > 0) {
      route.route.headers = {
        ...(route.route.headers ?? {}),
        ...headers,
      };
    }

    if (transforms.length > 0) {
      const existing = (route.route.transforms ?? []) as Transform[];
      route.route.transforms = [...existing, ...transforms];
    }
  } catch (e) {
    return `Invalid transform format. ${e instanceof Error ? e.message : ''}`;
  }

  const hasFlags = flags['--has'] as string[] | undefined;
  const missingFlags = flags['--missing'] as string[] | undefined;

  try {
    if (hasFlags) {
      const newHas = parseConditions(hasFlags);
      const existingHas = (route.route.has ?? []) as HasField[];
      route.route.has = [...existingHas, ...newHas];
    }
    if (missingFlags) {
      const newMissing = parseConditions(missingFlags);
      const existingMissing = (route.route.missing ?? []) as HasField[];
      route.route.missing = [...existingMissing, ...newMissing];
    }
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid condition format';
  }

  const totalConditions =
    (route.route.has ?? []).length + (route.route.missing ?? []).length;
  if (totalConditions > MAX_CONDITIONS) {
    return `Too many conditions: ${totalConditions}. Maximum is ${MAX_CONDITIONS}.`;
  }

  const hasDest = !!route.route.dest;
  const hasStatus = !!route.route.status;
  const hasHeaders = Object.keys(route.route.headers ?? {}).length > 0;
  const hasTransforms = (route.route.transforms ?? []).length > 0;

  if (!hasDest && !hasStatus && !hasHeaders && !hasTransforms) {
    return 'This edit would leave the route with no action. Add --action, headers, or transforms.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Interactive edit loop
// ---------------------------------------------------------------------------

/**
 * Runs the interactive field-by-field edit menu on an EditableRoute.
 * Mutates the route in-place. Returns when the user selects "Done"
 * and the route passes validation.
 */
export async function runInteractiveEditLoop(
  client: Client,
  route: EditableRoute
): Promise<void> {
  for (;;) {
    const hasConds = (route.route.has ?? []).length;
    const missingConds = (route.route.missing ?? []).length;
    const responseHeaders = getAllResponseHeaders(route).length;
    const requestHeaders = getTransformsByType(route, 'request.headers').length;
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
      const hasDest = !!route.route.dest;
      const hasStatus = !!route.route.status;
      const hasHeaders = Object.keys(route.route.headers ?? {}).length > 0;
      const hasTransforms = (route.route.transforms ?? []).length > 0;

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

// ---------------------------------------------------------------------------
// Interactive edit sub-menus
// ---------------------------------------------------------------------------

async function editName(client: Client, route: EditableRoute): Promise<void> {
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
  route: EditableRoute
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

async function editSource(client: Client, route: EditableRoute): Promise<void> {
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
  route: EditableRoute
): Promise<void> {
  const currentType = getPrimaryActionType(route);

  const choices: Array<{ name: string; value: string }> = [];

  if (currentType === 'rewrite' || currentType === 'redirect') {
    choices.push({ name: 'Change destination', value: 'change-dest' });
  }
  if (currentType === 'redirect' || currentType === 'set-status') {
    choices.push({ name: 'Change status code', value: 'change-status' });
  }

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
      delete route.route.status;
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
      delete route.route.dest;
      route.route.status = flags['--status'] as number;
      break;
    }
    case 'remove': {
      delete route.route.dest;
      delete route.route.status;
      break;
    }
    // 'back' — do nothing
  }
}

async function editConditions(
  client: Client,
  route: EditableRoute
): Promise<void> {
  for (;;) {
    const hasConds = route.route.has ?? [];
    const missingConds = route.route.missing ?? [];

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
        output.print(`  ${chalk.cyan('Does not have conditions:')}\n`);
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
          label: `[does not have] ${formatConditionDisplay(c)}`,
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
          route.route.has = hasConds;
        } else {
          missingConds.splice(selected.idx, 1);
          route.route.missing = missingConds;
        }
      }
    }

    if (action === 'add') {
      const existingHasStrings = hasConds.map(c =>
        formatCondition(c as HasField)
      );
      const existingMissingStrings = missingConds.map(c =>
        formatCondition(c as HasField)
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

      const allHas = (tempFlags['--has'] as string[]) || [];
      const allMissing = (tempFlags['--missing'] as string[]) || [];
      const newHas = allHas.slice(hasBefore);
      const newMissing = allMissing.slice(missingBefore);

      if (newHas.length > 0) {
        const parsed = parseConditions(newHas);
        const existing = (route.route.has ?? []) as HasField[];
        route.route.has = [...existing, ...parsed];
      }
      if (newMissing.length > 0) {
        const parsed = parseConditions(newMissing);
        const existing = (route.route.missing ?? []) as HasField[];
        route.route.missing = [...existing, ...parsed];
      }
      break;
    }
  }
}

interface ResponseHeaderItem {
  op: 'set' | 'append' | 'delete';
  key: string;
  value?: string;
  source: 'headers' | 'transform';
}

function getAllResponseHeaders(route: EditableRoute): ResponseHeaderItem[] {
  const items: ResponseHeaderItem[] = [];

  for (const [key, value] of Object.entries(route.route.headers ?? {})) {
    items.push({ op: 'set', key, value, source: 'headers' });
  }

  const transforms = (route.route.transforms ?? []) as Transform[];
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
  route: EditableRoute
): Promise<void> {
  for (;;) {
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
      choices.push({ name: 'Remove a response header', value: 'remove' });
    }
    choices.push({ name: 'Add a response header', value: 'add' });
    choices.push({ name: 'Back', value: 'back' });

    const action = await client.input.select({
      message: 'Response Headers:',
      choices,
    });

    if (action === 'back') break;

    if (action === 'remove') {
      const toRemove = await client.input.select({
        message: 'Select response header to remove:',
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
          const currentHeaders = { ...(route.route.headers ?? {}) };
          delete currentHeaders[item.key];
          route.route.headers = currentHeaders;
        } else {
          const transforms = (route.route.transforms ?? []) as Transform[];
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
            route.route.transforms = transforms;
          }
        }
      }
    }

    if (action === 'add') {
      const tempFlags: Record<string, unknown> = {};
      await collectInteractiveHeaders(client, 'response', tempFlags);

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

      const appendHeaders =
        (tempFlags['--append-response-header'] as string[]) || [];
      const deleteHeaders =
        (tempFlags['--delete-response-header'] as string[]) || [];

      const existing = (route.route.transforms ?? []) as Transform[];
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
        route.route.transforms = [...existing, ...newTransforms];
      }
      break;
    }
  }
}

async function editTransformsByType(
  client: Client,
  route: EditableRoute,
  transformType: 'request.headers' | 'request.query',
  headerType: 'request-header' | 'request-query'
): Promise<void> {
  const label =
    transformType === 'request.headers' ? 'Request Headers' : 'Request Query';
  const itemName =
    transformType === 'request.headers' ? 'request header' : 'query parameter';

  for (;;) {
    const allTransforms = (route.route.transforms ?? []) as Transform[];
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
      choices.push({ name: `Remove a ${itemName}`, value: 'remove' });
    }
    choices.push({ name: `Add a ${itemName}`, value: 'add' });
    choices.push({ name: 'Back', value: 'back' });

    const action = await client.input.select({
      message: `${label}:`,
      choices,
    });

    if (action === 'back') break;

    if (action === 'remove') {
      const toRemove = await client.input.select({
        message: `Select ${itemName} to remove:`,
        choices: [
          ...matching.map((t, i) => ({
            name: formatTransformDisplay(t),
            value: i,
          })),
          { name: 'Cancel', value: -1 },
        ],
      });

      if (toRemove !== -1) {
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
          route.route.transforms = allTransforms;
        }
      }
    }

    if (action === 'add') {
      const tempFlags: Record<string, unknown> = {};
      await collectInteractiveHeaders(client, headerType, tempFlags);

      const tfFlags = extractTransformFlags(tempFlags);
      const { transforms } = collectHeadersAndTransforms(tfFlags);

      if (transforms.length > 0) {
        route.route.transforms = [...allTransforms, ...transforms];
      }
      break;
    }
  }
}
