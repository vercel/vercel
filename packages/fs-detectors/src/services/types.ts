import type { Route } from '@vercel/routing-utils';
import type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Builder,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

export type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Builder,
};

export interface ResolvedService {
  name: string;
  type: ServiceType;
  /** Service group name if this service belongs to a group */
  group?: string;
  /* build config */
  workspace: string;
  entrypoint?: string;
  /** Framework slug (e.g., "nextjs", "fastapi") */
  framework?: string;
  builder: Builder;
  buildCommand?: string;
  installCommand?: string;
  /**
   * Computed effective runtime (e.g., "node", "python").
   * Only set for serverless function services, not for static builds.
   */
  runtime?: string;
  /**
   * URL path prefix for routing requests to this service.
   * Required for web services; requests matching this prefix are routed to this service.
   * Root services use "/" as the catch-all.
   */
  routePrefix?: string;
  /* Cron service config */
  schedule?: string;
  /* Worker service config */
  topic?: string;
  consumer?: string;
  /**
   * Whether this service produces static output (SPAs, static sites).
   * Static services use @vercel/static-build or @vercel/static.
   */
  isStaticBuild: boolean;
}

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
  services: ResolvedService[];
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

/**
 * Builders that produce static output (SPAs, static sites).
 * These don't have a "runtime" - they just build to static files.
 */
export const STATIC_BUILDERS = new Set([
  '@vercel/static-build',
  '@vercel/static',
]);

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
};

/**
 * Builders that produce static output (SPAs, static sites).
 * These don't have a "runtime" - they just build to static files.
 */
export const STATIC_BUILDERS = new Set([
  '@vercel/static-build',
  '@vercel/static',
]);
