/**
 * Pure TypeScript interface definitions for Pipfile and Pipfile.lock types.
 *
 * These interfaces serve as the source of truth for types.
 * Zod schemas are generated from these using ts-to-zod.
 *
 * @module pipfile/types
 */

/**
 * Pipfile dependency detail object.
 * @passthrough
 */
export interface PipfileDependencyDetail {
  version?: string;
  hashes?: string[];
  extras?: string[] | string;
  markers?: string;
  index?: string;
  git?: string;
  ref?: string;
  editable?: boolean;
  path?: string;
}

/**
 * Pipfile dependency (string version specifier or detail object).
 */
export type PipfileDependency = string | PipfileDependencyDetail;

/**
 * Pipfile source configuration.
 * @passthrough
 */
export interface PipfileSource {
  name: string;
  url: string;
  verify_ssl?: boolean;
}

/**
 * Pipfile configuration.
 * @passthrough
 */
export interface PipfileLike {
  packages?: Record<string, PipfileDependency>;
  'dev-packages'?: Record<string, PipfileDependency>;
  source?: PipfileSource[];
  scripts?: Record<string, string>;
  /** Allow additional category keys (custom dependency groups) */
  [key: string]:
    | Record<string, PipfileDependency>
    | PipfileSource[]
    | Record<string, string>
    | undefined;
}

// =============================================================================
// Pipfile.lock types
// =============================================================================

/**
 * Pipfile.lock _meta section.
 * @passthrough
 */
export interface PipfileLockMeta {
  hash?: {
    sha256?: string;
  };
  'pipfile-spec'?: number;
  requires?: {
    python_version?: string;
    python_full_version?: string;
  };
  sources?: PipfileSource[];
}

/**
 * Pipfile.lock configuration.
 *
 * Note: This schema allows additional category keys (like custom dependency groups)
 * which can contain package dictionaries.
 * @passthrough
 */
export interface PipfileLockLike {
  _meta?: PipfileLockMeta;
  default?: Record<string, PipfileDependencyDetail>;
  develop?: Record<string, PipfileDependencyDetail>;
  /** Allow additional category keys (custom dependency groups) */
  [key: string]:
    | PipfileLockMeta
    | Record<string, PipfileDependencyDetail>
    | undefined;
}
