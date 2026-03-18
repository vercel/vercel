import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { disableSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  resolveRoute,
  offerAutoPromote,
  withGlobalFlags,
} from './shared';
import { outputAgentError } from '../../util/agent-output';
import getRoutes from '../../util/routes/get-routes';
import getRouteVersions from '../../util/routes/get-route-versions';
import editRoute from '../../util/routes/edit-route';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

export default async function disable(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, disableSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args } = parsed;
  const identifier = args[0];

  if (!identifier) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: 'Route name or ID is required.',
          next: [
            {
              command: withGlobalFlags(client, 'routes disable <name-or-id>'),
              when: 'replace <name-or-id>',
            },
            {
              command: withGlobalFlags(client, 'routes list'),
              when: 'list routes',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Route name or ID is required. Usage: ${getCommandName('routes disable <name-or-id>')}`
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_found',
          message: 'No routes found in this project.',
        },
        1
      );
    }
    output.error('No routes found in this project.');
    return 1;
  }

  // Resolve the route
  const route = await resolveRoute(client, routes, identifier);
  if (!route) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_found',
          message: `No route found matching "${identifier}".`,
          next: [
            {
              command: withGlobalFlags(client, 'routes list'),
              when: 'list routes',
            },
          ],
        },
        1
      );
    }
    output.error(
      `No route found matching "${identifier}". Run ${chalk.cyan(
        getCommandName('routes list')
      )} to see all routes.`
    );
    return 1;
  }

  // Check if already disabled
  if (route.enabled === false) {
    output.log(`Route "${route.name}" is already disabled.`);
    return 0;
  }

  // Disable the route
  const disableStamp = stamp();
  output.spinner(`Disabling route "${route.name}"`);

  try {
    const { version } = await editRoute(
      client,
      project.id,
      route.id,
      {
        route: {
          name: route.name,
          description: route.description,
          enabled: false,
          srcSyntax: route.srcSyntax,
          route: route.route,
        },
      },
      { teamId }
    );

    output.log(
      `${chalk.cyan('Disabled')} route "${route.name}" ${chalk.gray(disableStamp())}`
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
    const error = e as { message?: string };
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'api_error',
          message: error.message || 'Failed to disable route',
        },
        1
      );
    }
    output.error(error.message || 'Failed to disable route');
    return 1;
  }
}
