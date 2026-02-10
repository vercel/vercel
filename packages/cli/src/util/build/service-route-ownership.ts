import type { Service } from '@vercel/build-utils';
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

function normalizeRoutePrefix(routePrefix: string): string {
  let normalized = routePrefix.startsWith('/')
    ? routePrefix
    : `/${routePrefix}`;
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || '/';
}

function escapeForRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function toPrefixMatcher(routePrefix: string): string {
  return `${escapeForRegex(routePrefix)}(?:/|$)`;
}

function isDescendantPrefix(candidate: string, prefix: string): boolean {
  return candidate !== prefix && candidate.startsWith(`${prefix}/`);
}

function getWebRoutePrefixes(services: Service[]): string[] {
  const unique = new Set<string>();
  for (const service of services) {
    if (!isWebServiceWithPrefix(service)) continue;
    unique.add(normalizeRoutePrefix(service.routePrefix));
  }
  return Array.from(unique);
}

function getOwnershipGuard(
  ownerPrefix: string,
  allWebPrefixes: string[]
): string {
  const owner = normalizeRoutePrefix(ownerPrefix);
  const nonRootPrefixes = allWebPrefixes
    .filter(prefix => prefix !== '/')
    .sort((a, b) => b.length - a.length);

  if (owner === '/') {
    return nonRootPrefixes
      .map(prefix => `(?!${toPrefixMatcher(prefix)})`)
      .join('');
  }

  const descendants = nonRootPrefixes.filter(prefix =>
    isDescendantPrefix(prefix, owner)
  );
  const positive = `(?=${toPrefixMatcher(owner)})`;
  const negative = descendants
    .map(prefix => `(?!${toPrefixMatcher(prefix)})`)
    .join('');

  return `${positive}${negative}`;
}

function scopeRouteSourceToOwnership(
  source: string,
  ownershipGuard: string
): string {
  if (!ownershipGuard) return source;
  const inner = source.startsWith('^') ? source.slice(1) : source;
  // Wrap with lookaheads/non-capturing group to preserve capture numbering.
  return `^${ownershipGuard}(?:${inner})`;
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
