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
import type { Framework } from '@vercel/frameworks';

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
  framework?: string;
  builder: Builder;
  buildCommand?: string;
  installCommand?: string;
  runtime?: string;
  /* Web service config */
  routePrefix?: string;
  /* Cron service config */
  schedule?: string;
  /* Worker service config */
  topic?: string;
  consumer?: string;
}

export interface DetectServicesOptions {
  fs: DetectorFilesystem;
  /**
   * Working directory path (relative to fs root).
   * If provided, vercel.json is read from this path.
   */
  workPath?: string;
  /** Framework list for auto-detection */
  frameworkList?: readonly Framework[];
}

export interface ServicesRoutes {
  /** Rewrite routes for non-root services */
  rewrites: Route[];
  /** Default routes (catch-all for root service) */
  defaults: Route[];
}

export interface DetectServicesResult {
  services: ResolvedService[];
  /** How these services were discovered */
  source: 'configured' | 'detected';
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

export interface DetectedManifest {
  /** Full path to the manifest file (relative to project root) */
  path: string;
  /** Directory containing the manifest */
  directory: string;
  /** Runtime associated with this manifest */
  runtime: ServiceRuntime;
  /** The manifest filename */
  file: string;
}

export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/node',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
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
};
