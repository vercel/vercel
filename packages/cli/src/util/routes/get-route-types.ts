import type { RoutingRule, RouteType } from './types';

const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

/**
 * Determines the types of actions a route performs.
 * A single route can have multiple types (e.g., rewrite + header).
 */
export function getRouteTypes(rule: RoutingRule): RouteType[] {
  const types: RouteType[] = [];
  const { route } = rule;

  // Header: has response headers
  if (route.headers && Object.keys(route.headers).length > 0) {
    types.push('header');
  }

  // Redirect: has dest + redirect status code
  if (
    route.dest &&
    route.status &&
    REDIRECT_STATUS_CODES.includes(route.status)
  ) {
    types.push('redirect');
  }
  // Rewrite: has dest but NOT a redirect status code
  else if (
    route.dest &&
    (!route.status || !REDIRECT_STATUS_CODES.includes(route.status))
  ) {
    types.push('rewrite');
  }

  // Terminate: has status code without dest (returns status directly)
  if (route.status && !route.dest) {
    types.push('terminate');
  }

  // Transform: has request transforms (not yet implemented in types, placeholder)
  // if (route.transforms && route.transforms.length > 0) {
  //   types.push('transform');
  // }

  return types;
}

/**
 * Returns a display label for a route type
 */
export function getRouteTypeLabel(type: RouteType): string {
  switch (type) {
    case 'header':
      return 'Header';
    case 'rewrite':
      return 'Rewrite';
    case 'redirect':
      return 'Redirect';
    case 'terminate':
      return 'Status';
    case 'transform':
      return 'Transform';
    default:
      return type;
  }
}
