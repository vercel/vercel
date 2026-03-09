import type { HasField, Route, RouteWithSrc } from '@vercel/routing-utils';

interface ServiceSubdomainRoutePrecedenceOptions {
  autoSubdomainRoutes: Route[] | null | undefined;
  userRoutes: Route[] | null | undefined;
}

function isRouteWithSrc(route: Route): route is RouteWithSrc {
  return !('handle' in route) && typeof route.src === 'string';
}

function getHostConditionKey(has: HasField | undefined): string | null {
  if (!has?.length) {
    return null;
  }

  // We only suppress when a route is purely host-conditioned. If a user route
  // adds extra conditions (headers/cookies/query), it is not equivalent.
  if (!has.every(condition => condition.type === 'host')) {
    return null;
  }

  return has
    .map(condition => serializeMatchableValue(condition.value))
    .sort()
    .join('|');
}

function serializeMatchableValue(
  value: string | number | Record<string, unknown>
): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return `eq:${String(value)}`;
  }

  const entries = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, raw]) => {
      if (Array.isArray(raw)) {
        return `${key}:${[...raw].sort().join(',')}`;
      }
      return `${key}:${String(raw)}`;
    });

  return entries.join(';');
}

function getRouteSubdomainSourceKey(route: Route): string | null {
  if (!isRouteWithSrc(route)) {
    return null;
  }

  const hostKey = getHostConditionKey(route.has);
  if (!hostKey) {
    return null;
  }

  return `${route.src}::${hostKey}`;
}

/**
 * Auto-generated service subdomain routes are inserted in the `null` phase.
 * User `rewrites` are inserted in the `filesystem` phase.
 *
 * To preserve intuitive override behavior, we drop an auto route only when the
 * user already defines an equivalent host+src match.
 */
export function suppressAutoSubdomainRoutesByUserRoutes({
  autoSubdomainRoutes,
  userRoutes,
}: ServiceSubdomainRoutePrecedenceOptions): Route[] | null {
  if (!autoSubdomainRoutes || autoSubdomainRoutes.length === 0) {
    return null;
  }

  const userRouteKeys = new Set(
    (userRoutes || [])
      .map(route => getRouteSubdomainSourceKey(route))
      .filter((key): key is string => Boolean(key))
  );

  const filtered = autoSubdomainRoutes.filter(route => {
    const key = getRouteSubdomainSourceKey(route);
    if (!key) {
      return true;
    }
    return !userRouteKeys.has(key);
  });

  return filtered.length > 0 ? filtered : null;
}
