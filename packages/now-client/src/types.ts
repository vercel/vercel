import { Builder, BuilderFunctions } from '@now/build-utils';
import { NowHeader, Route, NowRedirect, NowRewrite } from '@now/routing-utils';

export interface Dictionary<T> {
  [key: string]: T;
}

export interface NowClientOptions {
  token: string;
  debug?: boolean;
  teamId?: string;
  apiUrl?: string;
  userAgent?: string;
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
  type?: 'NPM' | 'STATIC' | 'DOCKER';
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
}

export interface DeploymentOptions {
  version?: number;
  regions?: string[];
  routes?: Route[];
  builds?: Builder[];
  functions?: BuilderFunctions;
  env?: Dictionary<string>;
  build?: {
    env: Dictionary<string>;
  };
  target?: string;
  token?: string | null;
  teamId?: string;
  force?: boolean;
  name?: string;
  defaultName?: string;
  isDirectory?: boolean;
  path?: string | string[];
  github?: DeploymentGithubData;
  scope?: string;
  public?: boolean;
  forceNew?: boolean;
  deploymentType?: 'NPM' | 'STATIC' | 'DOCKER';
  registryAuthToken?: string;
  engines?: Dictionary<string>;
  sessionAffinity?: 'ip' | 'random';
  config?: Dictionary<any>;
}
