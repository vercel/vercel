import type FileRef from './file-ref';
import type FileFsRef from './file-fs-ref';
import type FileBlob from './file-blob';
import type { Lambda, LambdaArchitecture } from './lambda';
import type { Prerender } from './prerender';
import type { EdgeFunction } from './edge-function';
import type { Span } from './trace';
import type { HasField } from '@vercel/routing-utils';

export interface Env {
  [name: string]: string | undefined;
}

export type File = FileRef | FileFsRef | FileBlob;
export interface FileBase {
  type: string;
  mode: number;
  contentType?: string;
  toStream: () => NodeJS.ReadableStream;
  toStreamAsync?: () => Promise<NodeJS.ReadableStream>;
}

export interface Files {
  [filePath: string]: File;
}

export interface Config {
  maxLambdaSize?: string;
  includeFiles?: string | string[];
  excludeFiles?: string | string[];
  bundle?: boolean;
  ldsflags?: string;
  helpers?: boolean;
  rust?: string;
  debug?: boolean;
  zeroConfig?: boolean;
  import?: { [key: string]: string };
  functions?: BuilderFunctions;
  projectSettings?: ProjectSettings;
  outputDirectory?: string;
  installCommand?: string;
  buildCommand?: string;
  devCommand?: string;
  framework?: string | null;
  nodeVersion?: string;
  middleware?: boolean;
  [key: string]: unknown;
}

export type { HasField };

export interface Meta {
  isDev?: boolean;
  devCacheDir?: string;
  skipDownload?: boolean;
  requestPath?: string | null;
  filesChanged?: string[];
  filesRemoved?: string[];
  env?: Env;
  buildEnv?: Env;
  [key: string]: unknown;
}

export interface BuildOptions {
  /**
   * All source files of the project
   */
  files: Files;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process. This directory will be populated with the restored cache.
   */
  workPath: string;

  /**
   * The "Root Directory" is assigned to the `workPath` so the `repoRootPath`
   * is the Git Repository Root. This is only relevant for Monorepos.
   * See https://vercel.com/blog/monorepos
   */
  repoRootPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `vercel.json`.
   */
  config: Config;

  /**
   * Metadata related to the invoker of the builder, used by `vercel dev`.
   * Builders may use the properties on this object to change behavior based
   * on the build environment.
   */
  meta?: Meta;

  /**
   * A callback to be invoked by a builder after a project's
   * build command has been run but before the outputs have been
   * fully processed
   */
  buildCallback?: (opts: Omit<BuildOptions, 'buildCallback'>) => Promise<void>;

  /**
   * The current trace state from the internal vc tracing
   */
  span?: Span;
}

export interface PrepareCacheOptions {
  /**
   * All source files of the project
   */
  files: Files;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process.
   */
  workPath: string;

  /**
   * The "Root Directory" is assigned to the `workPath` so the `repoRootPath`
   * is the Git Repository Root. This is only relevant for Monorepos.
   * See https://vercel.com/blog/monorepos
   */
  repoRootPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `vercel.json`.
   */
  config: Config;
}

export interface ShouldServeOptions {
  /**
   * A path string from a request.
   */
  requestPath: string;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * All source files of the project
   */
  files: {
    [path: string]: FileFsRef;
  };

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process. This directory will be populated with the restored cache.
   */
  workPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `vercel.json`.
   */
  config: Config;
}

/**
 * `startDevServer()` is given the same parameters as `build()`.
 */
export type StartDevServerOptions = BuildOptions;

export interface StartDevServerSuccess {
  /**
   * Port number where the dev server can be connected to, assumed to be running
   * on `localhost`.
   */
  port: number;

  /**
   * Process ID number of the dev server. Useful for the `vercel dev` server to
   * shut down the dev server once an HTTP request has been fulfilled.
   */
  pid: number;

  /**
   * An optional function to shut down the dev server. If not provided, the
   * dev server will forcefully be killed.
   */
  shutdown?: () => Promise<void>;
}

