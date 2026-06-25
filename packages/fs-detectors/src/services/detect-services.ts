import type { HasField, Rewrite, Route } from '@vercel/routing-utils';
import {
  isScheduleTriggeredService,
  isExperimentalService,
} from '@vercel/build-utils';
import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import type {
  DetectEntrypointFn,
  DetectServicesOptions,
  DetectServicesResult,
  ExperimentalServices,
  Services,
  ExperimentalService,
  InferredServicesConfig,
  InferredServicesResult,
  ResolvedServicesResult,
  Service,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ServicesRoutes,
} from './types';
import {
  getInternalServiceCronPathPrefix,
  getInternalServiceFunctionPath,
  isFrontendFramework,
  isRouteOwningBuilder,
  isStaticBuild,
  readVercelConfig,
} from './utils';
import type { DetectorFilesystem } from '../detectors/filesystem';
import { resolveAllConfiguredServices } from './resolve';
import { resolveAllConfiguredServicesV2 } from './resolve-v2';
import { autoDetectServices } from './auto-detect';
import { detectRailwayServices } from './detect-railway';
import { detectRenderServices } from './detect-render';
import { detectProcfileServices } from './detect-procfile';

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
    fallbacks: [],
    crons: [],
    workers: [],
  };
}

function withResolvedResult(
  resolved: ResolvedServicesResult,
  inferred: InferredServicesResult | null = null
): DetectServicesResult {
  return {
    services: resolved.services,
    source: resolved.source,
    useImplicitEnvInjection: resolved.useImplicitEnvInjection,
    routes: resolved.routes,
    rewrites: resolved.rewrites,
    errors: resolved.errors,
    warnings: resolved.warnings,
    resolved,
    inferred,
  };
}

/*
 * This lets us define the conventions of how we'd like the services configuration
 * to look like.
 */
function toInferredLayoutConfig(
  services: InferredServicesConfig
): InferredServicesConfig {
  const inferredConfig: InferredServicesConfig = {};

  for (const [name, service] of Object.entries(services)) {
    const serviceConfig: InferredServicesConfig[string] = {
      root: service.root,
    };

    if (service.type) {
      serviceConfig.type = service.type;
    }

    if (typeof service.entrypoint === 'string') {
      serviceConfig.entrypoint = service.entrypoint;
    }

    if (typeof service.mountPath === 'string') {
      serviceConfig.mountPath = service.mountPath;
    }

    // Keep the framework setting only for frontend services
    if (isFrontendFramework(service.framework)) {
      serviceConfig.framework = service.framework;
    }

    if (typeof service.buildCommand === 'string') {
      serviceConfig.buildCommand = service.buildCommand;
    }

    if (typeof service.runtime === 'string') {
      serviceConfig.runtime = service.runtime;
    }

    inferredConfig[name] = serviceConfig;
  }

  return inferredConfig;
}

