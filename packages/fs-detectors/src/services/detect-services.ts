import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
} from './types';
import { isStaticBuild, readVercelConfig } from './utils';
import { resolveAllConfiguredServices } from './resolve';

/**
 * Detect and resolve services within a project.
 *
 * Reads vercel.json and resolves `experimentalServices` into ResolvedService objects.
 * Returns an error if no services are configured.
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath } = options;

  // Scope filesystem to workPath if provided
  const scopedFs = workPath ? fs.chdir(workPath) : fs;

  // Read vercel.json
  const { config: vercelConfig, error: configError } =
    await readVercelConfig(scopedFs);

  if (configError) {
    return {
      services: [],
      routes: { rewrites: [], defaults: [], crons: [], workers: [] },
      errors: [configError],
      warnings: [],
    };
  }

  const configuredServices = vercelConfig?.experimentalServices;
  const hasConfiguredServices =
    configuredServices && Object.keys(configuredServices).length > 0;

  if (!hasConfiguredServices) {
    return {
      services: [],
      routes: { rewrites: [], defaults: [], crons: [], workers: [] },
      errors: [
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ],
      warnings: [],
    };
  }

  // Resolve configured services from vercel.json
  const result = resolveAllConfiguredServices(configuredServices);

  // Generate routes
  const routes = generateServicesRoutes(result.services);

  return {
    services: result.services,
    routes,
    errors: result.errors,
    warnings: [],
  };
}

/**
 * Generate routing rules for services.
 *
 * Routes are ordered by prefix length (longest first) to ensure more specific
 * routes match before broader ones. For example, `/api/users` must be checked
 * before `/api`, which must be checked before the catch-all `/`.
 *
 * - Static/SPA services: SPA fallback routes to index.html
 * - Serverless services: Rewrite to the function entrypoint
 * - Cron/Worker services: TODO - internal routes under `/_svc/`
 */
export function generateServicesRoutes(
  services: ResolvedService[]
): ServicesRoutes {
  const rewrites: Route[] = [];
  const defaults: Route[] = [];
  const crons: Route[] = [];
  const workers: Route[] = [];

  const webServices = services.filter(
    (s): s is ResolvedService & { routePrefix: string } =>
      s.type === 'web' && typeof s.routePrefix === 'string'
  );

  const staticServices = webServices.filter(isStaticBuild);
  const functionServices = webServices.filter(s => !isStaticBuild(s));

  // Sort by prefix length (longest first) so specific routes match before broad ones.
  const sortServices = <T extends { routePrefix: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => b.routePrefix.length - a.routePrefix.length);

  const sortedFunctionServices = sortServices(functionServices);
  const sortedStaticServices = sortServices(staticServices);

  // Generate routes for serverless function services
  for (const service of sortedFunctionServices) {
    const { routePrefix, builder } = service;

    // The dest must point to the actual function path (builder.src),
    // not just the routePrefix, so Vercel can find the .func directory
    const builderSrc = builder.src || routePrefix;
    const functionPath = builderSrc.startsWith('/')
      ? builderSrc
      : `/${builderSrc}`;

    // `check: true` tells the router to verify the destination exists on the
    // filesystem before applying the route. If it doesn't exist, the route is
    // skipped and routing continues. This ensures requests only route to
    // functions that were successfully built.
    if (routePrefix === '/') {
      // Root function service: catch-all route
      defaults.push({
        src: '^/(.*)$',
        dest: functionPath,
        check: true,
      });
    } else {
      // Non-root function service: prefix-based rewrite
      const normalizedPrefix = routePrefix.startsWith('/')
        ? routePrefix.slice(1)
        : routePrefix;
      rewrites.push({
        src: `^/${normalizedPrefix}(?:/.*)?$`,
        dest: functionPath,
        check: true,
      });
    }
  }

  // Generate SPA fallback routes for static services
  // These routes serve index.html for client-side routing after filesystem
  // routing has been attempted. Framework-specific routes (cache headers, etc.)
  // are handled by the builder via framework.defaultRoutes.
  for (const service of sortedStaticServices) {
    const { routePrefix } = service;

    if (routePrefix === '/') {
      // Root static service: SPA fallback after filesystem routing
      defaults.push({ handle: 'filesystem' });
      defaults.push({
        src: '/(.*)',
        dest: '/index.html',
      });
    } else {
      // Prefixed static service: SPA fallback for the prefix
      // Files are mounted at /{prefix}/* by the builder (e.g., admin/index.html)
      const normalizedPrefix = routePrefix.startsWith('/')
        ? routePrefix.slice(1)
        : routePrefix;

      // SPA fallback: if no static file matches under this prefix, serve its index.html
      rewrites.push({
        src: `^/${normalizedPrefix}(?:/.*)?$`,
        dest: `/${normalizedPrefix}/index.html`,
      });
    }
  }

  return { rewrites, defaults, crons, workers };
}