/**
 * `startDevServer()` may return `null` to opt-out of spawning a dev server for
 * a given `entrypoint`.
 */
export type StartDevServerResult = StartDevServerSuccess | null;

/**
 * Credit to Iain Reid, MIT license.
 * Source: https://gist.github.com/iainreid820/5c1cc527fe6b5b7dba41fec7fe54bf6e
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PackageJson {
  /**
   * An author or contributor
   */
  export interface Author {
    name: string;
    email?: string;
    homepage?: string;
  }

  /**
   * A map of exposed bin commands
   */
  export interface BinMap {
    [commandName: string]: string;
  }

  /**
   * A bugs link
   */
  export interface Bugs {
    email: string;
    url: string;
  }

  export interface Config {
    name?: string;
    config?: unknown;
  }

  /**
   * A map of dependencies
   */
  export interface DependencyMap {
    [dependencyName: string]: string;
  }

  /**
   * CommonJS package structure
   */
  export interface Directories {
    lib?: string;
    bin?: string;
    man?: string;
    doc?: string;
    example?: string;
  }

  export interface Engines {
    node?: string;
    npm?: string;
    pnpm?: string;
  }

  export interface PublishConfig {
    registry?: string;
  }

  /**
   * A project repository
   */
  export interface Repository {
    type: string;
    url: string;
  }

  export interface ScriptsMap {
    [scriptName: string]: string;
  }
}

export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly keywords?: string[];
  readonly homepage?: string;
  readonly bugs?: string | PackageJson.Bugs;
  readonly license?: string;
  readonly author?: string | PackageJson.Author;
  readonly contributors?: string[] | PackageJson.Author[];
  readonly files?: string[];
  readonly main?: string;
  readonly bin?: string | PackageJson.BinMap;
  readonly man?: string | string[];
  readonly directories?: PackageJson.Directories;
  readonly repository?: string | PackageJson.Repository;
  readonly scripts?: PackageJson.ScriptsMap;
  readonly config?: PackageJson.Config;
  readonly dependencies?: PackageJson.DependencyMap;
  readonly devDependencies?: PackageJson.DependencyMap;
  readonly peerDependencies?: PackageJson.DependencyMap;
  readonly optionalDependencies?: PackageJson.DependencyMap;
  readonly bundledDependencies?: string[];
  readonly engines?: PackageJson.Engines;
  readonly os?: string[];
  readonly cpu?: string[];
  readonly preferGlobal?: boolean;
  readonly private?: boolean;
  readonly publishConfig?: PackageJson.PublishConfig;
  readonly packageManager?: string;
  readonly type?: string;
}

export interface ConstructorVersion {
  /** major version number: 18 */
  major: number;
  /** minor version number: 18 */
  minor?: number;
  /** major version range: "18.x" */
  range: string;
  /** runtime descriptor: "nodejs18.x" */
  runtime: string;
  discontinueDate?: Date;
}

interface BaseVersion extends ConstructorVersion {
  state: 'active' | 'deprecated' | 'discontinued';
}

export class Version implements BaseVersion {
  major: number;
  minor?: number;
  range: string;
  runtime: string;
  discontinueDate?: Date;
  constructor(version: ConstructorVersion) {
    this.major = version.major;
    this.minor = version.minor;
    this.range = version.range;
    this.runtime = version.runtime;
    this.discontinueDate = version.discontinueDate;
  }
  get state() {
    if (this.discontinueDate && this.discontinueDate.getTime() <= Date.now()) {
      return 'discontinued';
    } else if (this.discontinueDate) {
      return 'deprecated';
    }
    return 'active';
  }
  get formattedDate() {
    return (
      this.discontinueDate && this.discontinueDate.toISOString().split('T')[0]
    );
  }
}

export class NodeVersion extends Version {}

export interface Builder {
  use: string;
  src?: string;
  config?: Config;
}

