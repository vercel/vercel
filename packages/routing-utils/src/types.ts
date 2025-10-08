import { HandleValue } from './index';

export type RouteApiError = {
  name: string;
  code: string;
  message: string;
  link?: string; // link to error message details
  action?: string; // label for error link
  errors?: string[]; // array of all error messages
};

type MatchableValue =
  | string
  | {
      eq?: string | number;
      neq?: string;
      inc?: string[];
      ninc?: string[];
      pre?: string;
      suf?: string;
      re?: string;
      gt?: number;
      gte?: number;
      lt?: number;
      lte?: number;
    };

type MitigateAction = 'challenge' | 'deny';

export type HasField = Array<
  | {
      type: 'host';
      value: MatchableValue;
    }
  | {
      type: 'header' | 'cookie' | 'query';
      key: string;
      value?: MatchableValue;
    }
>;

type Transform = {
  type: 'request.headers' | 'request.query' | 'response.headers';
  op: 'append' | 'set' | 'delete';
  target: {
    // re is not supported for transforms. Once supported, replace key with MatchableValue.
    key:
      | string
      | {
          eq?: string | number;
          neq?: string;
          inc?: string[];
          ninc?: string[];
          pre?: string;
          suf?: string;
          gt?: number;
          gte?: number;
          lt?: number;
          lte?: number;
        };
  };
  args?: string | string[];
};

export type RouteWithSrc = {
  src: string;
  dest?: string;
  headers?: { [name: string]: string };
  methods?: string[];
  continue?: boolean;
  override?: boolean;
  caseSensitive?: boolean;
  check?: boolean;
  important?: boolean;
  status?: number;
  has?: HasField;
  missing?: HasField;
  mitigate?: {
    action: MitigateAction;
  };
  transforms?: Transform[];
  locale?: {
    redirect?: Record<string, string>;
    cookie?: string;
  };
  /**
   * A middleware key within the `output` key under the build result.
   * Overrides a `middleware` definition.
   */
  middlewarePath?: string;
  /**
   * The original middleware matchers.
   */
  middlewareRawSrc?: string[];
  /**
   * A middleware index in the `middleware` key under the build result
   */
  middleware?: number;
};

export type RouteWithHandle = {
  handle: HandleValue;
  src?: string;
  dest?: string;
  status?: number;
};

export type Route = RouteWithSrc | RouteWithHandle;

export type NormalizedRoutes = {
  routes: Route[] | null;
  error: RouteApiError | null;
};

export interface GetRoutesProps {
  routes?: Route[];
  cleanUrls?: boolean;
  rewrites?: Rewrite[];
  redirects?: Redirect[];
  headers?: Header[];
  trailingSlash?: boolean;
}

export interface MergeRoutesProps {
  userRoutes?: Route[] | null | undefined;
  builds: Build[];
}

export interface Build {
  use: string;
  entrypoint: string;
  routes?: Route[];
}

export interface Rewrite {
  source: string;
  destination: string;
  has?: HasField;
  missing?: HasField;
  statusCode?: number;
}

export interface Redirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
  has?: HasField;
  missing?: HasField;
}

export interface Header {
  source: string;
  headers: HeaderKeyValue[];
  has?: HasField;
  missing?: HasField;
}

export interface HeaderKeyValue {
  key: string;
  value: string;
}

export interface AppendRoutesToPhaseProps {
  /**
   * All input routes including `handle` phases.
   */
  routes: Route[] | null;
  /**
   * The routes to append to a specific phase.
   */
  newRoutes: Route[] | null;
  /**
   * The phase to append the routes such as `filesystem`.
   * If the phase is `null`, the routes will be appended prior to the first handle being found.
   */
  phase: HandleValue | null;
}
