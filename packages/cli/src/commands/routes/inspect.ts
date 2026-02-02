import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { inspectSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { getRouteTypeLabels, type RoutingRule } from '../../util/routes/types';

export default async function inspect(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, inspectSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags, args } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const staging = flags['--staging'] as boolean | undefined;

  // Get the route identifier from args
  // args[0] is 'inspect', args[1] is the identifier
  const identifier = args[0] === 'inspect' ? args[1] : args[0];

  if (!identifier) {
    output.error(
      `Missing route name or ID. Usage: ${chalk.cyan(getCommandName('routes inspect <name-or-id>'))}`
    );
    return 1;
  }

  let versionId: string | undefined;

  if (staging) {
    output.spinner('Fetching staging version');
    const { versions } = await getRouteVersions(client, project.id, {
      teamId,
    });
    const stagingVersion = versions.find(v => v.isStaging);

    if (!stagingVersion) {
      output.error(
        `No staging version found for ${chalk.bold(project.name)}. Run ${chalk.cyan(
          getCommandName('routes list-versions')
        )} to see available versions.`
      );
      return 1;
    }

    versionId = stagingVersion.id;
  }

  const inspectStamp = stamp();
  output.spinner(
    `Searching for route "${identifier}" in ${chalk.bold(project.name)}`
  );

  // Use the search parameter to find matching routes
  const { routes } = await getRoutes(client, project.id, {
    teamId,
    search: identifier,
    versionId,
  });

  // Also try to find exact match by ID (in case search doesn't match IDs well)
  const exactMatch = routes.find(
    r =>
      r.id === identifier || r.name.toLowerCase() === identifier.toLowerCase()
  );

  if (exactMatch) {
    // Found exact match - show it
    output.log(
      `Route found in ${chalk.bold(project.name)} ${chalk.gray(inspectStamp())}`
    );
    output.print(formatRouteDetails(exactMatch));
    return 0;
  }

  if (routes.length === 0) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  if (routes.length === 1) {
    // Only one match - show it
    output.log(
      `Route found in ${chalk.bold(project.name)} ${chalk.gray(inspectStamp())}`
    );
    output.print(formatRouteDetails(routes[0]));
    return 0;
  }

  // Multiple matches - let user select interactively
  output.log(
    `Found ${routes.length} routes matching "${identifier}" ${chalk.gray(inspectStamp())}`
  );

  const selectedId = await client.input.select({
    message: 'Select a route to inspect:',
    choices: routes.map(route => ({
      value: route.id,
      name: `${route.name} ${chalk.gray(`(${route.route.src})`)}`,
    })),
  });

  if (!selectedId) {
    output.error('No route selected');
    return 1;
  }

  const selectedRoute = routes.find(r => r.id === selectedId);
  if (!selectedRoute) {
    output.error('Selected route not found');
    return 1;
  }

  output.print(formatRouteDetails(selectedRoute));
  return 0;
}

function formatRouteDetails(rule: RoutingRule): string {
  const lines: string[] = [''];
  const typeLabels = getRouteTypeLabels(rule);
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

  if (rule.route.dest) {
    lines.push(`  ${chalk.cyan('Destination:')} ${rule.route.dest}`);
  }

  if (rule.route.status) {
    lines.push(`  ${chalk.cyan('HTTP Status:')} ${rule.route.status}`);
  }

  if (rule.route.caseSensitive !== undefined) {
    lines.push(
      `  ${chalk.cyan('Case Sens.:')}  ${rule.route.caseSensitive ? 'Yes' : 'No'}`
    );
  }

  if (rule.route.check !== undefined) {
    lines.push(
      `  ${chalk.cyan('Check:')}       ${rule.route.check ? 'Yes' : 'No'}`
    );
  }

  if (rule.route.headers && Object.keys(rule.route.headers).length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Headers'));
    for (const [key, value] of Object.entries(rule.route.headers)) {
      lines.push(`  ${chalk.cyan(key + ':')} ${value}`);
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

function formatCondition(condition: {
  type: string;
  key?: string;
  value?: unknown;
}): string {
  const parts = [chalk.gray(`[${condition.type}]`)];

  if (condition.key) {
    parts.push(chalk.cyan(condition.key));
  }

  if (condition.value !== undefined) {
    if (typeof condition.value === 'string') {
      parts.push(`= ${condition.value}`);
    } else {
      // Complex MatchableValue - show as JSON
      parts.push(`= ${JSON.stringify(condition.value)}`);
    }
  }

  return parts.join(' ');
}
