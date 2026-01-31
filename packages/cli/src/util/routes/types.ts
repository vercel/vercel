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
  | 'terminate'
  | 'transform';

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
 * Path syntax types for route source patterns
 */
export type PathSyntax = 'regex' | 'path-to-regexp' | 'exact';

/**
 * Position placement options for route ordering
 */
export interface RoutePosition {
  placement: 'start' | 'end' | 'after' | 'before';
  referenceId?: string;
}

/**
 * Input for creating a new route
 */
export interface AddRouteInput {
  name: string;
  description?: string;
  enabled?: boolean;
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
