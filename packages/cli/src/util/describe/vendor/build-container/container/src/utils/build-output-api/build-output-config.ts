// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { BuildResultV2Typical, Service } from '@vercel/build-utils';

/**
 *  Build Output API `config.json` file interface.
 */
export interface BuildOutputConfig {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<
    string,
    { contentType?: string; mode?: number; path?: string }
  >;
  framework?: {
    slug: string;
    version: string;
  };
  crons?: { schedule: string; path: string }[];
  schedules?: BuildOutputSchedule[];
  /** @deprecated In its own file now */
  flags?: {
    key: string;
    defaultValue?: unknown;
    metadata: Record<string, unknown>;
  }[];
  /**
   * User-configured deployment ID for skew protection.
   * This allows users to specify a custom deployment identifier
   * in their next.config.js that will be used for version skew protection
   * with pre-built deployments.
   * @example "abc123"
   */
  deploymentId?: string;
  /**
   * Services detected during build from vercel.json experimentalServices
   * or auto-detected from project structure.
   * Used to inject service URLs as environment variables at runtime.
   */
  services?: Service[];
  experimentalServicesV2?: ExperimentalServicesV2WithBindings;
}

type BuildOutputSchedule =
  | ({
      name?: string;
      schedule: string;
      timezone?: string;
      jitter?: number;
    } & ScheduleTarget)
  | {
      name: string;
      expression: { cron: string; jitter?: number };
      target: ScheduleTarget;
      timezone?: string;
    };

type ScheduleTarget =
  | { function: string }
  | { path: string; requestMethod?: 'GET' | 'POST' }
  | { topic: string };

export interface ServiceBinding {
  type: 'service';
  service: string;
  format: 'url';
  env: string;
}

export type ExperimentalServicesV2WithBindings = Record<
  string,
  | { root: string; bindings?: readonly ServiceBinding[] }
  | { root?: undefined; bindings?: undefined }
>;
