import toml from 'smol-toml';
import type { PyProjectToml } from './pyproject/types';

/**
 * Serialize a PyProjectToml to TOML string format.
 */
export function stringifyManifest(data: PyProjectToml): string {
  return toml.stringify(data);
}

/**
 * Options for creating a minimal pyproject.toml structure.
 */
export interface CreateMinimalManifestOptions {
  /** Project name (defaults to 'app'). */
  name?: string;
  /** Project version (defaults to '0.1.0'). */
  version?: string;
  /** Python version constraint (e.g., '>=3.12' or '~=3.12.0'). */
  requiresPython?: string;
  /** Initial dependencies. */
  dependencies?: string[];
}

/**
 * Create a minimal PyProjectToml structure for projects without a manifest.
 */
export function createMinimalManifest(
  options: CreateMinimalManifestOptions = {}
): PyProjectToml {
  const {
    name = 'app',
    version = '0.1.0',
    requiresPython,
    dependencies = [],
  } = options;

  return {
    project: {
      name,
      version,
      ...(requiresPython && { 'requires-python': requiresPython }),
      dependencies,
      classifiers: ['Private :: Do Not Upload'],
    },
  };
}
