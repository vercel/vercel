import { HandleValue } from './index';

export type NowError = {
  code: string;
  message: string;
  errors: NowErrorNested[];
  sha?: string; // File errors
};

export type NowErrorNested = {
  message: string;
  src?: string;
  handle?: string;
};

export type Source = {
  src: string;
  dest?: string;
  headers?: { [name: string]: string };
  methods?: string[];
  continue?: boolean;
  check?: boolean;
  status?: number;
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
  error: NowError | null;
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
