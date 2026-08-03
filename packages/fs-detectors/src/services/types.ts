import type { Rewrite, Route } from '@vercel/routing-utils';
import type {
  DetectEntrypointFn,
  EnvVar,
  EnvVars,
  ExperimentalServiceConfig,
  ExperimentalServiceV2Config,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ExperimentalServicesV2,
  ExperimentalServiceV2Binding,
  ServiceBinding,
  ServiceConfig,
  Services,
  ExperimentalService,
  ExperimentalServiceV2,
  ServiceRuntime,
  ServiceType,
  ServiceRefEnvVar,
  Service,
  Builder,
} from '@vercel/build-utils';
import { isBuildpackRuntimeEnabled } from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

export type {
  DetectEntrypointFn,
  EnvVar,
  EnvVars,
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ExperimentalServiceV2Config,
  ExperimentalServicesV2,
  ExperimentalServiceV2Binding,
  ServiceBinding,
  ServiceConfig,
  Services,
  ExperimentalService,
  ExperimentalServiceV2,
  ServiceRuntime,
  ServiceType,
  ServiceRefEnvVar,
  Service,
  Builder,
};

/**
 * @deprecated Use `Service` instead
 */
export type ResolvedService = Service;

export interface DetectServicesOptions {
  fs: DetectorFilesystem;
  configuredServices?: ConfiguredServices;
  configuredServicesType?: ConfiguredServicesType;
  /**
   * Working directory path (relative to fs root).
   * If provided, vercel.json is read from this path.
   */
  workPath?: string;
  /**
   * Optional callback that, given a candidate service directory and its
   * detected framework, returns a normalized entrypoint (file path or
   * `module:attr` reference). Used to suggested service configs.
   */
  detectEntrypoint?: DetectEntrypointFn;
}

export interface ServicesRoutes {
  /** Host-based rewrite routes for subdomain-mounted web services */
  hostRewrites: Route[];
  /** Rewrite routes for non-root web services (prefix-based) */
  rewrites: Route[];
  /** Default routes (catch-all for root web service) */
  defaults: Route[];
  /** SPA fallback routes for static web services */
  fallbacks: Route[];
  /**
   * Internal routes for schedule-triggered job services.
   * These route `/_svc/{serviceName}/crons/{entry}/{handler}` to the scheduled job function.
   */
  crons: Route[];
  /**
   * Internal routes for worker services.
   * These route `/_svc/{serviceName}/workers/{entry}/{handler}` to the worker function.
   */
  workers: Route[];
}

export type ConfiguredServicesType =
  | 'experimentalServices'
  | 'services'
  | 'experimentalServicesV2';
export type ConfiguredServices = ExperimentalServices | Services;

/**
 * A single service entry inferred from project structure.
 *
 * This is an intermediate format produced by auto-detection — it carries
 * the detection results (including `mountPath`, the inferred route mount
 * point) before they are converted into a concrete config format (V1 or V2).
 */
export interface InferredServiceConfig {
  /** Service root directory relative to the project root. */
  root: string;
  /** Framework slug, if detected. */
  framework?: string;
  /** Service entrypoint (file path or `module:attr` reference). */
  entrypoint?: string;
  /** Runtime identifier (e.g. "python", "node"). */
  runtime?: string;
  /** Service type (e.g. "web", "cron", "worker"). */
  type?: ServiceType;
  /** Build command override. */
  buildCommand?: string;
  /** Pre-deploy command override. */
  preDeployCommand?: string;
  /**
   * Inferred route mount path for this service.
   * For example, `"/"` for the root frontend, `"/_/backend"` for a backend.
   */
  mountPath?: string;
}

export type InferredServicesConfig = Record<string, InferredServiceConfig>;

