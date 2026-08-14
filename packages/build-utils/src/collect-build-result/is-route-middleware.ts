import type { Route } from '@vercel/routing-utils';

export function isRouteMiddleware(
  route: Route
): route is Route & { middlewarePath: string } {
  return 'middlewarePath' in route && typeof route.middlewarePath === 'string';
}
