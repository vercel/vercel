import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
} from './types';
import { readVercelConfig } from './utils';
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
 * Web services: Routes are ordered by prefix length (longest first) to ensure
 * more specific routes match before broader ones. For example, `/api/users`
 * must be checked before `/api`, which must be checked before the catch-all `/`.
 *
 * Static/SPA services: Use filesystem routing with SPA fallback to index.html.
 * The assets are mounted at the routePrefix path.
 *
 * Serverless services: Route requests to the function path.
 *
 * Cron/Worker services: TODO
 * Use internal routes under `/_svc/crons` and `/_svc/workers`
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

  // Sort by prefix length (longest first) so specific routes match before broad ones.
  // Root services ("/") go last as the catch-all fallback.
  const sortedWebServices = [...webServices].sort((a, b) => {
    if (a.routePrefix === '/') return 1;
    if (b.routePrefix === '/') return -1;
    return b.routePrefix.length - a.routePrefix.length;
  });

  // Separate static/SPA services from serverless function services
  const staticServices: typeof sortedWebServices = [];
  const functionServices: typeof sortedWebServices = [];

  for (const service of sortedWebServices) {
    if (service.isStaticBuild) {
      staticServices.push(service);
    } else {
      functionServices.push(service);
    }
  }

  // Generate routes for serverless function services
  for (const service of functionServices) {
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

  // Generate routes for static/SPA services
  // Static services need SPA fallback to index.html after filesystem routing.
  // The rewriteRoutes are placed in the filesystem phase by detectBuilders,
  // so they act as fallbacks after static files are checked.
  for (const service of staticServices) {
    const { routePrefix } = service;

    if (routePrefix === '/') {
      // Root static service: SPA fallback after filesystem routing
      // Files are served from the root static directory
      defaults.push({
        handle: 'filesystem',
      });
      // SPA fallback: serve index.html for all unmatched routes
      defaults.push({
        src: '/(.*)',
        dest: '/index.html',
      });
    } else {
      // Prefixed static service: SPA fallback for the prefix
      // Files are mounted at /{prefix}/* by the builder (e.g., admin/index.html)
      // Filesystem routing serves static files first, then this fallback catches SPA routes
      const normalizedPrefix = routePrefix.startsWith('/')
        ? routePrefix.slice(1)
        : routePrefix;

      // SPA fallback: if no static file matches under this prefix, serve its index.html
      // This enables client-side routing for SPAs mounted at a prefix
      rewrites.push({
        src: `^/${normalizedPrefix}(?:/.*)?$`,
        dest: `/${normalizedPrefix}/index.html`,
      });
    }
  }

  return { rewrites, defaults, crons, workers };
}
