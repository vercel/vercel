import type { HasField, Route } from '@vercel/routing-utils';
import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import {
  type DetectServicesOptions,
  type DetectServicesResult,
  type BuildableServicesResult,
  type InferredServicesResult,
  type ResolvedServicesResult,
  type Service,
  type ServicesConfig,
  type ServicesRoutes,
} from './types';
import type { DetectorFilesystem } from '../detectors/filesystem';
import {
  getInternalServiceCronPath,
  getInternalServiceFunctionPath,
  getInternalServiceWorkerPath,
  inferServiceRuntime,
  isFrontendFramework,
  isRouteOwningBuilder,
  isStaticBuild,
  readVercelConfig,
} from './utils';
import { resolveAllConfiguredServices } from './resolve';
import { autoDetectServices } from './auto-detect';
import { detectRailwayServices } from './detect-railway';

// don't apply subdomain rewrites on preview urls
const PREVIEW_DOMAIN_MISSING: HasField = [
  { type: 'host', value: { suf: '.vercel.app' } },
  { type: 'host', value: { suf: '.vercel.dev' } },
];

function emptyRoutes(): ServicesRoutes {
  return {
    hostRewrites: [],
    rewrites: [],
    defaults: [],
    crons: [],
    workers: [],
  };
}

function withResolvedResult(
  resolved: ResolvedServicesResult
): DetectServicesResult {
  return {
    resolved,
    inferred: null,
  };
}

function withInferredResult(
  inferred: InferredServicesResult
): DetectServicesResult {
  return {
    resolved: null,
    inferred,
  };
}

/*
 * This lets us define the conventions of how we'd like the services configuration
 * to look like.
 */
function toInferredLayoutConfig(services: ServicesConfig): ServicesConfig {
  const inferredConfig: ServicesConfig = {};

  for (const [name, service] of Object.entries(services)) {
    const serviceConfig: ServicesConfig[string] = {};

    if (typeof service.entrypoint === 'string') {
      serviceConfig.entrypoint = service.entrypoint;
    }

    if (typeof service.routePrefix === 'string') {
      serviceConfig.routePrefix = service.routePrefix;
    }

    // Keep the framework setting only for frontend services
    if (isFrontendFramework(service.framework)) {
      serviceConfig.framework = service.framework;
    }

    if (typeof service.buildCommand === 'string') {
      serviceConfig.buildCommand = service.buildCommand;
    }

    inferredConfig[name] = serviceConfig;
  }

  return inferredConfig;
}

function toInferredLayoutServices(
  services: ServicesConfig
): InferredServicesResult['services'] {
  return Object.entries(services).map(([name, service]) => {
    const workerTopics = (service as { topics?: string[] }).topics;
    const consumer = (service as { consumer?: string }).consumer;

    return {
      name,
      type: service.type || 'web',
      workspace:
        typeof service.entrypoint === 'string' ? service.entrypoint : '.',
      entrypoint:
        typeof service.entrypoint === 'string' ? service.entrypoint : undefined,
      framework:
        typeof service.framework === 'string' ? service.framework : undefined,
      runtime: inferServiceRuntime({
        runtime: service.runtime,
        framework: service.framework,
        builder: service.builder,
        entrypoint: service.entrypoint,
      }),
      routePrefix:
        typeof service.routePrefix === 'string'
          ? service.routePrefix
          : undefined,
      schedule:
        typeof service.schedule === 'string' ? service.schedule : undefined,
      topics: Array.isArray(workerTopics) ? workerTopics : undefined,
      consumer: typeof consumer === 'string' ? consumer : undefined,
    };
  });
}

export function isExperimentalInferredServicesEnabled(
  value = process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES
): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export async function resolveBuildableServices(options: {
  detection: DetectServicesResult;
  fs: DetectorFilesystem;
  useInferred?: boolean;
}): Promise<BuildableServicesResult | null> {
  const { detection, fs, useInferred = false } = options;

  if (detection.resolved) {
    return detection.resolved;
  }

  if (!useInferred || !detection.inferred) {
    return null;
  }

  const inferred = detection.inferred;

  if (inferred.errors.length > 0 || inferred.services.length === 0) {
    return {
      source: 'inferred',
      services: [],
      routes: emptyRoutes(),
      errors: inferred.errors,
      warnings: inferred.warnings,
    };
  }

  const result = await resolveAllConfiguredServices(
    inferred.config,
    fs,
    'generated'
  );

  return {
    source: 'inferred',
    services: result.services,
    routes: generateServicesRoutes(result.services),
    errors: result.errors,
    warnings: inferred.warnings,
  };
}

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
    return withResolvedResult({
      services: [],
      source: 'configured',
      routes: emptyRoutes(),
      errors: [configError],
      warnings: [],
    });
  }

  const configuredServices = vercelConfig?.experimentalServices;
  const hasConfiguredServices =
    configuredServices && Object.keys(configuredServices).length > 0;

  if (hasConfiguredServices) {
    const result = await resolveAllConfiguredServices(
      configuredServices,
      scopedFs,
      'configured'
    );
    const routes = generateServicesRoutes(result.services);

    return withResolvedResult({
      services: result.services,
      source: 'configured',
      routes,
      errors: result.errors,
      warnings: [],
    });
  }

  const railwayResult = await detectRailwayServices({ fs: scopedFs });

  if (railwayResult.errors.length > 0) {
    return withInferredResult({
      source: 'railway',
      config: {},
      services: [],
      errors: railwayResult.errors,
      warnings: railwayResult.warnings,
    });
  }

  if (railwayResult.services) {
    const result = await resolveAllConfiguredServices(
      railwayResult.services,
      scopedFs,
      'generated'
    );

    return withInferredResult({
      source: 'railway',
      config: toInferredLayoutConfig(railwayResult.services),
      services:
        result.errors.length === 0
          ? toInferredLayoutServices(railwayResult.services)
          : [],
      errors: result.errors,
      warnings: railwayResult.warnings,
    });
  }

  const autoResult = await autoDetectServices({ fs: scopedFs });

  if (autoResult.warnings.length > 0) {
    return withInferredResult({
      source: 'layout',
      config: {},
      services: [],
      errors: [],
      warnings: autoResult.warnings,
    });
  }

  if (!autoResult.services) {
    return withInferredResult({
      source: 'layout',
      config: {},
      services: [],
      errors: [],
      warnings: [
        {
          code: 'NO_SERVICES_CONFIGURED',
          message:
            'No services configured. Add `experimentalServices` to vercel.json.',
        },
      ],
    });
  }

  const result = await resolveAllConfiguredServices(
    autoResult.services,
    scopedFs,
    'generated'
  );

  return withInferredResult({
    source: 'layout',
    config: toInferredLayoutConfig(autoResult.services),
    services:
      result.errors.length === 0
        ? toInferredLayoutServices(autoResult.services)
        : [],
    errors: result.errors,
    warnings: [],
  });
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
