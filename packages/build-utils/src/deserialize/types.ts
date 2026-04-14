import type { EdgeFunction } from '../edge-function';
import type FileFsRef from '../file-fs-ref';
import type { Lambda } from '../lambda';
import type { NodejsLambda } from '../nodejs-lambda';
import type { Prerender } from '../prerender';
import type { BuildResultV2Typical, FlagDefinitions, Service } from '../types';

export interface DeploymentFlags {
  definitions: FlagDefinitions;
}

/**
 * Note: type is not yet complete and will be more restrictive.
 * @deprecated Replaced by variants.
 */
export interface DeploymentFlagLegacy {
  key: string;
  defaultValue?: unknown;
  metadata: Record<string, unknown>;
}

/**
 * Additional lambda metadata used by existing callers when a function is
 * provisioned outside of Vercel infrastructure.
 */
export interface ExternalConfig {
  awsAccountId: string;
  digest: string;
  size: number;
}

/**
 * Maps a type to a new type that does not contain any functions on it.
 * Useful for typing serialized `class` types, which will not contain
 * functions when serialized to JSON.
 */
export type Properties<T> = {
  [P in keyof T as T[P] extends (...args: any[]) => any ? never : P]: T[P];
};

type FilesMapProp = {
  filePathMap?: Record<string, string>;
};

/**
 * Type for the `.vc-config.json` file of a serialized `Lambda` instance.
 */
export type SerializedLambda = Properties<Omit<Lambda, 'files' | 'zipBuffer'>> &
  FilesMapProp & {
    external?: ExternalConfig;
  };

/**
 * Type for the `.vc-config.json` file of a serialized `NodejsLambda` instance.
 */
export type SerializedNodejsLambda = Properties<
  Omit<NodejsLambda, 'files' | 'zipBuffer'>
> &
  FilesMapProp & {
    external?: ExternalConfig;
  };

export type SerializedFileFsRef = Properties<FileFsRef>;

export type SerializedPrerender = Properties<
  Omit<Prerender, 'lambda' | 'fallback'>
> & {
  fallback: SerializedFileFsRef | null;
};

export type SerializedEdgeFunction = Properties<
  Omit<EdgeFunction, 'name' | 'files' | 'deploymentTarget'>
> &
  FilesMapProp;

export interface PathOverride {
  contentType?: string;
  mode?: number;
  path?: string;
}

export interface BuildOutputCron {
  schedule: string;
  path: string;
}

export type BuildResultV2TypicalWithCron = BuildResultV2Typical & {
  crons?: BuildOutputCron[];
  flags?: DeploymentFlags | DeploymentFlagLegacy[];
  deploymentId?: string;
  meta?: {
    hasServerActions?: boolean;
  };
};

/**
 * Build Output API `config.json` file interface.
 */
export interface BuildOutputConfig {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<string, PathOverride>;
  framework?: {
    version: string;
  };
  crons?: BuildOutputCron[];
  /** @deprecated In its own file now */
  flags?: DeploymentFlagLegacy[];
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
}
