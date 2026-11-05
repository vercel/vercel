import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import type { ExperimentalService } from '@vercel/build-utils';
import type { Route } from '@vercel/routing-utils';
interface ScopeRoutesToServiceOwnershipOptions {
  routes: Route[];
  owner: ExperimentalService;
  allServices: ExperimentalService[];
}
function isWebServiceWithPrefix(
  service: ExperimentalService
): service is ExperimentalService & { type: 'web'; routePrefix: string } {
  return service.type === 'web' && typeof service.routePrefix === 'string';
}
function getWebRoutePrefixes(services: ExperimentalService[]): string[] {
  const unique = new Set<string>();
  for (const service of services) {
    if (!isWebServiceWithPrefix(service)) continue;
    unique.add(normalizeRoutePrefix(service.routePrefix));
  }
  return Array.from(unique);
}
export function scopeRoutesToServiceOwnership({
  routes,
  owner,
  allServices,
}: ScopeRoutesToServiceOwnershipOptions): Route[] {
  if (!isWebServiceWithPrefix(owner)) {
    return routes;
  }
  const allWebPrefixes = getWebRoutePrefixes(allServices);
  const ownershipGuard = getOwnershipGuard(owner.routePrefix, allWebPrefixes);
  if (!ownershipGuard) {
    return routes;
  }
  return routes.map(route => {
    // Middleware routes are indexed by their exact `src` by the deploy
    // output validator, so wrapping them with the ownership guard (as
    // done for normal routes) corrupts the key and breaks deploys of
    // services-mode projects that have a middleware. Leave them alone,
    // exactly like `handle` routes. See vercel/vercel#16296.
    if (
      'handle' in route ||
      'middlewarePath' in route ||
      typeof route.src !== 'string'
    ) {
      return route;
    }
    return {
      ...route,
      src: scopeRouteSourceToOwnership(route.src, ownershipGuard),
    };
  });
}
