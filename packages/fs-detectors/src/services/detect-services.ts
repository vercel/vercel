import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
} from './types';
import { readVercelConfig } from './utils';
import { resolveAllConfiguredServices } from './resolve-configured';

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
      routes: { rewrites: [], defaults: [] },
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
      routes: { rewrites: [], defaults: [] },
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
 */
export function generateServicesRoutes(
  services: ResolvedService[]
): ServicesRoutes {
  const rewrites: Route[] = [];
  const defaults: Route[] = [];

  // Sort by prefix length (longest first) so specific routes match before broad ones.
  // Root services ("/") go last as the catch-all fallback.
  const sortedServices = [...services].sort((a, b) => {
    // Root prefix should come last
    if (a.routePrefix === '/') return 1;
    if (b.routePrefix === '/') return -1;
    // Otherwise sort by length (longest first)
    return b.routePrefix.length - a.routePrefix.length;
  });

  for (const service of sortedServices) {
    const { routePrefix } = service;

    // TODO: implement worker and cron routing next
    if (service.type === 'worker' || service.type === 'cron') {
      continue;
    }

    // Web services
    if (routePrefix === '/') {
      // Root service: catch-all route
      defaults.push({
        src: '^/(.*)$',
        dest: '/',
        check: true,
      });
    } else {
      // Non-root service: prefix-based rewrite
      const normalizedPrefix = routePrefix.startsWith('/')
        ? routePrefix.slice(1)
        : routePrefix;
      rewrites.push({
        src: `^/${normalizedPrefix}(?:/.*)?$`,
        dest: routePrefix,
        check: true,
      });
    }
  }

  return { rewrites, defaults };
}
