/**
 * Pure TypeScript interface definitions for uv configuration types.
 *
 * These interfaces serve as the source of truth for types.
 * Zod schemas are generated from these using ts-to-zod.
 *
 * @module uv-config/types
 */

import type { DependencySource } from '../requirement/types';

/**
 * uv workspace configuration.
 * @passthrough
 */
export interface UvConfigWorkspace {
  members?: string[];
  exclude?: string[];
}

/**
 * uv index entry configuration.
 * @passthrough
 */
export interface UvIndexEntry {
  name: string;
  url: string;
  /** Mark this index as the default (replaces PyPI) */
  default?: boolean;
  /** Mark this index as explicit (must be explicitly referenced per-package) */
  explicit?: boolean;
  /** Index format: omit for standard (PEP 503), or "flat" for flat indexes (--find-links) */
  format?: string;
}

/**
 * [tool.uv] section in pyproject.toml or uv.toml.
 * @passthrough
 */
export interface UvConfig {
  /**
   * Dependency sources mapping package names to their source configurations.
   * Used for git, path, and custom index sources.
   */
  sources?: Record<string, DependencySource | DependencySource[]>;
  /**
   * Custom package indexes.
   */
  index?: UvIndexEntry[];
  /**
   * Workspace configuration.
   */
  workspace?: UvConfigWorkspace;
}
