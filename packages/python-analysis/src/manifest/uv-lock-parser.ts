// Parser for uv.lock files.
import toml from 'smol-toml';
import { PythonAnalysisError } from '../util/error';

/**
 * A source of a package in a uv.lock file
 */
export interface UvLockPackageSource {
  registry?: string;
  url?: string;
  git?: string;
  path?: string;
  editable?: string;
  virtual?: string;
}

/**
 * A package entry from a parsed uv.lock file.
 */
export interface UvLockPackage {
  name: string;
  version: string;
  source?: UvLockPackageSource;
}

/**
 * Parsed uv.lock file structure.
 */
export interface UvLockFile {
  version?: number;
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
 * @param content - The raw content of the uv.lock file
 * @param path - Optional path to the file for error reporting
 */
export function parseUvLock(content: string, path?: string): UvLockFile {
  let parsed: UvLockToml;
  try {
    parsed = toml.parse(content) as UvLockToml;
  } catch (error: unknown) {
    throw new PythonAnalysisError({
      message: `Could not parse uv.lock: ${error instanceof Error ? error.message : String(error)}`,
      code: 'PYTHON_UV_LOCK_PARSE_ERROR',
      path,
      fileContent: content,
    });
  }

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
  privatePackages: string[];
  publicPackages: string[];
  packageVersions: Record<string, string>;
}

/**
 * Normalize a Python package name according to PEP 503.
 */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Options for classifying packages.
 */
export interface ClassifyPackagesOptions {
  lockFile: UvLockFile;
  excludePackages?: string[];
}

/**
 * Classify packages from a uv.lock file into private and public categories.
 *
 * This is used for determining which packages can be installed from PyPI
 * at runtime vs. which must be bundled with the deployment.
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
