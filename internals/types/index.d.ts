import type { BuilderFunctions } from '@vercel/build-utils';
import type { Readable, Writable } from 'stream';
import type * as tty from 'tty';
import type { Route } from '@vercel/routing-utils';
import type { PROJECT_ENV_TARGET } from '@vercel-internals/constants';

export type ProjectEnvTarget = (typeof PROJECT_ENV_TARGET)[number];
export type ProjectEnvType = 'plain' | 'encrypted' | 'system' | 'sensitive';

export type ProjectSettings = import('@vercel/build-utils').ProjectSettings;

export type Primitive =
  | bigint
  | boolean
  | null
  | number
  | string
  | symbol
  | undefined;

export type JSONArray = JSONValue[];

export type JSONValue = Primitive | JSONObject | JSONArray;

export interface JSONObject {
  [key: string]: JSONValue;
}

interface AuthConfig {
  '// Note'?: string;
  '// Docs'?: string;
  skipWrite?: boolean;
  /** An `access_token` obtained using the OAuth Device Authorization flow.  */
  token?: string;
  /** A `refresh_token` obtained using the OAuth Device Authorization flow. */
  refreshToken?: string;
  /**
   * The absolute time (seconds) when the {@link AuthConfig.token} expires.
   * Used to optimistically check if the token is still valid.
   */
  expiresAt?: number;
  /**
   * Indicates where the token was provided from when using external tokens.
   * Only set when token is provided via `--token` flag or `VERCEL_TOKEN` env var.
   */
  tokenSource?: 'flag' | 'env';
}

export interface GlobalConfig {
  '// Note'?: string;
  '// Docs'?: string;
  currentTeam?: string;
  api?: string;

  telemetry?: {
    enabled?: boolean;
  };
  guidance?: {
    enabled?: boolean;
  };
}

type Billing = {
  addons: string[];
  cancelation?: number;
  period: { start: number; end: number };
  plan: string;
  platform: string;
  trial: { start: number; end: number };
};

export type User = {
  id: string;
  avatar: string;
  createdAt: number;
  email: string;
  username: string;
  billing: Billing;
  name?: string;
  limited?: boolean;
  version?: 'northstar';
  defaultTeamId?: string;
};

export interface Team {
  id: string;
  avatar?: string | null;
  billing: Billing;
  created: string;
  creatorId: string;
  membership: { uid: string; role: 'MEMBER' | 'OWNER'; created: number };
  name: string;
  slug: string;
  limited?: boolean;
  saml?: {
    enforced: boolean;
    connection?: {
      state: string;
    };
  };
}

export type Domain = {
  id: string;
  name: string;
  boughtAt: number;
  createdAt: number;
  expiresAt: number;
  transferStartedAt?: number;
  transferredAt?: number | null;
  orderedAt?: number;
  serviceType: 'zeit.world' | 'external' | 'na';
  nameservers: string[];
  intendedNameservers: string[];
  creator: {
    id: string;
    username: string;
    email: string;
  };
};

export type DomainConfig = {
  configuredBy: null | 'CNAME' | 'A' | 'http';
  misconfigured: boolean;
  serviceType: 'zeit.world' | 'external' | 'na';
  nameservers: string[];
  cnames: string[] & { traceString?: string };
  aValues: string[] & { traceString?: string };
  dnssecEnabled?: boolean;
};

export type Cert = {
  uid: string;
  autoRenew: boolean;
  cns: string[];
  created: string;
  creator: string;
  expiration: string;
};

type RouteOrMiddleware =
  | Route
  | {
      src: string;
      continue: boolean;
      middleware: 0;
    };

export interface CustomEnvironment {
  id: string;
  slug: string;
  type: CustomEnvironmentType;
  description?: string;
  branchMatcher?: CustomEnvironmentBranchMatcher;
  createdAt: number;
  updatedAt: number;
  domains?: ProjectDomainFromApi[];
}

export interface CustomEnvironmentBranchMatcher {
  type: 'startsWith' | 'equals' | 'endsWith';
  pattern: string;
}

export type CustomEnvironmentType = 'production' | 'preview' | 'development';

