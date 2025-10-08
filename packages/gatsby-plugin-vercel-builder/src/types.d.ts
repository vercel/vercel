import type { Images, Route } from '@vercel/build-utils';

export type Config = {
  version: 3;
  routes?: Route[];
  images?: Images;
  wildcard?: WildcardConfig;
  overrides?: OverrideConfig;
  cache?: string[];
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
