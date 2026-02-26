/**
 * Transforms between the /generate endpoint's response format
 * and the CLI's AddRouteInput format.
 *
 * The /generate endpoint returns routes in a "generated" format with
 * pathCondition, conditions, and a flat actions array. The CLI uses
 * AddRouteInput with src, has/missing, dest/status, headers, transforms.
 */
import chalk from 'chalk';
import output from '../../output-manager';
import { buildConditionValue } from './parse-conditions';
import { REDIRECT_STATUS_CODES } from './interactive';
import type { AddRouteInput, HasField, Transform, RoutingRule } from './types';
import type { GeneratedRoute, CurrentRouteInput } from './generate-route';

/**
 * Converts an AI-generated route to the CLI's AddRouteInput format.
 */
export function generatedRouteToAddInput(
  generated: GeneratedRoute
): AddRouteInput {
  const hasConditions: HasField[] = [];
  const missingConditions: HasField[] = [];
  const headers: Record<string, string> = {};
  const transforms: Transform[] = [];
  let dest: string | undefined;
  let status: number | undefined;

  if (generated.conditions) {
    for (const c of generated.conditions) {
      const compiledValue =
        c.value !== undefined
          ? buildConditionValue(c.operator, c.value)
          : undefined;

      const field: HasField =
        c.field === 'host'
          ? { type: 'host', value: compiledValue ?? c.value ?? '' }
          : {
              type: c.field,
              key: c.key ?? '',
              ...(compiledValue !== undefined && { value: compiledValue }),
            };

      if (c.missing) {
        missingConditions.push(field);
      } else {
        hasConditions.push(field);
      }
    }
  }

  for (const action of generated.actions) {
    switch (action.type) {
      case 'rewrite':
        dest = action.dest;
        break;
      case 'redirect':
        dest = action.dest;
        status = action.status;
        break;
      case 'set-status':
        status = action.status;
        break;
      case 'modify': {
        if (!action.headers) break;

        if (action.subType === 'response-headers') {
          for (const h of action.headers) {
            if (h.op === 'set') {
              headers[h.key] = h.value ?? '';
            } else {
              transforms.push({
                type: 'response.headers',
                op: h.op,
                target: { key: h.key },
                ...(h.op !== 'delete' && h.value && { args: h.value }),
              });
            }
          }
        } else if (action.subType === 'transform-request-header') {
          for (const h of action.headers) {
            transforms.push({
              type: 'request.headers',
              op: h.op,
              target: { key: h.key },
              ...(h.op !== 'delete' && h.value && { args: h.value }),
            });
          }
        } else if (action.subType === 'transform-request-query') {
          for (const h of action.headers) {
            transforms.push({
              type: 'request.query',
              op: h.op,
              target: { key: h.key },
              ...(h.op !== 'delete' && h.value && { args: h.value }),
            });
          }
        }
        break;
      }
    }
  }

  return {
    name: generated.name,
    description: generated.description || undefined,
    srcSyntax: generated.pathCondition.syntax,
    route: {
      src: generated.pathCondition.value,
      ...(dest !== undefined && { dest }),
      ...(status !== undefined && { status }),
      ...(Object.keys(headers).length > 0 && { headers }),
      ...(transforms.length > 0 && { transforms }),
      ...(hasConditions.length > 0 && { has: hasConditions }),
      ...(missingConditions.length > 0 && { missing: missingConditions }),
    },
  };
}

/**
 * Converts a GeneratedRoute to the CurrentRouteInput format
 * used by the /generate endpoint's edit mode.
 * Used when the user picks "Edit with AI" after initial generation.
 */
export function convertRouteToCurrentRoute(
  generated: GeneratedRoute
): CurrentRouteInput {
  return {
    name: generated.name,
    description: generated.description || undefined,
    pathCondition: generated.pathCondition,
    conditions: generated.conditions,
    actions: generated.actions,
  };
}

/**
 * Converts an existing RoutingRule (from GET /routes) to the
 * CurrentRouteInput format for the /generate endpoint's edit mode.
 */
