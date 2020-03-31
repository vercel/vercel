import { Builder, BuilderFunctions } from '@now/build-utils';
import { NowHeader, Route, NowRedirect, NowRewrite } from '@now/routing-utils';

export { DeploymentEventType } from './utils';

export interface Dictionary<T> {
  [key: string]: T;
}

/**
 * Options for `now-client` or
 * properties that should not
 * be part of the payload.
 */
export interface NowClientOptions {
  token: string;
  path: string | string[];
  debug?: boolean;
  teamId?: string;
  apiUrl?: string;
  force?: boolean;
  withCache?: boolean;
  userAgent?: string;
  defaultName?: string;
  isDirectory?: boolean;
  skipAutoDetectionConfirmation?: boolean;
}

export interface Deployment {
  id: string;
  deploymentId?: string;
  url: string;
  name: string;
  meta: Dictionary<string | number | boolean>;
  version: number;
  regions: string[];
  routes: Route[];
  builds?: Builder[];
  functions?: BuilderFunctions;
  plan: string;
  public: boolean;
  ownerId: string;
  readyState:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  state?:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  createdAt: string;
  createdIn: string;
  env: Dictionary<string>;
  build: {
    env: Dictionary<string>;
  };
  target: string;
  alias: string[];
  aliasAssigned: boolean;
  aliasError: string | null;
}

export interface DeploymentBuild {
  id: string;
  use: string;
  createdIn: string;
  deployedTo: string;
  readyState:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  state?:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'ERROR';
  readyStateAt: string;
  path: string;
}

export interface DeploymentGithubData {
  enabled: boolean;
  autoAlias: boolean;
  silent: boolean;
  autoJobCancelation: boolean;
}

interface LegacyNowConfig {
  type?: string;
  aliases?: string | string[];
}

export interface NowConfig extends LegacyNowConfig {
  name?: string;
  version?: number;
  env?: Dictionary<string>;
  build?: {
    env?: Dictionary<string>;
  };
  builds?: Builder[];
  routes?: Route[];
  files?: string[];
  cleanUrls?: boolean;
  rewrites?: NowRewrite[];
  redirects?: NowRedirect[];
  headers?: NowHeader[];
  trailingSlash?: boolean;
  functions?: BuilderFunctions;
  github?: DeploymentGithubData;
  scope?: string;
  alias?: string | string[];
  projectSettings?: {
    devCommand?: string | null;
    buildCommand?: string | null;
    outputDirectory?: string | null;
    framework?: string | null;
  };
}

interface LegacyDeploymentOptions {
  project?: string;
  forceNew?: boolean;
  description?: string;
  registryAuthToken?: string;
  engines?: Dictionary<string>;
  sessionAffinity?: 'ip' | 'key' | 'random';
  deploymentType?: 'NPM' | 'STATIC' | 'DOCKER';
  scale?: Dictionary<{
    min?: number;
    max?: number | 'auto';
  }>;
  limits?: {
    duration?: number;
    maxConcurrentReqs?: number;
    timeout?: number;
  };
  // Can't be NowConfig, since we don't
  // include all legacy types here
  config?: Dictionary<any>;
}

/**
 * Options that will be sent to the API.
 */
export interface DeploymentOptions extends LegacyDeploymentOptions {
  version?: number;
  regions?: string[];
  routes?: Route[];
  cleanUrls?: boolean;
  rewrites?: NowRewrite[];
  redirects?: NowRedirect[];
  headers?: NowHeader[];
  trailingSlash?: boolean;
  builds?: Builder[];
  functions?: BuilderFunctions;
  env?: Dictionary<string>;
  build?: {
    env: Dictionary<string>;
  };
  target?: string;
  name?: string;
  public?: boolean;
  meta?: Dictionary<string>;
  projectSettings?: {
    devCommand?: string | null;
    buildCommand?: string | null;
    outputDirectory?: string | null;
  };
}
