import type { Route } from '@vercel/routing-utils';
import type { ResolvedService } from './types';
import { isStaticBuild } from './utils';
import frameworkList from '@vercel/frameworks';

const frameworksBySlug = new Map(frameworkList.map(f => [f.slug, f]));

/**
 * Result shape from a builder's build() function.
 * We only need the routes for merging.
 */
export interface BuildResultWithRoutes {
  routes?: Route[];
}

/**
 * A builder entry with its source path and build result.
 */
export interface BuilderEntry {
  src: string;
  use: string;
  config?: {
    routePrefix?: string;
    framework?: string;
    [key: string]: unknown;
  };
  result: BuildResultWithRoutes;
}

export interface MergeServicesRoutesOptions {
  /**
   * Resolved services from detectServices
   */
  services: ResolvedService[];

  /**
   * Builder entries with their build results
   */
  builders: BuilderEntry[];
}

export interface MergeServicesRoutesResult {
  routes: Route[];
}

/**
 * Merge routes from all services into a single ordered route array.
 *
 * This function handles the complexity of combining:
 * 1. Routes from different builders (Next.js, static-build, etc.)
 * 2. SPA fallback routes for prefixed static services
 * 3. Function rewrites for API services
 *
 * The key insight is that:
 * - Prefixed service routes (like /admin/*, /docs/*) must come BEFORE
 *   any root catch-all route (like ^/(.*)$)
 * - The root catch-all should be modified to NOT match prefixed paths
 *
 * Route ordering:
 * 1. All routes with `continue: true` (headers, redirects, etc.)
 * 2. `handle: filesystem`
 * 3. Function service rewrites (with check: true)
 * 4. Prefixed static service fallbacks (SPA routes, 404 handlers)
 * 5. Root service catch-all (modified to exclude prefixed paths)
 * 6. Remaining routes (error handlers, etc.)
 */
export function mergeServicesRoutes(
  options: MergeServicesRoutesOptions
): MergeServicesRoutesResult {
  const { services, builders } = options;

  // Collect prefixed service paths for catch-all exclusion
  const prefixedPaths = services
    .filter(s => s.type === 'web' && s.routePrefix && s.routePrefix !== '/')
    .map(s => s.routePrefix!.replace(/^\//, '')); // strip leading /

  // Categorize routes into different phases
  const continueRoutes: Route[] = []; // Routes with continue: true (processed first)
  const handleFilesystem: Route[] = []; // The filesystem handle
  const functionRewrites: Route[] = []; // Function service rewrites
  const prefixedFallbacks: Route[] = []; // SPA fallbacks for prefixed services
  const rootCatchAll: Route[] = []; // Root service catch-all (modified)
  const otherRoutes: Route[] = []; // Everything else
  const handleRoutes: Route[] = []; // Other handle directives (resource, miss, etc.)
  const errorRoutes: Route[] = []; // Routes in error phase

  // Process each builder's routes
  for (const builder of builders) {
    const routes = builder.result.routes || [];
    const routePrefix = builder.config?.routePrefix;
    const isRootService =
      !routePrefix || routePrefix === '/' || routePrefix === '.';

    for (const route of routes) {
      // Handle directives
      if ('handle' in route) {
        if (route.handle === 'filesystem') {
          if (handleFilesystem.length === 0) {
            handleFilesystem.push(route);
          }
        } else if (route.handle === 'error') {
          handleRoutes.push(route);
        } else {
          handleRoutes.push(route);
        }
        continue;
      }

      // Routes with continue: true go first
      if ('continue' in route && route.continue === true) {
        continueRoutes.push(route);
        continue;
      }

      // Catch-all routes from root service
      if (
        isRootService &&
        'src' in route &&
        route.src === '^/(.*)$' &&
        'check' in route &&
        route.check === true
      ) {
        // Modify catch-all to exclude prefixed service paths
        if (prefixedPaths.length > 0) {
          const exclusion = prefixedPaths.join('|');
          rootCatchAll.push({
            ...route,
            src: `^/(?!(?:${exclusion})(?:/|$))(.*)$`,
          });
        } else {
          rootCatchAll.push(route);
        }
        continue;
      }

      // Routes in error phase
      if ('status' in route && (route.status === 404 || route.status === 500)) {
        // Check if this is likely an error handler
        if (
          ('src' in route && route.src?.includes('/404')) ||
          route.src?.includes('/500')
        ) {
          errorRoutes.push(route);
          continue;
        }
      }

      // Other routes go to otherRoutes
      otherRoutes.push(route);
    }
  }

  // Generate prefixed service fallback routes
  for (const service of services) {
    if (
      service.type !== 'web' ||
      !service.routePrefix ||
      service.routePrefix === '/'
    ) {
      continue;
    }

    const prefix = service.routePrefix.replace(/^\//, '');

    if (isStaticBuild(service)) {
      // Static service: generate SPA fallback or framework-specific routes
      const framework = service.framework
        ? frameworksBySlug.get(service.framework)
        : undefined;

      if (framework?.getDefaultRoutesForPrefix) {
        // Framework has specific prefixed routes (like Docusaurus 404)
        const frameworkRoutes = framework.getDefaultRoutesForPrefix(prefix);
        // Filter out handle:filesystem as we add it once
        const filteredRoutes = frameworkRoutes.filter(
          r => !('handle' in r && r.handle === 'filesystem')
        );
        prefixedFallbacks.push(...filteredRoutes);
      } else {
        // Simple SPA fallback
        prefixedFallbacks.push({
          src: `^/${prefix}(?:/(.*))?$`,
          dest: `/${prefix}/index.html`,
        });
      }
    } else {
      // Function service: rewrite to entrypoint
      const builderSrc = service.builder.src ?? '';
      const dest = builderSrc.startsWith('/') ? builderSrc : `/${builderSrc}`;

      functionRewrites.push({
        src: `^/${prefix}(?:/.*)?$`,
        dest,
        check: true,
      });
    }
  }

  // Assemble final routes in correct order
  const finalRoutes: Route[] = [
    ...continueRoutes,
    ...handleFilesystem,
    ...functionRewrites,
    ...prefixedFallbacks,
    ...rootCatchAll,
    ...otherRoutes,
    ...handleRoutes,
    ...errorRoutes,
  ];

  return { routes: finalRoutes };
}