export type Deployment = {
  alias?: string[];
  aliasAssigned?: boolean | null | number;
  aliasError?: null | { code: string; message: string };
  aliasFinal?: string | null;
  aliasWarning?: null | {
    code: string;
    message: string;
    link?: string;
    action?: string;
  };
  bootedAt?: number;
  build?: { env: string[] };
  builds?: { use: string; src?: string; config?: { [key: string]: any } };
  buildErrorAt?: number;
  buildingAt: number;
  canceledAt?: number;
  checksState?: 'completed' | 'registered' | 'running';
  checksConclusion?: 'canceled' | 'failed' | 'skipped' | 'succeeded';
  createdAt: number;
  createdIn?: string;
  creator: { uid: string; username?: string };
  customEnvironment?: CustomEnvironment;
  env?: string[];
  errorCode?: string;
  errorLink?: string;
  errorMessage?: string | null;
  errorStep?: string;
  forced?: boolean;
  functions?: BuilderFunctions | null;
  gitSource?: {
    org?: string;
    owner?: string;
    prId?: number | null;
    projectId: number;
    ref?: string | null;
    repoId?: number;
    repoUuid: string;
    sha?: string;
    slug?: string;
    type: string;
    workspaceUuid: string;
  };
  id: string;
  initReadyAt?: number;
  inspectorUrl?: string | null;
  lambdas?: Build[];
  meta?: {
    [key: string]: string | undefined;
  };
  monorepoManager?: string | null;
  name: string;
  ownerId?: string;
  plan?: 'enterprise' | 'hobby' | 'oss' | 'pro';
  previewCommentsEnabled?: boolean;
  private?: boolean;
  proposedExpiration?: number;
  projectId?: string;
  projectSettings?: {
    buildCommand?: string | null;
    devCommand?: string | null;
    framework?: string;
    installCommand?: string | null;
    outputDirectory?: string | null;
  };
  public: boolean;
  ready?: number;
  readyState:
    | 'BUILDING'
    | 'ERROR'
    | 'INITIALIZING'
    | 'QUEUED'
    | 'READY'
    | 'CANCELED';
  regions: string[];
  routes?: RouteOrMiddleware[] | null;
  source?: 'cli' | 'git' | 'import' | 'import/repo' | 'clone/repo';
  status:
    | 'BUILDING'
    | 'ERROR'
    | 'INITIALIZING'
    | 'QUEUED'
    | 'READY'
    | 'CANCELED';
  target?: 'staging' | 'production' | null;
  team?: {
    id: string;
    name: string;
    slug: string;
  };
  ttyBuildLogs?: boolean;
  type: 'LAMBDAS';
  undeletedAt?: number;
  url: string;
  userAliases?: string[];
  version: 2;
};

export type Alias = {
  uid: string;
  alias: string;
  createdAt: number;
  deployment: {
    id: string;
    url: string;
  };
  creator: {
    uid: string;
    username: string;
    email: string;
  };
  deploymentId?: string;
};

export type DNSRecord = {
  id: string;
  creator: string;
  mxPriority?: number;
  name: string;
  priority?: number;
  slug: string;
  type: string;
  value: string;
  created: number;
  updated: number;
  createdAt: number;
  updatedAt: number;
  domain: string;
};

type SRVRecordData = {
  name: string;
  type: 'SRV';
  srv: {
    port: number;
    priority: number;
    target: string;
    weight: number;
  };
};

type MXRecordData = {
  name: string;
  type: 'MX';
  value: string;
  mxPriority: number;
};

export type DNSRecordData =
  | {
      name: string;
      type: string;
      value: string;
    }
  | SRVRecordData
  | MXRecordData;

export interface ProjectAliasTarget {
  createdAt?: number;
  domain: string;
  redirect?: string | null;
  target: 'PRODUCTION' | 'STAGING';
  configuredBy?: null | 'CNAME' | 'A';
  configuredChangedAt?: null | number;
  configuredChangeAttempts?: [number, number];
  deployment?: Deployment | undefined;
}

export interface ProjectEnvVariable {
  id: string;
  key: string;
  value: string;
  type: ProjectEnvType;
  configurationId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  target?: ProjectEnvTarget | ProjectEnvTarget[];
  customEnvironmentIds?: string[];
  system?: boolean;
  gitBranch?: string;
}

export interface DeployHook {
  createdAt: number;
  id: string;
  name: string;
  ref: string;
  url: string;
}

export interface ProjectLinkData {
  type: string;
  repo: string;
  repoId: number;
  org?: string;
  gitCredentialId: string;
  productionBranch?: string | null;
  sourceless: boolean;
  createdAt: number;
  updatedAt: number;
  deployHooks?: DeployHook[];
}

