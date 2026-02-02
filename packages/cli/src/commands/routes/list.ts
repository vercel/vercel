import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { getCommandName } from '../../util/pkg-name';
import {
  getRouteTypeLabels,
  type RoutingRule,
  type RouteType,
  type DiffAction,
} from '../../util/routes/types';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, listSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const search = flags['--search'] as string | undefined;
  const filter = flags['--filter'] as RouteType | undefined;
  const page = flags['--page'] as number | undefined;
  const perPage = flags['--per-page'] as number | undefined;
  const staging = flags['--staging'] as boolean | undefined;
  const versionIdFlag = flags['--version'] as string | undefined;
  const diffFlag = flags['--diff'] as boolean | undefined;
  const expand = flags['--expand'] as boolean | undefined;

  // Validate filter value
  if (filter) {
    const validFilters: RouteType[] = [
      'header',
      'rewrite',
      'redirect',
      'terminate',
      'transform',
    ];
    if (!validFilters.includes(filter)) {
      output.error(
        `Invalid filter type "${filter}". Valid types: ${validFilters.join(', ')}`
      );
      return 1;
    }
  }

  // Check for conflicting flags early
  if (staging && versionIdFlag) {
    output.error('Cannot use both --staging and --version flags together');
    return 1;
  }

  let versionId: string | undefined;
  let versionName: string | undefined;

  let useDiff = false;

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
    versionName = stagingVersion.id;

    // Enable diff mode when viewing staging without search/filter/page
    if (!search && !filter && !page) {
      useDiff = diffFlag !== false; // Default to diff unless explicitly disabled
    }
  }

  if (versionIdFlag) {
    output.spinner('Fetching version');
    const { versions } = await getRouteVersions(client, project.id, {
      teamId,
    });
    const version = versions.find(v => v.id === versionIdFlag);

    if (!version) {
      output.error(
        `Version "${versionIdFlag}" not found. Run ${chalk.cyan(
          getCommandName('routes list-versions')
        )} to see available versions.`
      );
      return 1;
    }

    versionId = version.id;
    versionName = version.id;
  }

  // If --diff flag is explicitly set without --staging, show error
  if (diffFlag && !staging && !versionIdFlag) {
    output.error(
      'The --diff flag requires --staging or --version to compare against production'
    );
    return 1;
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

  const { routes, version } = await getRoutes(client, project.id, {
    teamId,
    search,
    filter,
    page,
    perPage,
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
  }

  return 0;
}

function formatRoutesTable(
  routes: RoutingRule[],
  actionSymbol?: DiffAction
): string {
  const rows: string[][] = routes.map((rule, index) => {
    const typeLabels = getRouteTypeLabels(rule);
    const status = rule.enabled === false ? chalk.gray('Disabled') : '';
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
      colorFn(truncate(rule.name, 30)),
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
    const typeLabels = getRouteTypeLabels(rule);
    const statusText =
      rule.enabled === false ? chalk.gray('Disabled') : chalk.green('Enabled');
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

    if (rule.route.dest) {
      lines.push(`     ${chalk.cyan('Dest:')}    ${rule.route.dest}`);
    }

    if (rule.route.status) {
      lines.push(`     ${chalk.cyan('Status:')}  ${rule.route.status}`);
    }

    if (rule.route.headers && Object.keys(rule.route.headers).length > 0) {
      lines.push(`     ${chalk.cyan('Headers:')}`);
      for (const [key, value] of Object.entries(rule.route.headers)) {
        lines.push(`       ${key}: ${value}`);
      }
    }

    if (rule.route.has && rule.route.has.length > 0) {
      lines.push(`     ${chalk.cyan('Has conditions:')}`);
      for (const condition of rule.route.has) {
        lines.push(`       ${formatCondition(condition)}`);
      }
    }

    if (rule.route.missing && rule.route.missing.length > 0) {
      lines.push(`     ${chalk.cyan('Missing conditions:')}`);
      for (const condition of rule.route.missing) {
        lines.push(`       ${formatCondition(condition)}`);
      }
    }

    lines.push(''); // blank line between routes
  });

  return lines.join('\n');
}

function formatCondition(condition: {
  type: string;
  key?: string;
  value?: unknown;
}): string {
  const formatValue = (val: unknown): string => {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  };

  if (condition.key && condition.value !== undefined) {
    return `${condition.type}: ${condition.key}=${formatValue(condition.value)}`;
  }
  if (condition.key) {
    return `${condition.type}: ${condition.key}`;
  }
  if (condition.value !== undefined) {
    return `${condition.type}: ${formatValue(condition.value)}`;
  }
  return condition.type;
}
