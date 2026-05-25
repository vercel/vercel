import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import { listSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  findVersionById,
  formatCondition,
  formatTransform,
  withGlobalFlags,
} from './shared';
import { outputAgentError } from '../../util/agent-output';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { getCommandName } from '../../util/pkg-name';
import {
  getRouteTypeLabel,
  getSrcSyntaxLabel,
  type RoutingRule,
  type RouteType,
  type DiffAction,
} from '../../util/routes/types';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, listSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const search = flags['--search'] as string | undefined;
  const filter = flags['--filter'] as RouteType | undefined;
  const production = flags['--production'] as boolean | undefined;
  const versionIdFlag = flags['--version-id'] as string | undefined;
  const diffFlag = flags['--diff'] as boolean | undefined;
  const expand = flags['--expand'] as boolean | undefined;

  // Validate filter value
  if (filter) {
    const validFilters: RouteType[] = [
      'rewrite',
      'redirect',
      'set_status',
      'transform',
    ];
    if (!validFilters.includes(filter)) {
      const msg = `Invalid filter type "${filter}". Valid types: ${validFilters.join(', ')}`;
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'invalid_arguments',
          message: msg,
          next: [{ command: withGlobalFlags(client, 'routes list') }],
        });
        process.exit(1);
      }
      output.error(msg);
      return 1;
    }
  }

  if (production && versionIdFlag) {
    const msg = 'Cannot use both --production and --version-id flags together';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'routes list') }],
      });
      process.exit(1);
    }
    output.error(msg);
    return 1;
  }

  if (production && diffFlag) {
    const msg =
      'Cannot use both --production and --diff flags together. --diff compares staged changes against production.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message: msg,
        next: [{ command: withGlobalFlags(client, 'routes list --diff') }],
      });
      process.exit(1);
    }
    output.error(msg);
    return 1;
  }

  let versionId: string | undefined;
  let versionName: string | undefined;
  let useDiff = false;

  if (production) {
    output.spinner('Fetching production version');
    const { versions } = await getRouteVersions(client, project.id, {
      teamId,
    });
    const productionVersion = versions.find(v => !v.isStaging);

    if (!productionVersion) {
      const msg = `No production version found for ${project.name}.`;
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'not_found',
          message: msg,
          next: [{ command: withGlobalFlags(client, 'routes list') }],
        });
        process.exit(1);
      }
      output.error(
        `No production version found for ${chalk.bold(project.name)}.`
      );
      return 1;
    }

    versionId = productionVersion.id;
    versionName = productionVersion.id;
  }

  if (diffFlag && !versionIdFlag) {
    // --diff without --version-id: diff staging against production
    output.spinner('Fetching staging version');
    const { versions } = await getRouteVersions(client, project.id, {
      teamId,
    });
    const stagingVersion = versions.find(v => v.isStaging);

    if (!stagingVersion) {
      const msg = `No staged changes to diff. Run ${getCommandName('routes add')} or ${getCommandName('routes edit')} to make changes.`;
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'not_found',
          message: msg,
          next: [
            { command: withGlobalFlags(client, 'routes list') },
            { command: withGlobalFlags(client, 'routes add') },
          ],
        });
        process.exit(1);
      }
      output.error(
        `No staged changes to diff. Run ${chalk.cyan(
          getCommandName('routes add')
        )} or ${chalk.cyan(getCommandName('routes edit'))} to make changes.`
      );
      return 1;
    }

    versionId = stagingVersion.id;
    versionName = stagingVersion.id;
    useDiff = true;
  }

  if (versionIdFlag) {
    output.spinner('Fetching version');
    const { versions } = await getRouteVersions(client, project.id, {
      teamId,
    });
    const result = findVersionById(versions, versionIdFlag);

    if (result.error || !result.version) {
      const msg = result.error ?? 'Version not found';
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'not_found',
          message: msg,
          next: [{ command: withGlobalFlags(client, 'routes list-versions') }],
        });
        process.exit(1);
      }
      output.error(msg);
      return 1;
    }

    versionId = result.version.id;
    versionName = result.version.id;

    if (diffFlag) {
      useDiff = true;
    }
  }

  const lsStamp = stamp();

  let spinnerMessage = `Fetching routes for ${chalk.bold(project.name)}`;
  if (versionName) {
    spinnerMessage += ` (version: ${versionName})`;
  }
  if (search) {
    spinnerMessage += ` matching "${search}"`;
  }
  if (filter) {
    spinnerMessage += ` filtered by ${filter}`;
  }
  output.spinner(spinnerMessage);

  const { routes, version, limit } = await getRoutes(client, project.id, {
    teamId,
    search,
    filter,
    versionId,
    diff: useDiff,
  });

  if (useDiff) {
    const added = routes.filter(r => r.action === '+');
    const removed = routes.filter(r => r.action === '-');
    const modified = routes.filter(r => r.action === '~');
    const unchanged = routes.filter(r => !r.action);

    output.log(
      `Changes in staging version ${chalk.bold(versionName || '')} ${chalk.gray(lsStamp())}`
    );

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
      output.log('\n  No changes from production version\n');
    } else {
      if (added.length > 0) {
        output.print(
          `\n  ${chalk.bold(chalk.green(`Added (${added.length}):`))}
`
        );
        output.print(formatRoutesTable(added, '+'));
      }

      if (modified.length > 0) {
        output.print(
          `\n  ${chalk.bold(chalk.yellow(`Modified (${modified.length}):`))}
`
        );
        output.print(formatRoutesTable(modified, '~'));
      }

      if (removed.length > 0) {
        output.print(
          `\n  ${chalk.bold(chalk.red(`Removed (${removed.length}):`))}
`
        );
        output.print(formatRoutesTable(removed, '-'));
      }

      if (unchanged.length > 0) {
        output.print(
          `\n  ${chalk.gray(`${unchanged.length} route${unchanged.length === 1 ? '' : 's'} unchanged`)}\n`
        );
      }

      output.print('\n');
    }

    // Show test alias if available
    if (version?.alias) {
      output.log(
        `Test your changes: ${chalk.cyan(`https://${version.alias}`)}`
      );
    }
  } else {
    let resultMessage = `${plural('Route', routes.length, true)} found for ${chalk.bold(
      project.name
    )}`;
    if (versionName) {
      resultMessage += ` ${chalk.gray(`(version: ${versionName})`)}`;
    }
    if (search) {
      resultMessage += ` matching "${search}"`;
    }
    if (filter) {
      resultMessage += ` filtered by ${filter}`;
    }
    resultMessage += ` ${chalk.gray(lsStamp())}`;

    output.log(resultMessage);

    if (routes.length > 0) {
      if (expand) {
        output.print(formatExpandedRoutes(routes));
      } else {
        output.print(formatRoutesTable(routes));
      }
      output.print('\n');
    }

    // Show routes usage when above 80% utilization
    if (limit && limit.maxRoutes > 0) {
      const utilization = limit.currentRoutes / limit.maxRoutes;
      if (utilization >= 0.8) {
        const usageColor = utilization >= 1 ? chalk.red : chalk.yellow;
        output.print(
          `  ${usageColor(`Routes Usage: ${limit.currentRoutes}/${limit.maxRoutes}`)}\n\n`
        );
      }
    }
  }

  return 0;
}

