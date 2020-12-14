import { HandleValue } from './index';

export type RouteApiError = {
  name: string;
  code: string;
  message: string;
  link?: string; // link to error message details
  action?: string; // label for error link
  errors?: string[]; // array of all error messages
};

export type Source = {
  src: string;
  dest?: string;
  headers?: { [name: string]: string };
  methods?: string[];
  continue?: boolean;
  check?: boolean;
  important?: boolean;
  status?: number;
  locale?: {
    redirect?: Record<string, string>;
    cookie?: string;
  };
};

export type Handler = {
  handle: HandleValue;
  src?: string;
  dest?: string;
  status?: number;
};

export type Route = Source | Handler;

export type NormalizedRoutes = {
  routes: Route[] | null;
  error: RouteApiError | null;
};

export interface GetRoutesProps {
  nowConfig: NowConfig;
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

export interface NowConfig {
  name?: string;
  version?: number;
  routes?: Route[];
  cleanUrls?: boolean;
  rewrites?: NowRewrite[];
  redirects?: NowRedirect[];
  headers?: NowHeader[];
  trailingSlash?: boolean;
}

export interface NowRewrite {
  source: string;
  destination: string;
}

export interface NowRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
}

export interface NowHeader {
  source: string;
  headers: NowHeaderKeyValue[];
}

export interface NowHeaderKeyValue {
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
   */
  phase: HandleValue;
}
