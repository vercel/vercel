import {
  getOwnershipGuard,
  normalizeRoutePrefix,
  scopeRouteSourceToOwnership,
} from '@vercel/routing-utils';
import { type Service } from '@vercel/build-utils';
import type { Route } from '@vercel/routing-utils';
interface ScopeRoutesToServiceOwnershipOptions {
  routes: Route[];
  owner: Service;
  allServices: Service[];
}
function isWebServiceWithPrefix(
  service: Service
): service is Service & { type: 'web'; routePrefix: string } {
  return service.type === 'web' && typeof service.routePrefix === 'string';
}
function getWebRoutePrefixes(services: Service[]): string[] {
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
    if ('handle' in route || typeof route.src !== 'string') {
      return route;
    }
    return {
      ...route,
      src: scopeRouteSourceToOwnership(route.src, ownershipGuard),
    };
  });
}
