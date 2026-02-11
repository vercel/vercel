/**
 * Re-exports from @vercel/python-analysis for package classification.
 *
 * This module provides utilities for classifying packages from a uv.lock file
 * as public (from PyPI) or private (from git, local paths, or private registries).
 */

export {
  classifyPackages,
  generateRuntimeRequirements,
  normalizePackageName,
  parseUvLock,
  type ClassifyPackagesOptions,
  type PackageClassification,
  type UvLockFile,
  type UvLockPackage,
  type UvLockPackageSource,
} from '@vercel/python-analysis';
