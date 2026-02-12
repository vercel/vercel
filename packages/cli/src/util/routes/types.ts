import type { RouteWithSrc } from '@vercel/routing-utils';

/**
 * Action field values from API for diff mode: '+' = added, '-' = deleted, '~' = modified
 */
export type DiffAction = '+' | '-' | '~';

/**
 * The syntax type for the source pattern.
 * - 'equals': Exact string match (escaped and anchored by the API)
 * - 'path-to-regexp': Express-style patterns with :param syntax
 * - 'regex': Raw regex patterns
 */
export type SrcSyntax = 'equals' | 'path-to-regexp' | 'regex';

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
  /**
   * The syntax type of the source pattern.
   * Determines how the pattern was compiled to regex by the API.
   * For legacy routes without this field, assume 'regex'.
   */
  srcSyntax?: SrcSyntax;
  /** Present when fetched with diff option */
  action?: DiffAction;
  /** Present if route was reordered (original position) */
  previousIndex?: number;
  /** Present if route was reordered (new position) */
  newIndex?: number;
  /** Present in diff when route's enabled state changed */
  previousEnabled?: boolean;
  /** Computed route type from the API */
  routeType?: RouteType;
}

/**
 * Version metadata for routing rule versions.
 */
export interface RouteVersion {
  id: string;
  lastModified: number;
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
export type RouteType = 'rewrite' | 'redirect' | 'set_status' | 'transform';

/**
 * Display labels for route types
 */
const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  rewrite: 'Rewrite',
  redirect: 'Redirect',
  set_status: 'Set Status',
  transform: 'Transform',
};

/**
 * Returns the display label for a rule's route type.
 * Returns '-' if the rule has no route type.
 */
export function getRouteTypeLabel(rule: RoutingRule): string {
  if (!rule.routeType) return '-';
  return ROUTE_TYPE_LABELS[rule.routeType] ?? '-';
}

/**
 * Display labels for source syntax types
 */
const SRC_SYNTAX_LABELS: Record<SrcSyntax, string> = {
  equals: 'Exact Match',
  'path-to-regexp': 'Pattern',
  regex: 'Regex',
};

/**
 * Returns a display label for a rule's source syntax type.
 */
export function getSrcSyntaxLabel(rule: RoutingRule): string {
  const syntax = rule.srcSyntax ?? 'regex';
  return SRC_SYNTAX_LABELS[syntax];
}

/**
 * Condition types for has/missing fields
 */
export type HasFieldHost = { type: 'host'; value: string };
export type HasFieldWithKey = {
  type: 'header' | 'cookie' | 'query';
  key: string;
  value?: string;
};
export type HasField = HasFieldHost | HasFieldWithKey;

/**
 * Transform operation types
 */
export type TransformOp = 'set' | 'append' | 'delete';
export type TransformType =
  | 'request.headers'
  | 'request.query'
  | 'response.headers';

export interface Transform {
  type: TransformType;
  op: TransformOp;
  target: { key: string };
  args?: string;
}

/**
 * Position placement options for route ordering
 */
export interface RoutePosition {
  placement: 'start' | 'end' | 'after' | 'before';
  referenceId?: string;
}

/**
 * Input for creating a new route.
 * Sent to POST /projects/:projectId/routes as { route: AddRouteInput, position? }.
 */
export interface AddRouteInput {
  name: string;
  description?: string;
  enabled?: boolean;
  /**
   * The syntax type for the source pattern.
   * Tells the API how to compile `route.src` to regex.
   * If omitted, the API infers syntax from the pattern.
   */
  srcSyntax?: SrcSyntax;
  route: {
    src: string;
    dest?: string;
    status?: number;
    headers?: Record<string, string>;
    transforms?: Transform[];
    has?: HasField[];
    missing?: HasField[];
    continue?: boolean;
  };
}

/**
 * Response from POST /projects/:projectId/routes
 */
export interface AddRouteResponse {
  route: RoutingRule;
  version: RouteVersion;
}
