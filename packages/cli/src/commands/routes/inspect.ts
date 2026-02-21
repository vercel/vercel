import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  formatCondition,
  formatTransform,
  TRANSFORM_TYPE_LABELS,
} from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import {
  getRouteTypeLabels,
  getSrcSyntaxLabel,
  type RoutingRule,
} from '../../util/routes/types';

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, inspectSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags, args } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const showDiff = flags['--diff'] as boolean | undefined;

  const identifier = args[0] === 'inspect' ? args[1] : args[0];

  if (!identifier) {
    output.error(
      `Missing route name or ID. Usage: ${chalk.cyan(getCommandName('routes inspect <name-or-id>'))}`
    );
    return 1;
  }

  const inspectStamp = stamp();
  output.spinner(
    `Searching for route "${identifier}" in ${chalk.bold(project.name)}`
  );

  // Fetch current routes (staging if exists, else production)
  const { routes } = await getRoutes(client, project.id, {
    teamId,
    search: identifier,
  });

  // Find exact match by ID or name
  const exactMatch = routes.find(
    r =>
      r.id === identifier || r.name.toLowerCase() === identifier.toLowerCase()
  );

  let route: RoutingRule;

  if (exactMatch) {
    route = exactMatch;
  } else if (routes.length === 0) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  } else if (routes.length === 1) {
    route = routes[0];
  } else {
    // Multiple matches - let user select
    output.log(
      `Found ${routes.length} routes matching "${identifier}" ${chalk.gray(inspectStamp())}`
    );

    const selectedId = await client.input.select({
      message: 'Select a route to inspect:',
      choices: routes.map(r => ({
        value: r.id,
        name: `${r.name} ${chalk.gray(`(${r.route.src})`)}`,
      })),
    });

    if (!selectedId) {
      output.error('No route selected');
      return 1;
    }

    const selected = routes.find(r => r.id === selectedId);
    if (!selected) {
      output.error('Selected route not found');
      return 1;
    }

    route = selected;
  }

  output.log(
    `Route found in ${chalk.bold(project.name)} ${chalk.gray(inspectStamp())}`
  );

  if (showDiff) {
    return await showRouteDiff(client, project.id, teamId, route);
  }

  output.print(formatRouteDetails(route));
  return 0;
}

// ---------------------------------------------------------------------------
// Diff mode
// ---------------------------------------------------------------------------

async function showRouteDiff(
  client: Client,
  projectId: string,
  teamId: string | undefined,
  stagingRoute: RoutingRule
): Promise<number> {
  // Find the production version
  const { versions } = await getRouteVersions(client, projectId, { teamId });
  const productionVersion = versions.find(v => v.isLive);

  if (!productionVersion) {
    output.log('No production version found. Showing current route.');
    output.print(formatRouteDetails(stagingRoute));
    return 0;
  }

  // Fetch production routes to find the same route
  const { routes: productionRoutes } = await getRoutes(client, projectId, {
    teamId,
    versionId: productionVersion.id,
  });

  const productionRoute = productionRoutes.find(r => r.id === stagingRoute.id);

  if (!productionRoute) {
    // Route only exists in staging — it's new
    output.print(
      `\n  ${chalk.bold(stagingRoute.name)} ${chalk.green('(new)')}\n`
    );
    output.print(`  ${chalk.gray(stagingRoute.id)}\n`);
    output.print(
      `  ${chalk.green('This route does not exist in production yet.')}\n`
    );
    output.print(formatRouteDetails(stagingRoute));
    return 0;
  }

  // Compare and display diff
  output.print(formatRouteDiff(stagingRoute, productionRoute));
  return 0;
}

// ---------------------------------------------------------------------------
// Diff formatting
// ---------------------------------------------------------------------------

/**
 * Formats a field diff line. Shows the change marker and old → new values.
 */