function formatRoutesTable(
  routes: RoutingRule[],
  actionSymbol?: DiffAction
): string {
  const rows: string[][] = routes.map((rule, index) => {
    const typeLabels = getRouteTypeLabel(rule);
    const status =
      rule.enabled === false ? chalk.red('Disabled') : chalk.green('Enabled');
    const prefix = actionSymbol || '';
    const colorFn =
      actionSymbol === '+'
        ? chalk.green
        : actionSymbol === '-'
          ? chalk.red
          : actionSymbol === '~'
            ? chalk.yellow
            : (s: string) => s;

    const position = actionSymbol ? '' : `${index + 1}`;

    return [
      colorFn(`${prefix} ${position}`).trim(),
      colorFn(
        truncate(rule.name, 30) + (rule.staged ? chalk.yellow(' (draft)') : '')
      ),
      colorFn(truncate(rule.route.src, 40)),
      colorFn(typeLabels),
      status,
    ];
  });

  return formatTable(
    ['#', 'Name', 'Path Pattern', 'Actions', 'Status'],
    ['r', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function formatExpandedRoutes(routes: RoutingRule[]): string {
  const lines: string[] = [''];

  routes.forEach((rule, index) => {
    const typeLabels = getRouteTypeLabel(rule);
    const syntaxLabel = getSrcSyntaxLabel(rule);
    const statusText =
      rule.enabled === false ? chalk.red('Disabled') : chalk.green('Enabled');
    const stagedText = rule.staged ? chalk.yellow(' (staged)') : '';

    lines.push(
      `  ${chalk.bold(`${index + 1}. ${rule.name}`)}${stagedText}  ${chalk.gray(`[${rule.id}]`)}`
    );
    lines.push(`     ${chalk.cyan('Status:')}  ${statusText}`);
    lines.push(`     ${chalk.cyan('Type:')}    ${typeLabels}`);

    if (rule.description) {
      lines.push(`     ${chalk.cyan('Desc:')}    ${rule.description}`);
    }

    lines.push(`     ${chalk.cyan('Source:')}  ${rule.route.src}`);
    lines.push(`     ${chalk.cyan('Syntax:')}  ${syntaxLabel}`);

    if (rule.route.dest) {
      lines.push(`     ${chalk.cyan('Dest:')}    ${rule.route.dest}`);
    }

    if (rule.route.status) {
      lines.push(`     ${chalk.cyan('Code:')}    ${rule.route.status}`);
    }

    if (rule.route.headers && Object.keys(rule.route.headers).length > 0) {
      lines.push(`     ${chalk.cyan('Response Headers:')}`);
      for (const [key, value] of Object.entries(rule.route.headers)) {
        lines.push(`       ${key}: ${value}`);
      }
    }

    if (rule.route.transforms && rule.route.transforms.length > 0) {
      lines.push(`     ${chalk.cyan('Transforms:')}`);
      for (const transform of rule.route.transforms) {
        lines.push(`       ${formatTransform(transform)}`);
      }
    }

    if (rule.route.has && rule.route.has.length > 0) {
      lines.push(`     ${chalk.cyan('Has conditions:')}`);
      for (const condition of rule.route.has) {
        lines.push(`       ${formatCondition(condition)}`);
      }
    }

    if (rule.route.missing && rule.route.missing.length > 0) {
      lines.push(`     ${chalk.cyan('Does not have conditions:')}`);
      for (const condition of rule.route.missing) {
        lines.push(`       ${formatCondition(condition)}`);
      }
    }

    lines.push(''); // blank line between routes
  });

  return lines.join('\n');
}
