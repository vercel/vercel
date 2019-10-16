export type NowError = {
  code: string;
  message: string;
  errors: {
    message: string;
    src?: string;
    handle?: string;
  }[];
  sha?: string; // File errors
};

export type Source = {
  src: string;
  dest?: string;
  headers?: { [name: string]: string };
  methods?: string[];
  continue?: boolean;
  status?: number;
};

export type Handler = {
  handle: string;
};

export type Route = Source | Handler;

export type NormalizedRoutes = {
  routes: Route[] | null;
  error: NowError | null;
};

export interface GetRoutesProps {
  nowConfig: NowConfig;
  filePaths: string[];
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