export interface AutomationProtectionBypass {
  createdAt: number;
  createdBy: string;
  scope: 'automation-bypass';
}

export interface IntegrationAutomationProtectionBypass {
  createdAt: number;
  createdBy: string;
  scope: 'integration-automation-bypass';
  integrationId: string;
  configurationId: string;
}

export type ProjectProtectionBypass = Record<
  string,
  AutomationProtectionBypass | IntegrationAutomationProtectionBypass
>;

export interface Project extends ProjectSettings {
  id: string;
  analytics?: {
    id: string;
    enabledAt?: number;
    disabledAt?: number;
    canceledAt?: number | null;
  };
  name: string;
  accountId: string;
  updatedAt: number;
  createdAt: number;
  link?: ProjectLinkData;
  latestDeployments?: Partial<Deployment>[];
  lastAliasRequest?: LastAliasRequest | null;
  targets?: {
    production?: Deployment;
  };
  customEnvironments?: CustomEnvironment[];
  rollingRelease?: ProjectRollingRelease;
  protectionBypass?: ProjectProtectionBypass;
}

export interface Org {
  type: 'user' | 'team';
  id: string;
  slug: string;
}

export interface ProjectLink {
  /**
   * ID of the Vercel Project.
   */
  projectId: string;
  /**
   * User or Team ID of the owner of the Vercel Project.
   */
  orgId: string;
  /**
   * When linked as a repository, contains the absolute path
   * to the root directory of the repository.
   */
  repoRoot?: string;
  /**
   * When linked as a repository, contains the relative path
   * to the selected project root directory.
   */
  projectRootDirectory?: string;
  /**
   * Name of the Vercel Project.
   */
  projectName?: string;
}

export interface PaginationOptions {
  /**
   * Amount of items in the current page.
   * @example 20
   */
  count: number;
  /**
   * Timestamp that must be used to request the next page.
   * @example 1540095775951
   */
  next: number | null;
  /**
   * Timestamp that must be used to request the previous page.
   * @example 1540095775951
   */
  prev: number | null;
}

export type ProjectLinked = {
  status: 'linked';
  org: Org;
  project: Project;
  repoRoot?: string;
};

export type ProjectNotLinked = {
  status: 'not_linked';
  org: null;
  project: null;
};

export type ProjectLinkedError = {
  status: 'error';
  exitCode: number;
  reason?:
    | 'HEADLESS'
    | 'NOT_AUTHORIZED'
    | 'TEAM_DELETED'
    | 'PATH_IS_FILE'
    | 'INVALID_ROOT_DIRECTORY'
    | 'TOO_MANY_PROJECTS';
};

export type ProjectLinkResult =
  | ProjectLinked
  | ProjectNotLinked
  | ProjectLinkedError;

/**
 * @deprecated - `RollbackJobStatus` has been replace by `LastAliasRequest['jobStatus']`.
 */
export type RollbackJobStatus =
  | 'pending'
  | 'in-progress'
  | 'succeeded'
  | 'failed'
  | 'skipped';

/**
 * @deprecated - `RollbackTarget` has been renamed to `LastAliasRequest` so it can
 * be shared with "promote".
 */
export interface RollbackTarget {
  fromDeploymentId: string;
  jobStatus: RollbackJobStatus;
  requestedAt: number;
  toDeploymentId: string;
}

export interface LastAliasRequest {
  fromDeploymentId: string;
  jobStatus: 'pending' | 'in-progress' | 'succeeded' | 'failed' | 'skipped';
  requestedAt: number;
  toDeploymentId: string;
  type: 'rollback' | 'promote';
}

export interface Token {
  id: string;
  name: string;
  type: string;
  origin?: string;
  activeAt: number;
  createdAt: number;
  teamId?: string;
}

export interface GitMetadata {
  commitAuthorName?: string | undefined;
  commitAuthorEmail?: string | undefined;
  commitMessage?: string | undefined;
  commitRef?: string | undefined;
  commitSha?: string | undefined;
  dirty?: boolean | undefined;
  remoteUrl?: string;
}

/**
 * An object representing a Build on Vercel
 */
export interface Build {
  /**
   * The unique identifier of the Build
   * @example "bld_q5fj68jh7eewfe8"
   */
  id: string;

