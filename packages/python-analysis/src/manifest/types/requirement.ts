/**
 * Shared types for Python dependency parsers (requirements.txt, Pipfile, etc.)
 */

/**
 * Source information for a dependency (git, path, or index).
 * Used in [tool.uv.sources] in pyproject.toml.
 */
export interface DependencySource {
  /** Index name for the dependency (e.g., "private-pypi") */
  index?: string;
  /** Git repository URL */
  git?: string;
  /** Git revision (branch, tag, or commit hash) */
  rev?: string;
  /** Local path to the dependency */
  path?: string;
  /** Whether the dependency is installed in editable mode */
  editable?: boolean;
}

/**
 * A normalized representation of a Python dependency.
 * This is the common format used by all parsers before converting to PEP 508 format.
 */
export interface NormalizedRequirement {
  /** Package name (e.g., "requests") */
  name: string;
  /** Version specifier (e.g., ">=1.0,<2.0") */
  version?: string;
  /** Extra features (e.g., ["security", "socks"]) */
  extras?: string[];
  /** Environment markers (e.g., "python_version >= '3.8'") */
  markers?: string;
  /** Direct URL for the package */
  url?: string;
  /** Hash digests for verification (e.g., ["sha256:abc123..."]) */
  hashes?: string[];
  /** Source information for uv (git, path, or index) */
  source?: DependencySource;
}

/**
 * Parsed hash digest for a requirement.
 * Format: algorithm:hash_value (e.g., "sha256:abc123...")
 */
export type HashDigest = string;
