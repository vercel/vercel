import type { HasField, Route } from '@vercel/routing-utils';
import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import {
  type DetectServicesOptions,
  type DetectServicesResult,
  type Service,
  type ServicesRoutes,
} from './types';
import {
  getInternalServiceCronPath,
  getInternalServiceFunctionPath,
  getInternalServiceWorkerPath,
  isRouteOwningBuilder,
  isStaticBuild,
  readVercelConfig,
} from './utils';
import { resolveAllConfiguredServices } from './resolve';
import { autoDetectServices } from './auto-detect';

// don't apply subdomain rewrites on preview urls
const PREVIEW_DOMAIN_MISSING: HasField = [
  { type: 'host', value: { suf: '.vercel.app' } },
  { type: 'host', value: { suf: '.vercel.dev' } },
];

/**
 * Detect and resolve services within a project.
 *
 * Reads vercel.json and resolves `experimentalServices` into Service objects.
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
      source: 'configured',
      routes: {
        hostRewrites: [],
        rewrites: [],
        defaults: [],
        crons: [],
        workers: [],
      },
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
        source: 'auto-detected',
        routes: {
          hostRewrites: [],
          rewrites: [],
          defaults: [],
          crons: [],
          workers: [],
        },
        errors: autoResult.errors,
        warnings: [],
      };
    }

    if (autoResult.services) {
      const result = await resolveAllConfiguredServices(
        autoResult.services,
        scopedFs,
        'generated'
      );
      const routes = generateServicesRoutes(result.services);
      return {
        services: result.services,
        source: 'auto-detected',
        routes,
        errors: result.errors,
        warnings: [],
      };
    }

    return {
      services: [],
      source: 'auto-detected',
      routes: {
        hostRewrites: [],
        rewrites: [],
        defaults: [],
        crons: [],
        workers: [],
      },
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
    scopedFs,
    'configured'
  );

  // Generate routes
  const routes = generateServicesRoutes(result.services);

  return {
    services: result.services,
    source: 'configured',
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
 * - Worker services:
 *   Internal queue callback routes under `/_svc/{serviceName}/workers/{entry}/{handler}`
 *   that rewrite to `/_svc/{serviceName}/index`.
 *
 * - Cron services:
 *   Internal cron callback routes under `/_svc/{serviceName}/crons/{entry}/{handler}`
 *   that rewrite to `/_svc/{serviceName}/index`.
 */
export function generateServicesRoutes(services: Service[]): ServicesRoutes {
  const hostRewrites: Route[] = [];
  const rewrites: Route[] = [];
  const defaults: Route[] = [];
  const crons: Route[] = [];
  const workers: Route[] = [];

  // Filter and sort web services by prefix length (longest first)
  // so more specific routes match before broader ones.
  const sortedWebServices = services
    .filter(
      (s): s is Service & { routePrefix: string } =>
        s.type === 'web' && typeof s.routePrefix === 'string'
    )
    .sort((a, b) => b.routePrefix.length - a.routePrefix.length);

  const allWebPrefixes = getWebRoutePrefixes(sortedWebServices);
  const explicitHostPrefixGuard =
    getExplicitHostPrefixNegativeLookahead(allWebPrefixes);

  for (const service of sortedWebServices) {
    const { routePrefix } = service;
    const normalizedPrefix = routePrefix.slice(1); // Strip leading /
    const ownershipGuard = getOwnershipGuard(routePrefix, allWebPrefixes);
    const hostCondition = getHostCondition(service);

    if (hostCondition && routePrefix !== '/') {
      const normalizedRoutePrefix = normalizeRoutePrefix(routePrefix);
      hostRewrites.push({
        src: '^/$',
        dest: normalizedRoutePrefix,
        has: hostCondition,
        missing: PREVIEW_DOMAIN_MISSING,
        check: true,
      });
      hostRewrites.push({
        // Preserve explicit service prefixes so canonical paths like /_/api
        // keep routing to their target service even on another service's host.
        src: `^/${explicitHostPrefixGuard}(.*)$`,
        dest: `${normalizedRoutePrefix}/$1`,
        has: hostCondition,
        missing: PREVIEW_DOMAIN_MISSING,
        check: true,
      });
    }

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
    }
  }

  const workerServices = services.filter(s => s.type === 'worker');
  for (const service of workerServices) {
    const workerEntrypoint =
      service.entrypoint || service.builder.src || 'index';
    const workerPath = getInternalServiceWorkerPath(
      service.name,
      workerEntrypoint
    );
    const functionPath = getInternalServiceFunctionPath(service.name);
    workers.push({
      src: `^${escapeRegex(workerPath)}$`,
      dest: functionPath,
      check: true,
    });
  }

  const cronServices = services.filter(s => s.type === 'cron');
  for (const service of cronServices) {
    const cronEntrypoint = service.entrypoint || service.builder.src || 'index';
    const cronPath = getInternalServiceCronPath(
      service.name,
      cronEntrypoint,
      service.handlerFunction || 'cron'
    );
    const functionPath = getInternalServiceFunctionPath(service.name);
    crons.push({
      src: `^${escapeRegex(cronPath)}$`,
      dest: functionPath,
      check: true,
    });
  }
  return { hostRewrites, rewrites, defaults, crons, workers };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWebRoutePrefixes(services: Service[]): string[] {
  const unique = new Set<string>();
  for (const service of services) {
    if (service.type !== 'web' || typeof service.routePrefix !== 'string') {
      continue;
    }
    unique.add(normalizeRoutePrefix(service.routePrefix));
  }
  return Array.from(unique);
}

function getExplicitHostPrefixNegativeLookahead(
  routePrefixes: string[]
): string {
  const explicitPrefixes = routePrefixes
    .map(normalizeRoutePrefix)
    .filter(prefix => prefix !== '/')
    .sort((a, b) => b.length - a.length)
    .map(prefix => escapeRegex(prefix.slice(1)));

  if (explicitPrefixes.length === 0) {
    return '';
  }

  if (explicitPrefixes.length === 1) {
    return `(?!${explicitPrefixes[0]}(?:/|$))`;
  }

  return `(?!(?:${explicitPrefixes.join('|')})(?:/|$))`;
}

function getHostCondition(service: Service): HasField | undefined {
  if (service.type !== 'web') {
    return undefined;
  }
  if (typeof service.subdomain === 'string' && service.subdomain.length > 0) {
    return [{ type: 'host', value: { pre: `${service.subdomain}.` } }];
  }
  return undefined;
}