export interface ResolvedServicesResult {
  services: Service[];
  source: DetectServicesSource;
  useImplicitEnvInjection: boolean;
  routes: ServicesRoutes;
  /** Top-level service-targeted rewrites (V2). */
  rewrites: Rewrite[];
  /** V2 services config for the build output, so the platform activates V2 routing. */
  experimentalServicesV2?: Services;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

export interface InferredServicesResult {
  source: 'layout' | 'procfile' | 'railway' | 'render';
  config: InferredServicesConfig;
  services: Service[];
  warnings: ServiceDetectionWarning[];
}

export interface DetectServicesResult extends ResolvedServicesResult {
  /**
   * Source of service definitions:
   * - `configured`: loaded from explicit project configuration (`vercel.json#experimentalServices`, `vercel.json#services`, or the deprecated `vercel.json#experimentalServicesV2` alias)
   * - `auto-detected`: inferred from project structure
   */
  // TODO: replace consumption of top-level fields with these nested objects in caller before removal of top-level fields.
  /* Resolved services used by build/dev flows. */
  resolved: ResolvedServicesResult;
  /* Inferred services that can be migrated into project config. */
  inferred: InferredServicesResult | null;
}

export type DetectServicesSource = 'configured' | 'auto-detected';

export interface ServiceDetectionWarning {
  code: string;
  message: string;
  serviceName?: string;
}

export interface ServiceDetectionError {
  code: string;
  message: string;
  serviceName?: string;
}

/**
 * Builder per runtime in services mode. The map doubles as the set of valid
 * `runtime` values (`config.runtime in RUNTIME_BUILDERS`). It is consulted
 * only by services detection — framework-null `api/**` functions resolve
 * their Lambda builders (e.g. `@vercel/ruby`) through builds-and-routes
 * detection instead and are unaffected by these entries.
 *
 * Runtimes in {@link toBuildpackRuntime}'s set are rerouted to
 * `@vercel/container` when buildpacks are enabled, before these entries are
 * consulted.
 */
export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/backends',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
  container: '@vercel/container',
};

/**
 * Runtimes whose services build the whole service root into a container
 * image with Cloud Native Buildpacks via `@vercel/container` (builder src is
 * the `<detect>` sentinel; no entrypoint file is required or resolved).
 * There is no Lambda services path for them and no per-language builder
 * package should be created (a future `java` entry would also build with
 * `@vercel/container`).
 *
 * Adding a language here requires a matching descriptor in
 * `@vercel/container`'s buildpack registry (`src/buildpacks/registry.ts`);
 * a parity test in that package keeps the two in sync.
 */
export const BUILDPACK_RUNTIMES: ReadonlySet<ServiceRuntime> = new Set([
  'ruby',
]);

/**
 * The buildpack runtime for `runtime`, or `undefined` when the runtime is
 * not buildpack-backed or its experiment flag
 * (`VERCEL_EXPERIMENTAL_BUILDPACK_<RUNTIME>=1`, e.g.
 * `VERCEL_EXPERIMENTAL_BUILDPACK_RUBY=1`) is not enabled. While disabled,
 * buildpack-backed runtimes keep their legacy {@link RUNTIME_BUILDERS}
 * behavior.
 */
export function toBuildpackRuntime(
  runtime: ServiceRuntime | undefined
): ServiceRuntime | undefined {
  return runtime !== undefined &&
    BUILDPACK_RUNTIMES.has(runtime) &&
    isBuildpackRuntimeEnabled(runtime)
    ? runtime
    : undefined;
}

export const RUNTIME_MANIFESTS: Partial<Record<ServiceRuntime, string[]>> = {
  node: ['package.json'],
  python: [
    'pyproject.toml',
    'requirements.txt',
    'Pipfile',
    'pylock.yml',
    'uv.lock',
    'setup.py',
  ],
  go: ['go.mod'],
  ruby: ['Gemfile'],
  rust: ['Cargo.toml'],
};

export const ENTRYPOINT_EXTENSIONS: Record<string, ServiceRuntime> = {
  '.ts': 'node',
  '.mts': 'node',
  '.js': 'node',
  '.mjs': 'node',
  '.cjs': 'node',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.ru': 'ruby',
};

/**
 * Builders that produce static output (SPAs, static sites).
 * These don't have a "runtime" - they just build to static files.
 */
export const STATIC_BUILDERS = new Set([
  '@vercel/static-build',
  '@vercel/static',
]);

/**
 * Builders that produce their own full route table with handle phases
 * (filesystem, miss, rewrite, hit, error).
 *
 * In services mode we generally avoid generating synthetic catch-all routes
 * for builders that provide their own routing. At service-detection time we
 * only have the builder "use" string (not the loaded module), so this is an
 * explicit allow-list for known route-table builders.
 *
 * NOTE: This is an explicit positive set because we can't check
 * `builder.version` at service detection time.
 */
export const ROUTE_OWNING_BUILDERS = new Set([
  '@vercel/next',
  '@vercel/backends',
]);
