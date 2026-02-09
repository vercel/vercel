import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServicesRoutes,
  ServiceDetectionError,
} from './types';
import {
  isStaticBuild,
  readVercelConfig,
  getFrameworkDefaultRoutes,
  frameworkSupportsPrefixMount,
  getPrefixedSpaRoutes,
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
      const result = resolveAllConfiguredServices(autoResult.services);
      const { routes, errors: routeErrors } = await generateServicesRoutes(
        result.services
      );
      return {
        services: result.services,
        routes,
        errors: [...result.errors, ...routeErrors],
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
  const { routes, errors: routeErrors } = await generateServicesRoutes(
    result.services
  );

  return {
    services: result.services,
    routes,
    errors: [...result.errors, ...routeErrors],
    warnings: [],
  };
}

interface GenerateRoutesResult {
  routes: ServicesRoutes;
  errors: ServiceDetectionError[];
}

/**
 * Generate routing rules for services.
 *
 * Routes are ordered by prefix length (longest first) to ensure more specific
 * routes match before broader ones. For example, `/api/users` must be checked
 * before `/api`, which must be checked before the catch-all `/`.
 *
 * - Static/SPA services at root: Use framework's defaultRoutes
 * - Static/SPA services at prefix: Use simple SPA fallback (if framework supports it)
 * - Serverless services: Rewrite to the function entrypoint
 * - Cron/Worker services: TODO - internal routes under `/_svc/`
 */
export async function generateServicesRoutes(
  services: ResolvedService[]
): Promise<GenerateRoutesResult> {
  const rewrites: Route[] = [];
  const defaults: Route[] = [];
  const crons: Route[] = [];
  const workers: Route[] = [];
  const errors: ServiceDetectionError[] = [];

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

    if (isStaticBuild(service)) {
      if (routePrefix === '/') {
        // Root static service: use framework's full defaultRoutes
        const frameworkRoutes = await getFrameworkDefaultRoutes(
          service.framework
        );
        defaults.push(...frameworkRoutes);
      } else {
        // Prefixed static service: check if framework supports prefix mounting
        if (!frameworkSupportsPrefixMount(service.framework)) {
          errors.push({
            code: 'FRAMEWORK_PREFIX_NOT_SUPPORTED',
            message:
              `Framework "${service.framework}" cannot be mounted at prefix "${routePrefix}". ` +
              `Frameworks with custom routing (like "${service.framework}") must use routePrefix: "/"`,
            serviceName: service.name,
          });
          continue;
        }
        // Framework supports prefix: use simple SPA fallback
        const prefixedRoutes = getPrefixedSpaRoutes(normalizedPrefix);
        rewrites.push(...prefixedRoutes);
      }
    } else {
      // Function service: rewrite to the function entrypoint
      // `check: true` verifies the destination exists before applying the route
      const builderSrc = service.builder.src || routePrefix;
      const functionPath = builderSrc.startsWith('/')
        ? builderSrc
        : `/${builderSrc}`;

      if (routePrefix === '/') {
        defaults.push({ src: '^/(.*)$', dest: functionPath, check: true });
      } else {
        rewrites.push({
          src: `^/${normalizedPrefix}(?:/.*)?$`,
          dest: functionPath,
          check: true,
        });
      }
    }
  }

  return { routes: { rewrites, defaults, crons, workers }, errors };
}