function diffField(
  label: string,
  oldVal: string | undefined,
  newVal: string | undefined
): string {
  if (oldVal === newVal) {
    if (!newVal) return '';
    return `  ${chalk.cyan(label)} ${newVal}`;
  }

  if (!oldVal && newVal) {
    return `${chalk.green('+')} ${chalk.cyan(label)} ${newVal}`;
  }
  if (oldVal && !newVal) {
    return `${chalk.red('-')} ${chalk.cyan(label)} ${chalk.strikethrough(oldVal)}`;
  }
  return `${chalk.yellow('~')} ${chalk.cyan(label)} ${chalk.red(oldVal!)} → ${chalk.green(newVal!)}`;
}

/**
 * Compares two routes and produces a diff display with change markers.
 */
function formatRouteDiff(
  staging: RoutingRule,
  production: RoutingRule
): string {
  const lines: string[] = [''];

  // Check if anything changed at all
  const hasChanges =
    JSON.stringify(normalizeForComparison(staging)) !==
    JSON.stringify(normalizeForComparison(production));

  if (!hasChanges) {
    lines.push(`  ${chalk.bold(staging.name)}`);
    lines.push(`  ${chalk.gray(staging.id)}`);
    lines.push('');
    lines.push(`  ${chalk.gray('No staged changes for this route.')}`);
    lines.push('');
    lines.push(chalk.bold('  Route Configuration'));
    // Show the route normally
    return lines.join('\n') + '\n' + formatRouteDetails(staging);
  }

  const typeLabels = getRouteTypeLabels(staging);
  const syntaxLabel = getSrcSyntaxLabel(staging);

  lines.push(`  ${chalk.bold(staging.name)} ${chalk.yellow('(modified)')}`);
  lines.push(`  ${chalk.gray(staging.id)}`);
  lines.push('');

  // Description diff
  if (production.description !== staging.description) {
    if (!production.description && staging.description) {
      lines.push(
        `${chalk.green('+')} ${chalk.cyan('Description:')}  ${staging.description}`
      );
    } else if (production.description && !staging.description) {
      lines.push(
        `${chalk.red('-')} ${chalk.cyan('Description:')}  ${chalk.strikethrough(production.description)}`
      );
    } else {
      lines.push(
        `${chalk.yellow('~')} ${chalk.cyan('Description:')}  ${chalk.red(production.description!)} → ${chalk.green(staging.description!)}`
      );
    }
    lines.push('');
  } else if (staging.description) {
    lines.push(`  ${staging.description}`);
    lines.push('');
  }

  // Status diff
  const prodStatusText = production.enabled === false ? 'Disabled' : 'Enabled';
  const stagingStatusText = staging.enabled === false ? 'Disabled' : 'Enabled';
  lines.push(
    diffField('Status:', prodStatusText, stagingStatusText) ||
      `  ${chalk.cyan('Status:')}      ${stagingStatusText}`
  );

  lines.push(`  ${chalk.cyan('Type:')}        ${typeLabels}`);
  lines.push('');

  lines.push(chalk.bold('  Route Configuration'));

  // Source diff
  const srcLine = diffField('Source:', production.route.src, staging.route.src);
  lines.push(srcLine || `  ${chalk.cyan('Source:')}      ${staging.route.src}`);
  lines.push(`  ${chalk.cyan('Syntax:')}      ${syntaxLabel}`);

  // Destination diff
  const destLine = diffField(
    'Destination:',
    production.route.dest,
    staging.route.dest
  );
  if (destLine) lines.push(destLine);
  else if (staging.route.dest)
    lines.push(`  ${chalk.cyan('Destination:')} ${staging.route.dest}`);

  // Status code diff
  const prodStatus = production.route.status
    ? String(production.route.status)
    : undefined;
  const stagingStatus = staging.route.status
    ? String(staging.route.status)
    : undefined;
  const statusLine = diffField('HTTP Status:', prodStatus, stagingStatus);
  if (statusLine) lines.push(statusLine);
  else if (staging.route.status)
    lines.push(`  ${chalk.cyan('HTTP Status:')} ${staging.route.status}`);

  // Response headers diff
  const prodHeaders = production.route.headers ?? {};
  const stagingHeaders = staging.route.headers ?? {};
  const allHeaderKeys = new Set([
    ...Object.keys(prodHeaders),
    ...Object.keys(stagingHeaders),
  ]);

  if (allHeaderKeys.size > 0) {
    lines.push('');
    lines.push(chalk.bold('  Response Headers'));
    for (const key of allHeaderKeys) {
      const prodVal = prodHeaders[key];
      const stagingVal = stagingHeaders[key];
      if (prodVal === stagingVal) {
        lines.push(`  ${chalk.cyan(key + ':')} ${stagingVal}`);
      } else if (!prodVal) {
        lines.push(
          `${chalk.green('+')} ${chalk.cyan(key + ':')} ${stagingVal}`
        );
      } else if (!stagingVal) {
        lines.push(
          `${chalk.red('-')} ${chalk.cyan(key + ':')} ${chalk.strikethrough(prodVal)}`
        );
      } else {
        lines.push(
          `${chalk.yellow('~')} ${chalk.cyan(key + ':')} ${chalk.red(prodVal)} → ${chalk.green(stagingVal)}`
        );
      }
    }
  }

  // Transforms diff
  const prodTransforms = production.route.transforms ?? [];
  const stagingTransforms = staging.route.transforms ?? [];

  if (prodTransforms.length > 0 || stagingTransforms.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Transforms'));

    const prodKeys = prodTransforms.map(transformKey);
    const stagingKeys = stagingTransforms.map(transformKey);

    for (let i = 0; i < stagingTransforms.length; i++) {
      const key = stagingKeys[i];
      const prodIdx = prodKeys.indexOf(key);
      if (prodIdx === -1) {
        lines.push(
          `${chalk.green('+')} ${formatTransform(stagingTransforms[i])}`
        );
      } else {
        const prodArgs = stringifyArgs(prodTransforms[prodIdx].args);
        const stagingArgs = stringifyArgs(stagingTransforms[i].args);
        if (prodArgs !== stagingArgs) {
          lines.push(
            `${chalk.yellow('~')} ${formatTransform(stagingTransforms[i])} ${chalk.gray(`(was: ${prodArgs})`)}`
          );
        } else {
          lines.push(`  ${formatTransform(stagingTransforms[i])}`);
        }
      }
    }

    // Removed transforms
    for (let i = 0; i < prodTransforms.length; i++) {
      const key = prodKeys[i];
      if (!stagingKeys.includes(key)) {
        lines.push(
          `${chalk.red('-')} ${chalk.strikethrough(formatTransformPlain(prodTransforms[i]))}`
        );
      }
    }
  }

  // Has conditions diff
  const prodHas = (production.route.has ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;
  const stagingHas = (staging.route.has ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;

  if (prodHas.length > 0 || stagingHas.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Has Conditions'));
    diffConditions(lines, prodHas, stagingHas);
  }

  // Missing conditions diff
  const prodMissing = (production.route.missing ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;
  const stagingMissing = (staging.route.missing ?? []) as Array<{
    type: string;
    key?: string;
    value?: unknown;
  }>;

  if (prodMissing.length > 0 || stagingMissing.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Missing Conditions'));
    diffConditions(lines, prodMissing, stagingMissing);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

function normalizeForComparison(rule: RoutingRule) {
  return {
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    route: rule.route,
  };
}

function transformKey(t: {
  type: string;
  op: string;
  target: { key: unknown };
}): string {
  const key =
    typeof t.target.key === 'string'
      ? t.target.key
      : JSON.stringify(t.target.key);
  return `${t.type}:${t.op}:${key}`;
}

function stringifyArgs(args: unknown): string {
  if (args === undefined) return '';
  if (typeof args === 'string') return args;
  if (Array.isArray(args)) return args.join(', ');
  return JSON.stringify(args);
}

/**
 * Plain-text format for a transform (no chalk colors, for use with strikethrough).
 */
function formatTransformPlain(transform: {
  type: string;
  op: string;
  target: { key: string | Record<string, unknown> };
  args?: string | string[];
}): string {
  const typeLabel = TRANSFORM_TYPE_LABELS[transform.type] ?? transform.type;
  const key =
    typeof transform.target.key === 'string'
      ? transform.target.key
      : JSON.stringify(transform.target.key);
  const parts = [`[${typeLabel}]`, transform.op, key];
  if (transform.args !== undefined && transform.op !== 'delete') {
    const argsStr = Array.isArray(transform.args)
      ? transform.args.join(', ')
      : transform.args;
    parts.push(`= ${argsStr}`);
  }
  return parts.join(' ');
}

function conditionKey(c: {
  type: string;
  key?: string;
  value?: unknown;
}): string {
  return JSON.stringify({ type: c.type, key: c.key, value: c.value });
}

function diffConditions(
  lines: string[],
  prodConditions: Array<{ type: string; key?: string; value?: unknown }>,
  stagingConditions: Array<{ type: string; key?: string; value?: unknown }>
): void {
  const prodKeys = prodConditions.map(conditionKey);
  const stagingKeys = stagingConditions.map(conditionKey);

  for (const cond of stagingConditions) {
    const key = conditionKey(cond);
    if (prodKeys.includes(key)) {
      lines.push(`  ${formatCondition(cond)}`);
    } else {
      lines.push(`${chalk.green('+')} ${formatCondition(cond)}`);
    }
  }

  for (const cond of prodConditions) {
    const key = conditionKey(cond);
    if (!stagingKeys.includes(key)) {
      lines.push(`${chalk.red('-')} ${formatCondition(cond)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Standard route display (non-diff mode)
// ---------------------------------------------------------------------------

function formatRouteDetails(rule: RoutingRule): string {
  const lines: string[] = [''];
  const typeLabels = getRouteTypeLabels(rule);
  const syntaxLabel = getSrcSyntaxLabel(rule);
  const statusText =
    rule.enabled === false ? chalk.red('Disabled') : chalk.green('Enabled');
  const stagedText = rule.staged
    ? chalk.yellow('Staged (not yet published)')
    : chalk.green('Published');

  lines.push(`  ${chalk.bold(rule.name)}`);
  lines.push(`  ${chalk.gray(rule.id)}`);
  lines.push('');

  if (rule.description) {
    lines.push(`  ${rule.description}`);
    lines.push('');
  }

  lines.push(`  ${chalk.cyan('Status:')}      ${statusText}`);
  lines.push(`  ${chalk.cyan('State:')}       ${stagedText}`);
  lines.push(`  ${chalk.cyan('Type:')}        ${typeLabels}`);
  lines.push('');

  lines.push(chalk.bold('  Route Configuration'));
  lines.push(`  ${chalk.cyan('Source:')}      ${rule.route.src}`);
  lines.push(`  ${chalk.cyan('Syntax:')}      ${syntaxLabel}`);

  if (rule.route.dest) {
    lines.push(`  ${chalk.cyan('Destination:')} ${rule.route.dest}`);
  }

  if (rule.route.status) {
    lines.push(`  ${chalk.cyan('HTTP Status:')} ${rule.route.status}`);
  }

  if (rule.route.headers && Object.keys(rule.route.headers).length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Response Headers'));
    for (const [key, value] of Object.entries(rule.route.headers)) {
      lines.push(`  ${chalk.cyan(key + ':')} ${value}`);
    }
  }

  if (rule.route.transforms && rule.route.transforms.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Transforms'));
    for (const transform of rule.route.transforms) {
      lines.push(`  ${formatTransform(transform)}`);
    }
  }

  if (rule.route.has && rule.route.has.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Has Conditions'));
    for (const condition of rule.route.has) {
      lines.push(`  ${formatCondition(condition)}`);
    }
  }

  if (rule.route.missing && rule.route.missing.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Missing Conditions'));
    for (const condition of rule.route.missing) {
      lines.push(`  ${formatCondition(condition)}`);
    }
  }

  lines.push('');

  return lines.join('\n');
}