interface PlatformDetectResult {
  services: InferredServicesConfig | null;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

/**
 * Detect and resolve services within a project.
 *
 * Reads vercel.json and resolves configured services into Service objects.
 * Returns an error if no services are configured.
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const {
    fs,
    workPath,
    detectEntrypoint,
    configuredServices: providedConfiguredServices,
    configuredServicesType: providedConfiguredServicesType,
  } = options;

  // Scope filesystem to workPath if provided
  const scopedFs = workPath ? fs.chdir(workPath) : fs;

  // Read vercel.json
  const { config: vercelConfig, error: configError } =
    await readVercelConfig(scopedFs);

  if (configError) {
    return withResolvedResult({
      services: [],
      source: 'configured',
      useImplicitEnvInjection: true,
      routes: emptyRoutes(),
      rewrites: [],
      errors: [configError],
      warnings: [],
    });
  }

  if (
    vercelConfig?.services != null &&
    vercelConfig.experimentalServicesV2 != null
  ) {
    return withResolvedResult({
      services: [],
      source: 'configured',
      useImplicitEnvInjection: false,
      routes: emptyRoutes(),
      rewrites: [],
      errors: [
        {
          code: 'SERVICES_AND_EXPERIMENTAL_SERVICES_V2',
          message:
            'The `services` property cannot be used in conjunction with its deprecated alias `experimentalServicesV2`. Please use only `services`.',
        },
      ],
      warnings: [],
    });
  }

  const hasProvidedConfiguredServices =
    providedConfiguredServices &&
    Object.keys(providedConfiguredServices).length > 0;

  // `services` dispatch (`experimentalServicesV2` is a deprecated alias).
  const experimentalServicesV2 =
    hasProvidedConfiguredServices &&
    (providedConfiguredServicesType === 'services' ||
      providedConfiguredServicesType === 'experimentalServicesV2')
      ? (providedConfiguredServices as Services)
      : hasProvidedConfiguredServices
        ? undefined
        : (vercelConfig?.services ?? vercelConfig?.experimentalServicesV2);
  if (
    experimentalServicesV2 &&
    Object.keys(experimentalServicesV2).length > 0
  ) {
    const result = await resolveAllConfiguredServicesV2(
      experimentalServicesV2,
      scopedFs
    );
    return withResolvedResult({
      services: result.services,
      source: 'configured',
      // V2 uses explicit `bindings`, so no implicit `{NAME}_URL` injection.
      useImplicitEnvInjection: false,
      // V2 routes are explicitly carried per-service to output them separately.
      routes: emptyRoutes(),
      rewrites: [],
      errors: result.errors,
      warnings: [],
    });
  }

  // V1 explicit config (experimentalServices)
  const experimentalServicesV1 = hasProvidedConfiguredServices
    ? (providedConfiguredServices as ExperimentalServices)
    : vercelConfig?.experimentalServices;
  const hasExperimentalServicesV1 =
    experimentalServicesV1 && Object.keys(experimentalServicesV1).length > 0;

  if (hasExperimentalServicesV1) {
    const result = await resolveAllConfiguredServices(
      experimentalServicesV1,
      scopedFs,
      'configured'
    );
    const routes = generateServicesRoutes(result.services);

    return withResolvedResult({
      services: result.services,
      source: 'configured',
      // experimentalServices uses the legacy `{NAME}_URL` injection.
      useImplicitEnvInjection: true,
      routes,
      rewrites: [],
      errors: result.errors,
      warnings: [],
    });
  }

  // No explicit config — try auto-detection.
  // Priority: Railway > Render > Procfile > blessed layouts.
  // Any hard error (.errors) from detection will result into
  // exit from detection and return of the error
  // back to the user
  const detectors: Array<{
    detect: (options: {
      fs: DetectorFilesystem;
      detectEntrypoint?: DetectEntrypointFn;
    }) => Promise<PlatformDetectResult>;
    source: InferredServicesResult['source'];
  }> = [
    { detect: detectRailwayServices, source: 'railway' },
    { detect: detectRenderServices, source: 'render' },
    { detect: detectProcfileServices, source: 'procfile' },
    { detect: autoDetectServices, source: 'layout' },
  ];

  for (const { detect, source } of detectors) {
    const detectResult = await detect({ fs: scopedFs, detectEntrypoint });
    const match = await tryResolveInferred(detectResult, source, scopedFs);
    if (match) return match;
  }

  return withResolvedResult({
    services: [],
    source: 'auto-detected',
    useImplicitEnvInjection: true,
    routes: emptyRoutes(),
    rewrites: [],
    errors: [
      {
        code: 'NO_EXPERIMENTAL_SERVICES_CONFIGURED',
        message:
          'No services configured. Add `experimentalServices` to vercel.json.',
      },
    ],
    warnings: [],
  });
}

/**
 * Try to resolve a platform detect result into a DetectServicesResult.
 *
 * Returns a result if the detector matched (found services or had errors),
 * or null to signal the caller should try the next detector.
 *
 * Railway and Render are suggestion-only:
 * they populate `inferred` for the CLI/UI to propose writing to vercel.json.
 *
 * Layout-based detection produces a real resolved output as well instead, because
 * it's based on our convention that we support. This is gated under a flag (env/feature)
 * but it's in use.
 */
async function tryResolveInferred(
  detectResult: PlatformDetectResult,
  source: InferredServicesResult['source'],
  scopedFs: DetectorFilesystem
): Promise<DetectServicesResult | null> {
  if (detectResult.errors.length > 0) {
    return withResolvedResult({
      services: [],
      source: 'auto-detected',
      useImplicitEnvInjection: source !== 'layout',
      routes: emptyRoutes(),
      rewrites: [],
      errors: detectResult.errors,
      warnings: detectResult.warnings,
    });
  }

  if (!detectResult.services) {
    return null;
  }

  // Layout auto-detect: resolve via V2 and produce resolved services
  // for immediate dev/build use.
  if (source === 'layout') {
    // Convert InferredServicesConfig to V2 Services for the resolver.
    const v2Services: Services = {};
    for (const [name, svc] of Object.entries(detectResult.services)) {
      v2Services[name] = {
        root: svc.root,
        ...(svc.framework ? { framework: svc.framework } : {}),
        ...(svc.entrypoint ? { entrypoint: svc.entrypoint } : {}),
      };
    }

    const result = await resolveAllConfiguredServicesV2(v2Services, scopedFs);

    // For layout-based detection we need to take care about a specific edgecase,
    // where we ensure that only 1 framework is mounted at the root and at the same
    // time we really have multi services layout. This will prevent triggering the
    // setup for of (root + backend) layout, when it's only really (root) with frontend.
    const rootServices = Object.values(detectResult.services).filter(
      svc => svc.mountPath === '/' && typeof svc.framework === 'string'
    );
    const shouldInfer =
      result.errors.length === 0 &&
      rootServices.length === 1 &&
      result.services.length > 1;

    const inferred: InferredServicesResult | null = shouldInfer
      ? {
          source,
          config: toInferredLayoutConfig(detectResult.services),
          services: result.services,
          warnings: detectResult.warnings,
        }
      : null;

    // Layout-based detection result can actually be used as is,
    // because the convention is controlled by us. So we produce "resolved"
    // result as well in addition to inferred
    return withResolvedResult(
      {
        services: shouldInfer ? result.services : [],
        source: 'auto-detected',
        useImplicitEnvInjection: false,
        routes: emptyRoutes(),
        rewrites: shouldInfer
          ? generateServiceRewrites(detectResult.services)
          : [],
        experimentalServicesV2: shouldInfer ? v2Services : undefined,
        errors: result.errors,
        warnings: detectResult.warnings,
      },
      inferred
    );
  }

  // Railway/Render/Procfile: resolve via V1 for shouldInfer check,
  // but only produce suggestion (no resolved services for immediate use).
  const v1Services: ExperimentalServices = {};
  for (const [name, svc] of Object.entries(detectResult.services)) {
    v1Services[name] = {
      root: svc.root === '.' ? undefined : svc.root,
      ...(svc.framework ? { framework: svc.framework } : {}),
      ...(svc.entrypoint ? { entrypoint: svc.entrypoint } : {}),
      ...(svc.type ? { type: svc.type } : {}),
      ...(svc.buildCommand ? { buildCommand: svc.buildCommand } : {}),
      ...(svc.preDeployCommand
        ? { preDeployCommand: svc.preDeployCommand }
        : {}),
      ...(svc.mountPath ? { routePrefix: svc.mountPath } : {}),
    };
  }

  const result = await resolveAllConfiguredServices(
    v1Services,
    scopedFs,
    'generated'
  );

  const shouldInfer = result.errors.length === 0 && result.services.length > 0;

  const inferred: InferredServicesResult | null = shouldInfer
    ? {
        source,
        config: toInferredLayoutConfig(detectResult.services),
        services: result.services,
        warnings: detectResult.warnings,
      }
    : null;

  return withResolvedResult(
    {
      services: [],
      source: 'auto-detected',
      useImplicitEnvInjection: true,
      routes: emptyRoutes(),
      rewrites: [],
      errors: result.errors,
      warnings: detectResult.warnings,
    },
    inferred
  );
}

/**
 * Generate top-level service-targeted rewrites from inferred mount paths.
 *
 * Produces `Rewrite` objects (same format as vercel.json `rewrites`) that
 * delegate public traffic into services based on their `mountPath`.
 *
 * Rewrites are ordered by mount path length (longest first) so more
 * specific paths match before broader ones. The root service (`/`) is
 * always last as a catch-all.
 */
export function generateServiceRewrites(
  services: InferredServicesConfig
): Rewrite[] {
  // Only web services get public HTTP rewrites. Non-web services (workers,
  // crons) are not publicly routable.
  const entries = Object.entries(services)
    .filter(
      ([, svc]) =>
        typeof svc.mountPath === 'string' && (!svc.type || svc.type === 'web')
    )
    .sort(([, a], [, b]) => b.mountPath!.length - a.mountPath!.length);

  return entries.map(([name, svc]) => {
    const mountPath = svc.mountPath!;
    if (mountPath === '/') {
      return {
        source: '/(.*)',
        destination: { type: 'service' as const, service: name },
      };
    }
    const prefix = mountPath.startsWith('/') ? mountPath.slice(1) : mountPath;
    return {
      source: `/${prefix}(/.*)?`,
      destination: { type: 'service' as const, service: name },
    };
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
 * - Worker and queue-triggered job services:
 *   Use private path routing. The generated function is not publicly accessible.
 *
 * - Schedule-triggered job services:
 *   Internal cron callback routes under `/_svc/{serviceName}/crons/{entry}/{handler}`
 *   that rewrite to `/_svc/{serviceName}/index`.
 */
export function generateServicesRoutes(allServices: Service[]): ServicesRoutes {
  // Route generation only applies to `experimentalServices`, V2 carries
  // its own per-service route tables to be applied later.
  const services = allServices.filter(isExperimentalService);

  const hostRewrites: Route[] = [];
  const rewrites: Route[] = [];
  const defaults: Route[] = [];
  const fallbacks: Route[] = [];
  const crons: Route[] = [];
  const workers: Route[] = [];

  // Filter and sort web services by prefix length (longest first)
  // so more specific routes match before broader ones.
  const sortedWebServices = services
    .filter(
      (s): s is ExperimentalService & { routePrefix: string } =>
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
        fallbacks.push({
          src: scopeRouteSourceToOwnership('/(.*)', ownershipGuard),
          dest: '/index.html',
        });
      } else {
        fallbacks.push({
          src: scopeRouteSourceToOwnership(
            `^/${normalizedPrefix}(?:/.*)?$`,
            ownershipGuard
          ),
          dest: `/${normalizedPrefix}/index.html`,
        });
      }
    } else if (service.runtime) {
      // Function service: rewrite to internal function namespace.
      // `check: true` verifies Lambda destinations exist before applying the route.
      // Container image functions are resolved via dynamic path metadata instead of
      // normal Lambda outputs, so `check` would incorrectly prevent the rewrite.
      const functionPath = getInternalServiceFunctionPath(service.name);
      const check = service.runtime === 'container' ? undefined : true;

      if (routePrefix === '/') {
        defaults.push({
          src: scopeRouteSourceToOwnership('^/(.*)$', ownershipGuard),
          dest: functionPath,
          ...(check ? { check } : {}),
        });
      } else {
        rewrites.push({
          src: scopeRouteSourceToOwnership(
            `^/${normalizedPrefix}(?:/.*)?$`,
            ownershipGuard
          ),
          dest: functionPath,
          ...(check ? { check } : {}),
        });
      }
    }
  }

  const cronServices = services.filter(isScheduleTriggeredService);
  for (const service of cronServices) {
    const cronPrefix = getInternalServiceCronPathPrefix(service.name);
    const functionPath = getInternalServiceFunctionPath(service.name);
    crons.push({
      src: `^${escapeRegex(cronPrefix)}/.*$`,
      dest: functionPath,
      check: true,
    });
  }

  return { hostRewrites, rewrites, defaults, fallbacks, crons, workers };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWebRoutePrefixes(services: ExperimentalService[]): string[] {
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

function getHostCondition(service: ExperimentalService): HasField | undefined {
  if (service.type !== 'web') {
    return undefined;
  }
  if (typeof service.subdomain === 'string' && service.subdomain.length > 0) {
    return [{ type: 'host', value: { pre: `${service.subdomain}.` } }];
  }
  return undefined;
}
