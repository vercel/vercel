import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { enableSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoute,
  offerAutoPromote,
} from './shared';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import editRoute from '../../util/routes/edit-route';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

export default async function enable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, enableSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args } = parsed;
  const identifier = args[0];

  if (!identifier) {
    output.error(
      `Route name or ID is required. Usage: ${getCommandName('routes enable <name-or-id>')}`
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
  const route = await resolveRoute(client, routes, identifier);
  if (!route) {
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  // Check if already enabled
  if (route.enabled !== false) {
    output.log(`Route "${route.name}" is already enabled.`);
    return 0;
  }

  // Enable the route
  const enableStamp = stamp();
  output.spinner(`Enabling route "${route.name}"`);

  try {
    const { version } = await editRoute(
      client,
      project.id,
      route.id,
      {
        route: {
          name: route.name,
          description: route.description,
          enabled: true,
          srcSyntax: route.srcSyntax,
          route: route.route,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Enabled')} route "${route.name}" ${chalk.gray(enableStamp())}`
    );

    // Auto-promote offer
    await offerAutoPromote(
      client,
      project.id,
      version,
      !!existingStagingVersion,
      { teamId }
    );

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string; code?: string };
    if (error.code === 'feature_not_enabled') {
      output.error(
        'Project-level routes are not enabled for this project. Please contact support.'
      );
    } else {
      output.error(error.message || 'Failed to enable route');
    }
    return 1;
  }
}
