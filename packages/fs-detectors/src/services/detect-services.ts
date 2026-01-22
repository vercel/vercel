import type { Route } from '@vercel/routing-utils';
import type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  ServiceDetectionError,
  ServiceDetectionWarning,
  ServicesRoutes,
} from './types';
import { readVercelConfig } from './utils';
import { resolveAllConfiguredServices } from './resolve-configured';
import { autoDetectServices } from './auto-detection';
import frameworkList from '@vercel/frameworks';

/**
 * Detect and resolve services within a project.
 *
 * This is the main entry point for service detection. It:
 * 1. Reads vercel.json to check for configured services
 * 2. If `experimentalServices` exists, resolves those (configured)
 * 3. Otherwise, auto-detects from manifests and entrypoints (detected)
 * 4. Generates routing rules for the services
 */
export async function detectServices(
  options: DetectServicesOptions
): Promise<DetectServicesResult> {
  const { fs, workPath } = options;
  const frameworks = options.frameworkList || frameworkList;

  // Scope filesystem to workPath if provided
  const scopedFs = workPath ? fs.chdir(workPath) : fs;

  // Step 1: Read vercel.json
  const { config: vercelConfig, error: configError } =
    await readVercelConfig(scopedFs);

  if (configError) {
    return {
      services: [],
      source: 'configured',
      routes: { rewrites: [], defaults: [] },
      errors: [configError],
      warnings: [],
    };
  }

  const configuredServices = vercelConfig?.experimentalServices;
  const hasConfiguredServices =
    configuredServices && Object.keys(configuredServices).length > 0;

  // Step 2: Resolve services from the appropriate source
  let services: ResolvedService[];
  let errors: ServiceDetectionError[];
  let warnings: ServiceDetectionWarning[];

  if (hasConfiguredServices) {
    // Use explicitly configured services from vercel.json
    const result = resolveAllConfiguredServices(configuredServices);
    services = result.services;
    errors = result.errors;
    warnings = [];
  } else {
    // Auto-detect services from manifests and entrypoints
    const result = await autoDetectServices(scopedFs, frameworks);
    services = result.services;
    errors = result.errors;
    warnings = result.warnings;
  }

  // Step 3: Generate routes
  const routes = generateServicesRoutes(services);

  return {
    services,
    source: hasConfiguredServices ? 'configured' : 'detected',
    routes,
    errors,
    warnings,
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
