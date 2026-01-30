import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
} from './types';
import { readVercelConfig } from './utils';
import { resolveAllConfiguredServices } from './resolve';
import { autoDetectServices } from './auto-detect';

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

  // Try auto-detection
  if (!hasConfiguredServices) {
    const autoResult = await autoDetectServices({ fs: scopedFs });

    if (autoResult.errors.length > 0) {
      return {
        services: [],
        routes: { rewrites: [], defaults: [], crons: [], workers: [] },
        errors: autoResult.errors,
        warnings: [],
      };
    }

    if (autoResult.services) {
      const result = resolveAllConfiguredServices(autoResult.services);
      const routes = generateServicesRoutes(result.services);
      return {
        services: result.services,
        routes,
        errors: result.errors,
        warnings: [],
      };
    }

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

  for (const service of sortedWebServices) {
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
      // Root service: catch-all route
      defaults.push({
        src: '^/(.*)$',
        dest: functionPath,
        check: true,
      });
    } else {
      // Non-root service: prefix-based rewrite
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
