import type { Route } from '@vercel/routing-utils';
import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import {
  type DetectServicesOptions,
  type DetectServicesResult,
  type ResolvedService,
  type ServicesRoutes,
} from './types';
import {
  getInternalServiceFunctionPath,
  isRouteOwningBuilder,
  isStaticBuild,
  readVercelConfig,
} from './utils';
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
      const result = await resolveAllConfiguredServices(
        autoResult.services,
        scopedFs
      );
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
  const result = await resolveAllConfiguredServices(
    configuredServices,
    scopedFs
  );

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
 * Services routing only generates *synthetic* routes for builders that do not
 * provide their own route tables:
 *
 * - **Static/SPA services** (`@vercel/static-build`, `@vercel/static`):
 *   SPA fallback routes to index.html under the service prefix.
 *
 * - **Runtime services** (`@vercel/python`, `@vercel/go`, `@vercel/ruby`, etc.):
 *   Prefix rewrites to an internal runtime destination (`/_svc/{name}/index`)
 *   with `check: true`.
 *
 * Builders that provide their own routing (`@vercel/next`, `@vercel/backends`,
 * Build Output API builders, etc.) are not given synthetic routes here.
 *
 * - Cron/Worker services: TODO - internal routes under `/_svc/`
 */
export function generateServicesRoutes(
  services: ResolvedService[]
): ServicesRoutes {
  const rewrites: Route[] = [];
  const defaults: Route[] = [];
  const crons: Route[] = [];
  const workers: Route[] = [];

  // Filter and sort web services by prefix length (longest first)
  // so more specific routes match before broader ones.
  const sortedWebServices = services
    .filter(
      (s): s is ResolvedService & { routePrefix: string } =>
        s.type === 'web' && typeof s.routePrefix === 'string'
    )
    .sort((a, b) => b.routePrefix.length - a.routePrefix.length);

  const allWebPrefixes = getWebRoutePrefixes(sortedWebServices);

  for (const service of sortedWebServices) {
    const { routePrefix } = service;
    const normalizedPrefix = routePrefix.slice(1); // Strip leading /
    const ownershipGuard = getOwnershipGuard(routePrefix, allWebPrefixes);

    // Route-owning builders (e.g., Next.js, @vercel/backends) produce their
    // own route tables. Skip synthetic route generation for them.
    if (isRouteOwningBuilder(service)) {
      continue;
    }

    if (isStaticBuild(service)) {
      // Static/SPA service: serve index.html for client-side routing
      if (routePrefix === '/') {
        defaults.push({ handle: 'filesystem' });
        defaults.push({
          src: scopeRouteSourceToOwnership('/(.*)', ownershipGuard),
          dest: '/index.html',
        });
      } else {
        rewrites.push({
          src: scopeRouteSourceToOwnership(
            `^/${normalizedPrefix}(?:/.*)?$`,
            ownershipGuard
          ),
          dest: `/${normalizedPrefix}/index.html`,
        });
      }
    } else if (service.runtime) {
      // Function service: rewrite to internal function namespace
      // `check: true` verifies the destination exists before applying the route
      const functionPath = getInternalServiceFunctionPath(service.name);

      if (routePrefix === '/') {
        defaults.push({
          src: scopeRouteSourceToOwnership('^/(.*)$', ownershipGuard),
          dest: functionPath,
          check: true,
        });
      } else {
        rewrites.push({
          src: scopeRouteSourceToOwnership(
            `^/${normalizedPrefix}(?:/.*)?$`,
            ownershipGuard
          ),
          dest: functionPath,
          check: true,
        });
      }
    } else {
      // Non-static services without an inferred runtime are expected to provide
      // their own routing (Next.js, @vercel/backends, Build Output API builders, etc.).
      continue;
    }
  }

  return { rewrites, defaults, crons, workers };
}

function getWebRoutePrefixes(services: ResolvedService[]): string[] {
  const unique = new Set<string>();
  for (const service of services) {
    if (service.type !== 'web' || typeof service.routePrefix !== 'string') {
      continue;
    }
    unique.add(normalizeRoutePrefix(service.routePrefix));
  }
  return Array.from(unique);
}