export function routingRuleToCurrentRoute(
  rule: RoutingRule
): CurrentRouteInput {
  const conditions: CurrentRouteInput['conditions'] = [];
  const actions: CurrentRouteInput['actions'] = [];

  // Convert has conditions
  if (rule.route.has) {
    for (const c of rule.route.has as Array<{
      type: string;
      key?: string;
      value?: unknown;
    }>) {
      conditions.push({
        field: c.type,
        operator: c.value !== undefined ? 're' : 'exists',
        key: c.key,
        value:
          c.value !== undefined
            ? typeof c.value === 'string'
              ? c.value
              : JSON.stringify(c.value)
            : undefined,
        missing: false,
      });
    }
  }

  // Convert missing conditions
  if (rule.route.missing) {
    for (const c of rule.route.missing as Array<{
      type: string;
      key?: string;
      value?: unknown;
    }>) {
      conditions.push({
        field: c.type,
        operator: c.value !== undefined ? 're' : 'exists',
        key: c.key,
        value:
          c.value !== undefined
            ? typeof c.value === 'string'
              ? c.value
              : JSON.stringify(c.value)
            : undefined,
        missing: true,
      });
    }
  }

  // Convert primary action
  const isRedirect =
    rule.route.dest &&
    rule.route.status &&
    REDIRECT_STATUS_CODES.includes(rule.route.status);

  if (isRedirect) {
    actions.push({
      type: 'redirect',
      dest: rule.route.dest,
      status: rule.route.status,
    });
  } else if (rule.route.dest) {
    actions.push({ type: 'rewrite', dest: rule.route.dest });
  } else if (rule.route.status) {
    actions.push({ type: 'set-status', status: rule.route.status });
  }

  // Convert response headers (set operations from headers object)
  const responseHeaders = rule.route.headers
    ? Object.entries(rule.route.headers).map(([key, value]) => ({
        key,
        value,
        op: 'set',
      }))
    : [];

  // Convert transforms
  const allTransforms = (rule.route.transforms ?? []) as Array<{
    type: string;
    op: string;
    target: { key: string };
    args?: string;
  }>;

  const responseHeaderTransforms = allTransforms
    .filter(t => t.type === 'response.headers')
    .map(t => ({
      key:
        typeof t.target.key === 'string' ? t.target.key : String(t.target.key),
      value: t.args,
      op: t.op,
    }));

  const allResponseHeaders = [...responseHeaders, ...responseHeaderTransforms];
  if (allResponseHeaders.length > 0) {
    actions.push({
      type: 'modify',
      subType: 'response-headers',
      headers: allResponseHeaders,
    });
  }

  const requestHeaders = allTransforms
    .filter(t => t.type === 'request.headers')
    .map(t => ({
      key:
        typeof t.target.key === 'string' ? t.target.key : String(t.target.key),
      value: t.args,
      op: t.op,
    }));

  if (requestHeaders.length > 0) {
    actions.push({
      type: 'modify',
      subType: 'transform-request-header',
      headers: requestHeaders,
    });
  }

  const requestQuery = allTransforms
    .filter(t => t.type === 'request.query')
    .map(t => ({
      key:
        typeof t.target.key === 'string' ? t.target.key : String(t.target.key),
      value: t.args,
      op: t.op,
    }));

  if (requestQuery.length > 0) {
    actions.push({
      type: 'modify',
      subType: 'transform-request-query',
      headers: requestQuery,
    });
  }

  return {
    name: rule.name,
    description: rule.description,
    pathCondition: {
      value: rule.route.src,
      syntax: rule.srcSyntax ?? 'regex',
    },
    ...(conditions.length > 0 && { conditions }),
    actions,
  };
}

/**
 * Prints a formatted preview of an AI-generated route.
 */
export function printGeneratedRoutePreview(generated: GeneratedRoute): void {
  output.print('\n');
  output.print(`  ${chalk.bold('Generated Route:')}\n`);
  output.print(`  ${chalk.cyan('Name:')}         ${generated.name}\n`);
  if (generated.description) {
    output.print(`  ${chalk.cyan('Description:')}  ${generated.description}\n`);
  }
  output.print(
    `  ${chalk.cyan('Source:')}       ${generated.pathCondition.value}\n`
  );

  if (generated.conditions && generated.conditions.length > 0) {
    output.print(`  ${chalk.cyan('Conditions:')}\n`);
    for (const c of generated.conditions) {
      const prefix = c.missing ? 'does not have' : 'has';
      const operatorLabel =
        c.operator === 'eq'
          ? 'equal to'
          : c.operator === 'contains'
            ? 'containing'
            : c.operator === 're'
              ? 'matching'
              : '';
      const key = c.key ? ` ${chalk.cyan(`"${c.key}"`)}` : '';
      const value =
        c.operator === 'exists' || !c.value
          ? ''
          : ` ${operatorLabel} ${chalk.cyan(`"${c.value}"`)}`;
      output.print(`    ${chalk.gray(prefix)} ${c.field}${key}${value}\n`);
    }
  }

  for (const action of generated.actions) {
    if (action.type === 'rewrite' && action.dest) {
      output.print(
        `  ${chalk.cyan('Action:')}       Rewrite → ${action.dest}\n`
      );
    } else if (action.type === 'redirect' && action.dest) {
      output.print(
        `  ${chalk.cyan('Action:')}       Redirect → ${action.dest} (${action.status})\n`
      );
    } else if (action.type === 'set-status' && action.status) {
      output.print(
        `  ${chalk.cyan('Action:')}       Set Status ${action.status}\n`
      );
    }
  }

  for (const action of generated.actions) {
    if (action.type === 'modify' && action.headers) {
      const label =
        action.subType === 'response-headers'
          ? 'Response Headers'
          : action.subType === 'transform-request-header'
            ? 'Request Headers'
            : 'Request Query';
      output.print(`  ${chalk.cyan(`${label}:`)}\n`);
      for (const h of action.headers) {
        if (h.op === 'delete') {
          output.print(`    ${chalk.yellow(h.op)} ${chalk.cyan(h.key)}\n`);
        } else {
          output.print(
            `    ${chalk.yellow(h.op)} ${chalk.cyan(h.key)} = ${h.value}\n`
          );
        }
      }
    }
  }

  output.print('\n');
}
