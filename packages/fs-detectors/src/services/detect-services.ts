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
  // Root services ("/") go last as the catch-all fallback.
  const sortServices = <T extends { routePrefix: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) => {
      if (a.routePrefix === '/') return 1;
      if (b.routePrefix === '/') return -1;
      return b.routePrefix.length - a.routePrefix.length;
    });

  const sortedFunctionServices = sortServices(functionServices);
  const sortedStaticServices = sortServices(staticServices);

  // Collect all non-root prefixes for exclusion patterns
  // When a root service (/) exists alongside other services, its catch-all
  // must exclude paths that belong to other services
  const nonRootPrefixes = webServices
    .filter(s => s.routePrefix !== '/')
    .map(s =>
      s.routePrefix.startsWith('/') ? s.routePrefix.slice(1) : s.routePrefix
    );

  // Generate SPA fallback routes for static services FIRST
  // These must come before function service catch-alls so that
  // /admin/something routes to /admin/index.html, not to the root function
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
      // Root function service: catch-all route that excludes other service prefixes
      // This ensures /admin/* goes to the admin service, not the root function
      let srcPattern: string;
      if (nonRootPrefixes.length > 0) {
        // Negative lookahead to exclude other service prefixes
        const exclusionPattern = nonRootPrefixes
          .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('|');
        srcPattern = `^/(?!(?:${exclusionPattern})(?:/|$))(.*)$`;
      } else {
        srcPattern = '^/(.*)$';
      }
      defaults.push({
        src: srcPattern,
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

  return { rewrites, defaults, crons, workers };
}
