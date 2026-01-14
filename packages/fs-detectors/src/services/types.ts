/**
 * Service detection types and constants.
 */

import type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Builder,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

// ═══════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════

export type {
  ExperimentalServiceConfig,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
  Builder,
};

// ═══════════════════════════════════════════════════════════════════════════
// Service Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ResolvedService {
  name: string;
  type: ServiceType;
  /* build config */
  workspace: string;
  entrypoint: string;
  framework?: string;
  builder: Builder;
  buildCommand?: string;
  installCommand?: string;
  /* Lambda config */
  runtime?: string;
  runtimeFamily?: ServiceRuntime;
  memory?: number;
  maxDuration?: number;
  includeFiles?: string | string[];
  excludeFiles?: string | string[];
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
  workPath?: string;
  /** Explicit services from vercel.json experimentalServices */
  explicitServices?: ExperimentalServices;
}

export interface DetectServicesResult {
  services: ResolvedService[];
  errors: ServiceDetectionError[];
}

export interface ServiceDetectionError {
  code: string;
  message: string;
  serviceName?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Manifest Types
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Runtime/Builder Mappings
// ═══════════════════════════════════════════════════════════════════════════

export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/node',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
};

export const BUILDER_TO_RUNTIME: Record<string, ServiceRuntime> = {
  '@vercel/node': 'node',
  '@vercel/python': 'python',
  '@vercel/go': 'go',
  '@vercel/rust': 'rust',
  '@vercel/ruby': 'ruby',
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
