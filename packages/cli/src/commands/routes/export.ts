import type Client from '../../util/client';
import output from '../../output-manager';
import { exportSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRoutes from '../../util/routes/get-routes';
import { getCommandName } from '../../util/pkg-name';
import type { RoutingRule } from '../../util/routes/types';
import type { RouteWithSrc } from '@vercel/routing-utils';

/**
 * Strips internal-only fields from a route object for export.
 * Matches the frontend's cleanRoute() in code-generation.ts.
 */
function cleanRoute(route: RouteWithSrc): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(route)) {
    if (value === undefined) continue;
    // Strip internal-only fields
    if (
      key === 'middlewarePath' ||
      key === 'middlewareRawSrc' ||
      key === 'middleware' ||
      key === 'check' ||
      key === 'important'
    ) {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

/**
 * Formats routes as vercel.json config (routes array).
 */
function routesToVercelJson(rules: RoutingRule[]): string {
  const enabledRoutes = rules.filter(r => r.enabled !== false);
  const cleaned = enabledRoutes.map(r => cleanRoute(r.route));
  const config = { routes: cleaned };
  return JSON.stringify(config, null, 2);
}

/**
 * Formats routes as vercel.ts config using defineConfig.
 */
function routesToVercelTs(rules: RoutingRule[]): string {
  const enabledRoutes = rules.filter(r => r.enabled !== false);

  const routeEntries = enabledRoutes.map(r => {
    const cleaned = cleanRoute(r.route);
    const routeJson = JSON.stringify(cleaned, null, 2);
    const indented = routeJson
      .split('\n')
      .map((line, i) => (i === 0 ? line : `    ${line}`))
      .join('\n');

    if (r.description) {
      const safeDesc = r.description.replace(/\n/g, ' ');
      return `    // ${safeDesc}\n    ${indented}`;
    }
    return `    ${indented}`;
  });

  const routesContent =
    routeEntries.length > 0 ? `\n${routeEntries.join(',\n')},\n  ` : '';

  return `import { defineConfig } from '@vercel/sdk/config';

export default defineConfig({
  routes: [${routesContent}],
});
`;
}

export default async function exportRoutes(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, exportSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const { args, flags } = parsed;
  const format = (flags['--format'] as string) || 'json';
  const nameOrId = args[0];

  const validFormats = ['json', 'ts'];
  if (!validFormats.includes(format)) {
    output.error(
      `Invalid format: "${format}". Valid formats: ${validFormats.join(', ')}. Usage: ${getCommandName('routes export --format json')}`
    );
    return 1;
  }

  // Fetch routes
  output.spinner('Fetching routes');

  try {
    const { routes } = await getRoutes(client, project.id, { teamId });

    if (routes.length === 0) {
      output.log(
        `No routes found. Create one with ${getCommandName('routes add')}.`
      );
      return 0;
    }

    // Filter by name if specified
    let routesToExport = routes;
    if (nameOrId) {
      const query = nameOrId.toLowerCase();
      routesToExport = routes.filter(
        r =>
          r.name.toLowerCase() === query ||
          r.name.toLowerCase().includes(query) ||
          r.id === nameOrId
      );

      if (routesToExport.length === 0) {
        output.error(
          `No route found matching "${nameOrId}". Run ${getCommandName('routes list')} to see all routes.`
        );
        return 1;
      }
    }

    // Format and output
    let result: string;
    switch (format) {
      case 'ts':
        result = routesToVercelTs(routesToExport);
        break;
      case 'json':
      default:
        result = routesToVercelJson(routesToExport);
        break;
    }

    // Write to stdout so it can be piped
    output.stopSpinner();
    client.stdout.write(result.trimEnd() + '\n');

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    output.error(error.message || 'Failed to export routes');
    return 1;
  }
}