export interface BuilderFunctions {
  [key: string]: {
    architecture?: LambdaArchitecture;
    memory?: number;
    maxDuration?: number;
    runtime?: string;
    includeFiles?: string;
    excludeFiles?: string;
  };
}

export interface ProjectSettings {
  framework?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  buildCommand?: string | null;
  outputDirectory?: string | null;
  rootDirectory?: string | null;
  nodeVersion?: string;
  createdAt?: number;
  autoExposeSystemEnvs?: boolean;
  sourceFilesOutsideRootDirectory?: boolean;
  directoryListing?: boolean;
  gitForkProtection?: boolean;
  commandForIgnoringBuildStep?: string | null;
}

export interface BuilderV2 {
  version: 2;
  build: BuildV2;
  diagnostics?: Diagnostics;
  prepareCache?: PrepareCache;
  shouldServe?: ShouldServe;
}

export interface BuilderV3 {
  version: 3;
  build: BuildV3;
  diagnostics?: Diagnostics;
  prepareCache?: PrepareCache;
  shouldServe?: ShouldServe;
  startDevServer?: StartDevServer;
}

type ImageFormat = 'image/avif' | 'image/webp';

type ImageContentDispositionType = 'inline' | 'attachment';

export type RemotePattern = {
  /**
   * Must be `http` or `https`.
   */
  protocol?: 'http' | 'https';

  /**
   * Can be literal or wildcard.
   * Single `*` matches a single subdomain.
   * Double `**` matches any number of subdomains.
   */
  hostname: string;

  /**
   * Can be literal port such as `8080` or empty string
   * meaning no port.
   */
  port?: string;

  /**
   * Can be literal or wildcard.
   * Single `*` matches a single path segment.
   * Double `**` matches any number of path segments.
   */
  pathname?: string;

  /**
   * Can be literal query string such as `?v=1` or
   * empty string meaning no query string.
   */
  search?: string;
};

export interface LocalPattern {
  /**
   * Can be literal or wildcard.
   * Single `*` matches a single path segment.
   * Double `**` matches any number of path segments.
   */
  pathname?: string;

  /**
   * Can be literal query string such as `?v=1` or
   * empty string meaning no query string.
   */
  search?: string;
}

export interface Images {
  domains: string[];
  remotePatterns?: RemotePattern[];
  localPatterns?: LocalPattern[];
  qualities?: number[];
  sizes: number[];
  minimumCacheTTL?: number;
  formats?: ImageFormat[];
  dangerouslyAllowSVG?: boolean;
  contentSecurityPolicy?: string;
  contentDispositionType?: ImageContentDispositionType;
}

/**
 * If a Builder ends up creating filesystem outputs conforming to
 * the Build Output API, then the Builder should return this type.
 */
export interface BuildResultBuildOutput {
  /**
   * Version number of the Build Output API that was created.
   * Currently only `3` is a valid value.
   * @example 3
   */
  buildOutputVersion: 3;
  /**
   * Filesystem path to the Build Output directory.
   * @example "/path/to/.vercel/output"
   */
  buildOutputPath: string;
}

export interface Cron {
  path: string;
  schedule: string;
}

/** The framework which created the function */
export interface FunctionFramework {
  slug: string;
  version?: string;
}

/**
 * When a Builder implements `version: 2`, the `build()` function is expected
 * to return this type.
 */
export interface BuildResultV2Typical {
  // TODO: use proper `Route` type from `routing-utils` (perhaps move types to a common package)
  routes?: any[];
  images?: Images;
  output: {
    [key: string]: File | Lambda | Prerender | EdgeFunction;
  };
  wildcard?: Array<{
    domain: string;
    value: string;
  }>;
  framework?: {
    version: string;
  };
  flags?: { definitions: FlagDefinitions };
}

export type BuildResultV2 = BuildResultV2Typical | BuildResultBuildOutput;

