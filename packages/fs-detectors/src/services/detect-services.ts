import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
} from './types';
import { ENTRYPOINT_EXTENSIONS } from './types';
import { isRouteOwningBuilder, isStaticBuild, readVercelConfig } from './utils';
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
 *   Prefix rewrites to the function entrypoint with `check: true`.
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

  // Sort longest extension first so `.mts` is preferred over `.ts`, etc.
  // (".mts".endsWith(".ts") is true, so order matters.)
  const entrypointExtensions = Object.keys(ENTRYPOINT_EXTENSIONS).sort(
    (a, b) => b.length - a.length
  );
  const stripEntrypointExtension = (entrypoint: string): string => {
    for (const ext of entrypointExtensions) {
      if (entrypoint.endsWith(ext)) {
        return entrypoint.slice(0, -ext.length);
      }
    }
    return entrypoint;
  };

  // Filter and sort web services by prefix length (longest first)
  // so more specific routes match before broader ones.
  const sortedWebServices = services
    .filter(
      (s): s is ResolvedService & { routePrefix: string } =>
        s.type === 'web' && typeof s.routePrefix === 'string'
    )
    .sort((a, b) => b.routePrefix.length - a.routePrefix.length);

  for (const service of sortedWebServices) {
    const { routePrefix } = service;
    const normalizedPrefix = routePrefix.slice(1); // Strip leading /

    // Route-owning builders (e.g., Next.js, @vercel/backends) produce their
    // own route tables. Skip synthetic route generation for them.
    if (isRouteOwningBuilder(service)) {
      continue;
    }

    if (isStaticBuild(service)) {
      // Static/SPA service: serve index.html for client-side routing
      if (routePrefix === '/') {
        defaults.push({ handle: 'filesystem' });
        defaults.push({ src: '/(.*)', dest: '/index.html' });
      } else {
        rewrites.push({
          src: `^/${normalizedPrefix}(?:/.*)?$`,
          dest: `/${normalizedPrefix}/index.html`,
        });
      }
    } else if (service.runtime) {
      // Function service: rewrite to the function entrypoint
      // `check: true` verifies the destination exists before applying the route
      const builderSrc = service.builder.src || routePrefix;
      // Match the v3 runtime output naming convention: extensionless function paths.
      // For example, "api/index.ts" → "/api/index".
      const extensionless = stripEntrypointExtension(builderSrc);
      let functionPath = extensionless.startsWith('/')
        ? extensionless
        : `/${extensionless}`;

      // Avoid collisions with route-owning root services (for example Next.js at "/")
      // when a non-root runtime defaults to "index.*" at the repo root.
      // In that case, rewriting to "/index" can be claimed by the root service.
      if (routePrefix !== '/' && functionPath === '/index') {
        functionPath = routePrefix;
      }

      if (routePrefix === '/') {
        defaults.push({ src: '^/(.*)$', dest: functionPath, check: true });
      } else {
        rewrites.push({
          src: `^/${normalizedPrefix}(?:/.*)?$`,
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
