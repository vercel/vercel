// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { Route } from '@vercel/routing-utils';

export function isRouteMiddleware(
  route: Route
): route is Route & { middlewarePath: string } {
  return 'middlewarePath' in route && typeof route.middlewarePath === 'string';
}