export interface BuildResultV3 {
  // TODO: use proper `Route` type from `routing-utils` (perhaps move types to a common package)
  routes?: any[];
  output: Lambda | EdgeFunction;
}

export type BuildV2 = (options: BuildOptions) => Promise<BuildResultV2>;
export type BuildV3 = (options: BuildOptions) => Promise<BuildResultV3>;
export type PrepareCache = (options: PrepareCacheOptions) => Promise<Files>;
export type Diagnostics = (options: BuildOptions) => Promise<Files>;
export type ShouldServe = (
  options: ShouldServeOptions
) => boolean | Promise<boolean>;
export type StartDevServer = (
  options: StartDevServerOptions
) => Promise<StartDevServerResult>;

/**
 * TODO: The following types will eventually be exported by a more
 *       relevant package.
 */
type FlagJSONArray = ReadonlyArray<FlagJSONValue>;

type FlagJSONValue =
  | string
  | boolean
  | number
  | null
  | FlagJSONArray
  | { [key: string]: FlagJSONValue };

type FlagOption = {
  value: FlagJSONValue;
  label?: string;
};

export interface FlagDefinition {
  options?: FlagOption[];
  origin?: string;
  description?: string;
}

export type FlagDefinitions = Record<string, FlagDefinition>;

export interface Chain {
  /**
   * The build output to use that references the lambda that will be used to
   * append to the response.
   */
  outputPath: string;

  /**
   * The headers to send when making the request to append to the response.
   */
  headers: Record<string, string>;
}

/**
 * CloudEvent trigger definition for HTTP protocol binding.
 * Defines what types of CloudEvents this Lambda can receive as an HTTP endpoint.
 *
 * @see https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
 * @see https://github.com/cloudevents/spec/blob/main/cloudevents/bindings/http-protocol-binding.md
 * @see https://github.com/cloudevents/spec/blob/main/subscriptions/spec.md
 */
export interface CloudEventTrigger {
  /** Vercel trigger specification version - must be 1 (REQUIRED) */
  triggerVersion: 1;

  /** CloudEvents specification version - must be "1.0" (REQUIRED) */
  specversion: '1.0';

  /** Event type pattern this trigger handles (REQUIRED) */
  type: string;

  /** HTTP binding configuration (REQUIRED) */
  httpBinding: {
    /** HTTP binding mode - only structured mode is supported (REQUIRED) */
    mode: 'structured';

    /** HTTP method for this trigger endpoint (OPTIONAL, default: 'POST') */
    method?: 'GET' | 'POST' | 'HEAD';

    /** HTTP pathname for this trigger endpoint (OPTIONAL) */
    pathname?: string;
  };

  /**
   * Delivery configuration hints for trigger execution (OPTIONAL)
   *
   * These are HINTS that the trigger system MAY use to optimize execution,
   * but they are NOT guarantees. The system may disregard these settings.
   *
   * IMPORTANT: Regardless of these settings, callers maintain synchronous
   * event-response guarantees. HTTP requests to this trigger will receive
   * immediate responses, not asynchronous acknowledgments.
   */
  delivery?: {
    /**
     * HINT: Suggested maximum number of concurrent executions for this trigger.
     * Useful for system-initiated triggers like webhooks or pubsub events.
     * The system MAY ignore this hint if resource constraints require it.
     * Behavior when not specified depends on the sender system's defaults.
     */
    maxConcurrency?: number;

    /**
     * HINT: Suggested maximum number of retry attempts for failed executions.
     * The system MAY implement different retry behavior or disable retries entirely.
     * NOTE: Retries do NOT affect the synchronous response to the original caller.
     * Behavior when not specified depends on the sender system's defaults.
     */
    maxAttempts?: number;

    /**
     * HINT: Suggested delay in seconds before retrying failed executions.
     * The system MAY use different timing or backoff strategies.
     * Behavior when not specified depends on the sender system's defaults.
     */
    retryAfterSeconds?: number;
  };
}
