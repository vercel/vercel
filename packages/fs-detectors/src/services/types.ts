import type { Route } from '@vercel/routing-utils';
import type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Service,
  Builder,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

export type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Service,
  Builder,
};

/**
 * @deprecated Use `Service` instead
 */
export type ResolvedService = Service;

export interface DetectServicesOptions {
  fs: DetectorFilesystem;
  /**
   * Working directory path (relative to fs root).
   * If provided, vercel.json is read from this path.
   */
  workPath?: string;
}

export interface ServicesRoutes {
  /** Rewrite routes for non-root web services (prefix-based) */
  rewrites: Route[];
  /** Default routes (catch-all for root web service) */
  defaults: Route[];
  /**
   * Internal routes for cron services.
   * These route `/_svc/{serviceName}/crons/{entry}/{handler}` to the cron function.
   * TODO: Implement
   */
  crons: Route[];
  /**
   * Internal routes for worker services.
   * These route `/_svc/{serviceName}/workers/{entry}/{handler}` to the worker function.
   * TODO: Implement
   */
  workers: Route[];
}

export interface DetectServicesResult {
  services: Service[];
  /** Routing rules derived from services */
  routes: ServicesRoutes;
  errors: ServiceDetectionError[];
  warnings: ServiceDetectionWarning[];
}

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

export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/node',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
};

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
