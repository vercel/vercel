import type { RouteWithSrc } from '@vercel/routing-utils';

/**
 * Action field values from API for diff mode: '+' = added, '-' = deleted, '~' = modified
 */
export type DiffAction = '+' | '-' | '~';

/**
 * Main routing rule type that matches the API response.
 * The route definition is nested under the `route` property.
 */
export interface RoutingRule {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  staged: boolean;
  route: RouteWithSrc;
  /** Present when fetched with diff option */
  action?: DiffAction;
  /** Present if route was reordered (original position) */
  previousIndex?: number;
  /** Present if route was reordered (new position) */
  newIndex?: number;
  /** Route types computed by the API */
  routeTypes?: RouteType[];
}

/**
 * Version metadata for routing rule versions.
 */
export interface RouteVersion {
  id: string;
  s3Key: string;
  lastModified: number;
  createdBy: string;
  isStaging?: boolean;
  isLive?: boolean;
  ruleCount?: number;
  alias?: string;
}

/**
 * Response from GET /projects/:projectId/routes
 */
export interface GetRoutesResponse {
  routes: RoutingRule[];
  version: RouteVersion | null;
}

/**
 * Response from GET /projects/:projectId/routes/versions
 */
export interface GetVersionsResponse {
  versions: RouteVersion[];
}

/**
 * Route type categories for filtering and display
 */
export type RouteType =
  | 'header'
  | 'rewrite'
  | 'redirect'
  | 'set_status'
  | 'transform';

/**
 * Display labels for route types
 */
const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  header: 'Header',
  rewrite: 'Rewrite',
  redirect: 'Redirect',
  set_status: 'Set Status',
  transform: 'Transform',
};

/**
 * Returns a comma-separated string of display labels for a rule's route types.
 * Returns '-' if the rule has no route types.
 */
export function getRouteTypeLabels(rule: RoutingRule): string {
  const types = rule.routeTypes ?? [];
  return types.map(t => ROUTE_TYPE_LABELS[t]).join(', ') || '-';
}
