import type { DependencySource } from './requirement';

export interface UvConfigWorkspace {
  members?: string[];
  exclude?: string[];
}

/**
 * Index entry for tool.uv.index configuration.
 */
export interface UvIndexEntry {
  name: string;
  url: string;
  /** Mark this index as the default (replaces PyPI) */
  default?: boolean;
  /** Mark this index as explicit (must be explicitly referenced per-package) */
  explicit?: boolean;
}

/**
 * Configuration for [tool.uv] section in pyproject.toml.
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
  [key: string]: unknown;
}
