import type { HasField, Route, RouteWithSrc } from '@vercel/routing-utils';

interface ServiceHostRoutePrecedenceOptions {
  autoHostRoutes: Route[] | null | undefined;
  userRoutes: Route[] | null | undefined;
}

function isRouteWithSrc(route: Route): route is RouteWithSrc {
  return !('handle' in route) && typeof route.src === 'string';
}

function getHostConditionSignature(has: HasField | undefined): string | null {
  if (!has || has.length === 0) {
    return null;
  }

  const hostConditions = has.filter(
    condition => condition.type === 'host'
  ) as Array<{
    type: 'host';
    value: string | number | Record<string, unknown>;
  }>;
  if (hostConditions.length === 0 || hostConditions.length !== has.length) {
    return null;
  }

  return hostConditions
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

function getRouteHostSourceSignature(route: Route): string | null {
  if (!isRouteWithSrc(route)) {
    return null;
  }

  const hostSignature = getHostConditionSignature(route.has);
  if (!hostSignature) {
    return null;
  }

  return `${route.src}::${hostSignature}`;
}

/**
 * User-defined routes should override auto-generated service host routes for
 * the same host/source pair.
 */
export function suppressAutoHostRoutesByUserRoutes({
  autoHostRoutes,
  userRoutes,
}: ServiceHostRoutePrecedenceOptions): Route[] | null {
  if (!autoHostRoutes || autoHostRoutes.length === 0) {
    return null;
  }

  const userHostSourceSignatures = new Set<string>();
  for (const route of userRoutes || []) {
    const signature = getRouteHostSourceSignature(route);
    if (signature) {
      userHostSourceSignatures.add(signature);
    }
  }

  const filtered = autoHostRoutes.filter(route => {
    const signature = getRouteHostSourceSignature(route);
    if (!signature) {
      return true;
    }
    return !userHostSourceSignatures.has(signature);
  });

  return filtered.length > 0 ? filtered : null;
}
