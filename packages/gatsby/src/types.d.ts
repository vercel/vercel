import type { IncomingMessage, ServerResponse } from 'http';

export type Config = {
  version: 3;
  routes?: Route[];
  images?: ImagesConfig;
  wildcard?: WildcardConfig;
  overrides?: OverrideConfig;
  cache?: string[];
};

type Route = Source | Handler;

type Source = {
  src: string;
  dest?: string;
  headers?: Record<string, string>;
  methods?: string[];
  continue?: boolean;
  caseSensitive?: boolean;
  check?: boolean;
  status?: number;
  has?: Array<HostHasField | HeaderHasField | CookieHasField | QueryHasField>;
  missing?: Array<
    HostHasField | HeaderHasField | CookieHasField | QueryHasField
  >;
  locale?: Locale;
  middlewarePath?: string;
};

type Locale = {
  redirect?: Record<string, string>;
  cookie?: string;
};

type HostHasField = {
  type: 'host';
  value: string;
};

type HeaderHasField = {
  type: 'header';
  key: string;
  value?: string;
};

type CookieHasField = {
  type: 'cookie';
  key: string;
  value?: string;
};

type QueryHasField = {
  type: 'query';
  key: string;
  value?: string;
};

type HandleValue =
  | 'rewrite'
  | 'filesystem' // check matches after the filesystem misses
  | 'resource'
  | 'miss' // check matches after every filesystem miss
  | 'hit'
  | 'error'; //  check matches after error (500, 404, etc.)

type Handler = {
  handle: HandleValue;
  src?: string;
  dest?: string;
  status?: number;
};

type ImageFormat = 'image/avif' | 'image/webp';

type ImagesConfig = {
  sizes: number[];
  domains: string[];
  minimumCacheTTL?: number; // seconds
  formats?: ImageFormat[];
  dangerouslyAllowSVG?: boolean;
  contentSecurityPolicy?: string;
};

type WildCard = {
  domain: string;
  value: string;
};

type WildcardConfig = Array<WildCard>;

type Override = {
  path?: string;
  contentType?: string;
};

type OverrideConfig = Record<string, Override>;

type ServerlessFunctionConfig = {
  handler: string;
  runtime: string;
  memory?: number;
  maxDuration?: number;
  environment?: Record<string, string>[];
  allowQuery?: string[];
  regions?: string[];
};

export type NodejsServerlessFunctionConfig = ServerlessFunctionConfig & {
  launcherType: 'Nodejs';
  shouldAddHelpers?: boolean; // default: false
  shouldAddSourceMapSupport?: boolean; // default: false
};

export type PrerenderFunctionConfig = {
  expiration: number | false;
  group?: number;
  bypassToken?: string;
  fallback?: string;
  allowQuery?: string[];
};

export interface ServerlessRequest extends IncomingMessage {
  query: Partial<{
    [key: string]: string | string[];
  }>;
  cookies: Partial<{
    [key: string]: string;
  }>;
  body: any;
}

export type ServerlessFunctionRequest = IncomingMessage & {
  query: Partial<{
    [key: string]: string | string[];
  }>;
  cookies: Partial<{
    [key: string]: string;
  }>;
  body: any;
};

export type ServerlessFunctionResponse<T = any> = ServerResponse & {
  send: Send<T>;
  json: Send<T>;
  status: (statusCode: number) => ServerResponse<T>;
  redirect(url: string): ServerResponse<T>;
  redirect(status: number, url: string): ServerResponse<T>;
};
