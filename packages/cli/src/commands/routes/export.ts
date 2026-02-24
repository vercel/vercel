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
      return `    // ${r.description}\n    ${indented}`;
    }
    return `    ${indented}`;
  });

  return `import { defineConfig } from '@vercel/sdk/config';

export default defineConfig({
  routes: [
${routeEntries.join(',\n')},
  ],
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
  const routeName = args[0];

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
      output.error('No routes found in this project.');
      return 1;
    }

    // Filter by name if specified
    let routesToExport = routes;
    if (routeName) {
      const query = routeName.toLowerCase();
      routesToExport = routes.filter(
        r =>
          r.name.toLowerCase() === query ||
          r.name.toLowerCase().includes(query) ||
          r.id === routeName
      );

      if (routesToExport.length === 0) {
        output.error(
          `No route found matching "${routeName}". Run ${getCommandName('routes list')} to see all routes.`
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
    client.stdout.write(result + '\n');

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string; code?: string; status?: number };
    if (error.code === 'feature_not_enabled') {
      output.error(
        'Project-level routes are not enabled for this project. Please contact support.'
      );
    } else if (error.status === 429) {
      output.error('Rate limited. Please wait a moment and try again.');
    } else {
      output.error(error.message || 'Failed to export routes');
    }
    return 1;
  }
}
