import type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroup,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
} from '@vercel/build-utils';
import type { DetectorFilesystem } from '../detectors/filesystem';

export type {
  ExperimentalServiceConfig,
  ExperimentalServiceGroup,
  ExperimentalServiceGroups,
  ExperimentalServices,
  ServiceRuntime,
  ServiceType,
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
  builder?: string;
  buildCommand?: string;
  installCommand?: string;
  /* Lambda config */
  runtime?: string;
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

export const RUNTIME_BUILDERS: Record<ServiceRuntime, string> = {
  node: '@vercel/node',
  python: '@vercel/python',
  go: '@vercel/go',
  rust: '@vercel/rust',
  ruby: '@vercel/ruby',
};
