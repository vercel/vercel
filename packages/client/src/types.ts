import type { Dispatcher } from 'undici';
import type {
  Builder,
  BuilderFunctions,
  Images,
  ProjectSettings,
  Cron,
  ExperimentalServices,
  ExperimentalServiceGroups,
} from '@vercel/build-utils';
import type { Header, Route, Redirect, Rewrite } from '@vercel/routing-utils';

export { DeploymentEventType } from './utils';

export interface Dictionary<T> {
  [key: string]: T;
}

export const VALID_ARCHIVE_FORMATS = ['tgz'] as const;
export type ArchiveFormat = (typeof VALID_ARCHIVE_FORMATS)[number];

export interface VercelClientOptions {
  token: string;
  path: string | string[];
  debug?: boolean;
  teamId?: string;
  apiUrl?: string;
  force?: boolean;
  prebuilt?: boolean;
  vercelOutputDir?: string;
  rootDirectory?: string | null;
  withCache?: boolean;
  userAgent?: string;
  defaultName?: string;
  isDirectory?: boolean;
  skipAutoDetectionConfirmation?: boolean;
  archive?: ArchiveFormat;
  dispatcher?: Dispatcher;
  projectName?: string;
  /**
   * Path to a file containing bulk redirects (relative to the project root).
   * This file will be included in prebuilt deployments.
   */
  bulkRedirectsPath?: string | null;
  /**
   * When true, creates an experimental manual deployment. This mode requires
   * that the user later continues the deployment with an API call.
   */
  manual?: boolean;
}

/** @deprecated Use VercelClientOptions instead. */
export type NowClientOptions = VercelClientOptions;

/** @deprecated Use VercelConfig instead. */
export type NowConfig = VercelConfig;

export interface Deployment {
  id: string;
  deploymentId?: string;
  url: string;
  inspectorUrl: string;
  name: string;
  meta: Dictionary<string | number | boolean>;
  version: 2;
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
    | 'QUEUED'
    | 'CANCELED'
    | 'ERROR';
  state?:
    | 'INITIALIZING'
    | 'ANALYZING'
    | 'BUILDING'
    | 'DEPLOYING'
    | 'READY'
    | 'QUEUED'
    | 'CANCELED'
    | 'ERROR';
  ready?: number;
  createdAt: number;
  createdIn: string;
  buildingAt?: number;
  creator?: {
    uid?: string;
    email?: string;
    name?: string;
    username?: string;
  };
  env: Dictionary<string>;
  build: {
    env: Dictionary<string>;
  };
  target: string;
  alias: string[];
  aliasAssigned: boolean;
  aliasError: string | null;
  expiration?: number;
  proposedExpiration?: number;
  undeletedAt?: number;
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

export const fileNameSymbol = Symbol('fileName');

export interface VercelConfig {
  [fileNameSymbol]?: string;
  name?: string;
  meta?: string[];
  version?: number;
  public?: boolean;
  env?: Dictionary<string>;
  build?: {
    env?: Dictionary<string>;
  };
  builds?: Builder[];
  routes?: Route[];
  files?: string[];
  cleanUrls?: boolean;
  rewrites?: Rewrite[];
  redirects?: Redirect[];
  headers?: Header[];
  trailingSlash?: boolean;
  functions?: BuilderFunctions;
  github?: DeploymentGithubData;
  scope?: string;
  alias?: string | string[];
  regions?: string[];
  projectSettings?: ProjectSettings;
  buildCommand?: string | null;
  ignoreCommand?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  framework?: string | null;
  outputDirectory?: string | null;
  images?: Images;
  crons?: Cron[];
  bunVersion?: string;
  /**
   * Path to a file containing bulk redirects (relative to the project root).
   * This file will be included in prebuilt deployments.
   */
  bulkRedirectsPath?: string | null;
  /**
   * @experimental This feature is experimental and may change.
   */
  experimentalServices?: ExperimentalServices;
  /**
   * @experimental This feature is experimental and may change.
   */
  experimentalServiceGroups?: ExperimentalServiceGroups;
}

export interface GitMetadata {
  commitAuthorName?: string | undefined;
  commitMessage?: string | undefined;
  commitRef?: string | undefined;
  commitSha?: string | undefined;
  dirty?: boolean | undefined;
  remoteUrl?: string;
}

/**
 * Options that will be sent to the API.
 */
export interface DeploymentOptions {
  version?: number;
  regions?: string[];
  routes?: Route[];
  cleanUrls?: boolean;
  rewrites?: Rewrite[];
  redirects?: Redirect[];
  headers?: Header[];
  trailingSlash?: boolean;
  builds?: Builder[];
  functions?: BuilderFunctions;
  env?: Dictionary<string>;
  build?: {
    env?: Dictionary<string>;
  };
  source?: string;
  target?: string;
  name?: string;
  public?: boolean;
  meta?: Dictionary<string>;
  projectSettings?: ProjectSettings;
  gitMetadata?: GitMetadata;
  actor?: string;
  autoAssignCustomDomains?: boolean;
  customEnvironmentSlugOrId?: string;
}
