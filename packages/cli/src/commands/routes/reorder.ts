import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { reorderSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoute,
  parsePosition,
  offerAutoPromote,
} from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import stageRoutes from '../../util/routes/stage-routes';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

export default async function reorder(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, reorderSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const identifier = args[0];

  if (!identifier) {
    output.error(
      `Route name or ID is required. Usage: ${getCommandName('routes reorder <name-or-id> --position <pos>')}`
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

  if (routes.length === 1) {
    output.error('Cannot reorder when there is only one route.');
    return 1;
  }

  // Resolve the route
  const route = await resolveRoute(client, routes, identifier);
  if (!route) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  const currentIndex = routes.findIndex(r => r.id === route.id);
  const currentPosition = currentIndex + 1; // 1-based

  // Determine target position
  let targetIndex: number;

  const positionFlag = flags['--position'] as string | undefined;
  const firstFlag = flags['--first'] as boolean | undefined;
  const lastFlag = flags['--last'] as boolean | undefined;

  if (firstFlag) {
    targetIndex = 0;
  } else if (lastFlag) {
    targetIndex = routes.length - 1;
  } else if (positionFlag) {
    // Handle 'first'/'last' aliases
    if (positionFlag === 'first') {
      targetIndex = 0;
    } else if (positionFlag === 'last') {
      targetIndex = routes.length - 1;
    } else {
      // Try numeric position (1-based)
      const num = parseInt(positionFlag, 10);
      if (!isNaN(num) && String(num) === positionFlag) {
        if (num < 1) {
          output.error('Position must be 1 or greater.');
          return 1;
        }
        targetIndex = Math.min(num - 1, routes.length - 1);
      } else {
        // Delegate to shared parsePosition for start/end/before/after
        try {
          const pos = parsePosition(positionFlag);

          if (pos.placement === 'start') {
            targetIndex = 0;
          } else if (pos.placement === 'end') {
            targetIndex = routes.length - 1;
          } else if (pos.placement === 'after' && pos.referenceId) {
            const refIndex = routes.findIndex(r => r.id === pos.referenceId);
            if (refIndex === -1) {
              output.error(
                `Reference route "${pos.referenceId}" not found. Run ${chalk.cyan(
                  getCommandName('routes list')
                )} to see route IDs.`
              );
              return 1;
            }
            targetIndex = Math.min(refIndex + 1, routes.length - 1);
          } else if (pos.placement === 'before' && pos.referenceId) {
            const refIndex = routes.findIndex(r => r.id === pos.referenceId);
            if (refIndex === -1) {
              output.error(
                `Reference route "${pos.referenceId}" not found. Run ${chalk.cyan(
                  getCommandName('routes list')
                )} to see route IDs.`
              );
              return 1;
            }
            targetIndex = refIndex;
          } else {
            output.error('Invalid position specification.');
            return 1;
          }
        } catch (e) {
          output.error(
            `${e instanceof Error ? e.message : 'Invalid position'}. Usage: ${getCommandName('routes reorder <name-or-id> --position <pos>')}`
          );
          return 1;
        }
      }
    }
  } else {
    // Interactive mode: show current routes and ask for position
    output.print('\n');
    output.log('Current route order:');
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const isCurrent = r.id === route.id;
      const prefix = isCurrent ? chalk.cyan('→') : ' ';
      const num = chalk.gray(`${i + 1}.`);
      const name = isCurrent ? chalk.bold(r.name) : r.name;
      const src = chalk.gray(`(${r.route.src})`);
      const marker = isCurrent ? chalk.cyan('  ← current') : '';
      output.print(`  ${prefix} ${num} ${name} ${src}${marker}\n`);
    }
    output.print('\n');

    const input = await client.input.text({
      message: `Move "${route.name}" to position (1-${routes.length}, "first", or "last"):`,
      validate: val => {
        if (!val) return 'Position is required';
        if (val === 'first' || val === 'last') return true;
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1 || num > routes.length) {
          return `Enter a number between 1 and ${routes.length}, "first", or "last"`;
        }
        return true;
      },
    });

    if (input === 'first') {
      targetIndex = 0;
    } else if (input === 'last') {
      targetIndex = routes.length - 1;
    } else {
      targetIndex = parseInt(input, 10) - 1;
    }
  }

  // Clamp targetIndex
  targetIndex = Math.max(0, Math.min(targetIndex, routes.length - 1));

  const targetPosition = targetIndex + 1; // 1-based

  if (currentIndex === targetIndex) {
    output.log(
      `Route "${route.name}" is already at position ${currentPosition}.`
    );
    return 0;
  }

  // Confirm
  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Move "${route.name}" from position ${currentPosition} to position ${targetPosition}?`,
      true
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }

  // Perform the reorder: remove from current position, insert at target
  const reordered = [...routes];
  reordered.splice(currentIndex, 1);
  // Adjust target index if the route was before the target
  const adjustedTarget =
    currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
  reordered.splice(adjustedTarget, 0, route);

  const reorderStamp = stamp();
  output.spinner(`Moving route "${route.name}"`);

  try {
    const { version } = await stageRoutes(
      client,
      project.id,
      reordered,
      true, // overwrite
      { teamId }
    );

    output.log(
      `${chalk.cyan('Moved')} "${route.name}" from position ${currentPosition} to ${targetPosition} ${chalk.gray(reorderStamp())}`
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
      output.error(error.message || 'Failed to reorder route');
    }
    return 1;
  }
}