  /**
   * The unique identifier of the deployment
   * @example "dpl_BRGyoU2Jzzwx7myBnqv3xjRDD2GnHTwUWyFybnrUvjDD"
   */
  deploymentId: string;

  /**
   * The entrypoint of the deployment
   * @example "api/index.js"
   */
  entrypoint: string;

  /**
   * The state of the deployment depending on the process of deploying,
   * or if it is ready or in an error state
   * @example "READY"
   */
  readyState:
    | 'INITIALIZING'
    | 'BUILDING'
    | 'UPLOADING'
    | 'DEPLOYING'
    | 'READY'
    | 'ARCHIVED'
    | 'ERROR'
    | 'QUEUED'
    | 'CANCELED';

  /**
   * The time at which the Build state was last modified
   * @example 1567024758130
   */
  readyStateAt?: number;

  /**
   * The time at which the Build was scheduled to be built
   * @example 1567024756543
   */
  scheduledAt?: number | null;

  /**
   * The time at which the Build was created
   * @example 1567071524208
   */
  createdAt?: number;

  /**
   * The time at which the Build was deployed
   * @example 1567071598563
   */
  deployedAt?: number;

  /**
   * The region where the Build was first created
   * @example "sfo1"
   */
  createdIn?: string;

  /**
   * The Runtime the Build used to generate the output
   * @example "@vercel/node"
   */
  use?: string;

  /**
   * An object that contains the Build's configuration
   * @example {"zeroConfig": true}
   */
  config?: {
    distDir?: string | undefined;
    forceBuildIn?: string | undefined;
    reuseWorkPathFrom?: string | undefined;
    zeroConfig?: boolean | undefined;
  };

  /**
   * A list of outputs for the Build that can be either Serverless Functions or static files
   */
  output: BuildOutput[];

  /**
   * If the Build uses the `@vercel/static` Runtime, it contains a hashed string of all outputs
   * @example null
   */
  fingerprint?: string | null;

  copiedFrom?: string;
}

export interface BuildOutput {
  /**
   * The type of the output
   */
  type?: 'lambda' | 'file';

  /**
   * The absolute path of the file or Serverless Function
   */
  path: string;

  /**
   * The SHA1 of the file
   */
  digest: string;

  /**
   * The POSIX file permissions
   */
  mode: number;

  /**
   * The size of the file in bytes
   */
  size?: number;

  /**
   * If the output is a Serverless Function, an object
   * containing the name, location and memory size of the function
   */
  lambda?: {
    functionName: string;
    deployedTo: string[];
    memorySize?: number;
    timeout?: number;
    layers?: string[];
  } | null;
}

export interface ReadableTTY extends Readable {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => void;
}

export interface WritableTTY extends Writable {
  isTTY?: boolean;
}

export interface Stdio {
  stdin: ReadableTTY;
  stdout: tty.WriteStream;
  stderr: tty.WriteStream;
}
export interface ProjectRollingReleaseStage {
  /** The percentage of traffic to serve to the new deployment */
  targetPercentage: number;
  /** duration is the total time to serve a stage, at the given targetPercentage. */
  duration?: number;
}

export interface ProjectRollingRelease {
  enabled: boolean;
  advancementType: RollingReleaseAdvancementType;
  stages?: ProjectRollingReleaseStage[] | null;
}

export type RollingReleaseState = 'ACTIVE' | 'COMPLETE' | 'ABORTED';
export type RollingReleaseAdvancementType = 'manual-approval' | 'automatic';

export interface RollingReleaseDeploymentSummary {
  id: string;
  name: string;
  url: string;
  readyState: string;
  readyStateAt: number;
  source: string;
  target: string;
  createdAt: string;
}
export interface RollingReleaseStageSummary {
  index: number;
  isFinalStage: boolean;
  targetPercentage: number;
  requreApproval: boolean;
  duration: number | undefined;
}

export interface RollingReleaseDocument {
  canaryDeployment: RollingReleaseDeploymentSummary;
  currentDeployment: RollingReleaseDeploymentSummary;
  activeStageApproved: boolean;
  activeStageIndex: number;
  activeStage: RollingReleaseStageSummary;
  nextStage: RollingReleaseStageSummary;
  stages: RollingReleaseDeploymentSummary[];
  startedAt: number;
  updatedAt: number;
  state: RollingReleaseState;
}
