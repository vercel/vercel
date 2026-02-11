import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { deleteSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoutes,
  offerAutoPromote,
} from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import deleteRoutes from '../../util/routes/delete-routes';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { getRouteTypeLabel } from '../../util/routes/types';

export default async function del(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, deleteSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const skipConfirmation = flags['--yes'] as boolean | undefined;

  if (args.length === 0) {
    output.error(
      `At least one route name or ID is required. Usage: ${getCommandName('routes delete <name-or-id> [...]')}`
    );
    return 1;
  }

  // Check for existing staging version (for auto-promote logic)
  const { versions } = await getRouteVersions(client, project.id, { teamId });
  const existingStagingVersion = versions.find(v => v.isStaging);

  // Fetch all routes to resolve identifiers
  output.spinner('Fetching routes');
  const { routes } = await getRoutes(client, project.id, { teamId });
  output.stopSpinner();

  if (routes.length === 0) {
    output.error('No routes found in this project.');
    return 1;
  }

  // Resolve each identifier to a route
  const resolved = await resolveRoutes(client, routes, args);
  if (!resolved) return 1;

  // Show what will be deleted
  output.print('\n');
  output.log(
    `The following ${resolved.length === 1 ? 'route' : `${resolved.length} routes`} will be deleted:`
  );
  for (const route of resolved) {
    const typeLabels = getRouteTypeLabel(route);
    output.print(
      `  ${chalk.red('×')} ${route.name} ${chalk.gray(`(${route.route.src})`)} ${chalk.gray(`[${typeLabels}]`)}\n`
    );
  }
  output.print('\n');

  // Confirm
  if (!skipConfirmation) {
    const confirmed = await client.input.confirm(
      `Delete ${resolved.length === 1 ? 'this route' : `these ${resolved.length} routes`}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }

  // Delete
  const deleteStamp = stamp();
  output.spinner(
    `Deleting ${resolved.length === 1 ? 'route' : `${resolved.length} routes`}`
  );

  try {
    const { deletedCount, version } = await deleteRoutes(
      client,
      project.id,
      resolved.map(r => r.id),
      { teamId }
    );

    output.log(
      `${chalk.cyan('Deleted')} ${deletedCount} ${deletedCount === 1 ? 'route' : 'routes'} ${chalk.gray(deleteStamp())}`
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
      output.error(error.message || 'Failed to delete routes');
    }
    return 1;
  }
}
