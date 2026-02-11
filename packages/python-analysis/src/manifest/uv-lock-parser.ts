/**
 * Parser for uv.lock files.
 *
 * uv.lock is a TOML-based lock file format used by uv (https://github.com/astral-sh/uv).
 * This module provides utilities for parsing the lock file and classifying packages
 * as public (from PyPI) or private (from git, local paths, or private registries).
 *
 * @module uv-lock-parser
 */

import toml from 'smol-toml';

/**
 * Source information for a package in uv.lock.
 */
export interface UvLockPackageSource {
  /** Registry URL (e.g., "https://pypi.org/simple") */
  registry?: string;
  /** Direct URL for the package */
  url?: string;
  /** Git repository URL */
  git?: string;
  /** Local file path */
  path?: string;
  /** Editable install path */
  editable?: string;
  /** Virtual package marker (for the project itself) */
  virtual?: string;
}

/**
 * A package entry from a parsed uv.lock file.
 */
export interface UvLockPackage {
  /** Package name (e.g., "requests") */
  name: string;
  /** Pinned version (e.g., "2.31.0") */
  version: string;
  /** Source information indicating where the package comes from */
  source?: UvLockPackageSource;
}

/**
 * Parsed uv.lock file structure.
 */
export interface UvLockFile {
  /** Lock file format version */
  version?: number;
  /** List of locked packages */
  packages: UvLockPackage[];
}

/**
 * Raw TOML structure of a uv.lock file.
 */
interface UvLockToml {
  version?: number;
  package?: Array<{
    name: string;
    version: string;
    source?: UvLockPackageSource;
  }>;
}

/**
 * Parse the contents of a uv.lock file.
 *
 * @param content - Raw TOML content of the uv.lock file
 * @returns Parsed lock file structure
 * @throws Error if the content is not valid TOML
 */
export function parseUvLock(content: string): UvLockFile {
  const parsed = toml.parse(content) as UvLockToml;

  const packages: UvLockPackage[] = (parsed.package ?? [])
    .filter(pkg => pkg.name && pkg.version)
    .map(pkg => ({
      name: pkg.name,
      version: pkg.version,
      source: pkg.source,
    }));

  return { version: parsed.version, packages };
}

/**
 * Known public PyPI registry URL patterns.
 */
const PUBLIC_PYPI_PATTERNS = [
  'https://pypi.org',
  'https://files.pythonhosted.org',
  'pypi.org',
];

/**
 * Check if a registry URL is a public PyPI registry.
 *
 * @param registryUrl - The registry URL to check
 * @returns true if the registry is public PyPI, false otherwise
 */
function isPublicPyPIRegistry(registryUrl: string | undefined): boolean {
  if (!registryUrl) return true; // Default registry is PyPI
  const normalized = registryUrl.toLowerCase();
  return PUBLIC_PYPI_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Check if a package source indicates it's a private package.
 *
 * Private packages are those from:
 * - Git repositories
 * - Local file paths
 * - Editable installs
 * - Direct URLs
 * - Non-PyPI registry URLs (private PyPI mirrors, custom indexes)
 *
 * @param source - The package source to check
 * @returns true if the package is private, false otherwise
 */
export function isPrivatePackageSource(
  source: UvLockPackageSource | undefined
): boolean {
  if (!source) return false;
  if (source.git) return true;
  if (source.path) return true;
  if (source.editable) return true;
  if (source.url) return true;
  if (source.virtual) return true; // Virtual packages are the project itself
  if (source.registry && !isPublicPyPIRegistry(source.registry)) {
    return true;
  }
  return false;
}

/**
 * Result of classifying packages from a uv.lock file.
 */
export interface PackageClassification {
  /** Package names that are from private sources (git, path, private registry, etc.) */
  privatePackages: string[];
  /** Package names that are from public PyPI */
  publicPackages: string[];
  /** Map of package names to their pinned versions */
  packageVersions: Record<string, string>;
}

/**
 * Normalize a Python package name according to PEP 503.
 *
 * Package names are case-insensitive and treat hyphens, underscores,
 * and periods as equivalent.
 *
 * @param name - The package name to normalize
 * @returns Normalized package name
 */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Options for classifying packages.
 */
export interface ClassifyPackagesOptions {
  /** Parsed uv.lock file */
  lockFile: UvLockFile;
  /** Package names to exclude from classification (e.g., the project itself) */
  excludePackages?: string[];
}

/**
 * Classify packages from a uv.lock file into private and public categories.
 *
 * This is useful for determining which packages can be installed from PyPI
 * at runtime vs. which must be bundled with the deployment.
 *
 * @param options - Classification options
 * @returns Classification result with private packages, public packages, and versions
 */
export function classifyPackages(
  options: ClassifyPackagesOptions
): PackageClassification {
  const { lockFile, excludePackages = [] } = options;
  const privatePackages: string[] = [];
  const publicPackages: string[] = [];
  const packageVersions: Record<string, string> = {};

  const excludeSet = new Set(excludePackages.map(normalizePackageName));

  for (const pkg of lockFile.packages) {
    // Skip excluded packages (e.g., the project's own package)
    if (excludeSet.has(normalizePackageName(pkg.name))) {
      continue;
    }

    packageVersions[pkg.name] = pkg.version;

    if (isPrivatePackageSource(pkg.source)) {
      privatePackages.push(pkg.name);
    } else {
      publicPackages.push(pkg.name);
    }
  }

  return { privatePackages, publicPackages, packageVersions };
}

/**
 * Generate requirements.txt content for runtime installation.
 *
 * Only includes public packages that will be installed at runtime from PyPI.
 * Private packages should be bundled separately.
 *
 * @param classification - Package classification result
 * @returns Requirements.txt formatted content
 */
export function generateRuntimeRequirements(
  classification: PackageClassification
): string {
  const lines: string[] = [
    '# Auto-generated requirements for runtime installation',
    '# Private packages are bundled separately and not listed here.',
    '',
  ];

  for (const pkgName of classification.publicPackages) {
    const version = classification.packageVersions[pkgName];
    if (version) {
      lines.push(`${pkgName}==${version}`);
    } else {
      lines.push(pkgName);
    }
  }

  return lines.join('\n');
}
