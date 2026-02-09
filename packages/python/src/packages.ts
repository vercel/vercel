import fs from 'fs';
import { debug } from '@vercel/build-utils';
import { parseUvLockFile, UvLockPackage } from './uv';

/**
 * Read the project name from a pyproject.toml file.
 * Returns undefined if the file doesn't exist or the name cannot be parsed.
 *
 * @param pyprojectPath Path to the pyproject.toml file
 * @returns The project name, or undefined if not found
 */
export async function getProjectNameFromPyproject(
  pyprojectPath: string
): Promise<string | undefined> {
  if (!fs.existsSync(pyprojectPath)) {
    debug(`pyproject.toml not found at ${pyprojectPath}`);
    return undefined;
  }

  try {
    const content = await fs.promises.readFile(pyprojectPath, 'utf8');

    // Look for name in [project] section
    // Simple regex parser for: name = "project-name" or name = 'project-name'
    const nameMatch = content.match(
      /\[project\][\s\S]*?^name\s*=\s*["']([^"']+)["']/m
    );
    if (nameMatch) {
      debug(`Found project name in pyproject.toml: ${nameMatch[1]}`);
      return nameMatch[1];
    }

    debug('Could not find project name in pyproject.toml');
    return undefined;
  } catch (err) {
    debug(`Failed to read pyproject.toml: ${err}`);
    return undefined;
  }
}

/**
 * Result of package classification.
 */
export interface PackageClassification {
  /** Packages that should be bundled (private packages) */
  privatePackages: string[];
  /** Packages that can be installed at runtime (public PyPI packages) */
  publicPackages: string[];
  /** Package name to version mapping for generating requirements */
  packageVersions: Record<string, string>;
}

/**
 * Known PyPI registry URL patterns.
 * Packages from these sources are considered "public" and safe to install at runtime.
 */
const PYPI_REGISTRY_PATTERNS = [
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
  return PYPI_REGISTRY_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Check if a package source indicates it's a private package.
 * Private packages are those from:
 * - Non-PyPI registry URLs (private PyPI mirrors, custom indexes)
 * - Git repositories
 * - Local file paths
 * - Editable installs
 */
function isPrivatePackageSource(source: UvLockPackage['source']): boolean {
  if (!source) return false; // No source means PyPI default

  // Git sources are private
  if (source.git) return true;

  // Local paths are private
  if (source.path) return true;

  // Editable installs are private
  if (source.editable) return true;

  // URL sources (direct URLs) are private
  if (source.url) return true;

  // Check registry - non-PyPI registries are private
  if (source.registry && !isPublicPyPIRegistry(source.registry)) {
    return true;
  }

  return false;
}

/**
 * Options for classifying packages.
 */
export interface ClassifyPackagesOptions {
  /** Path to the uv.lock file */
  lockPath: string;
  /** Package names to exclude from classification (e.g., the project's own package) */
  excludePackages?: string[];
}

/**
 * Classify packages from a uv.lock file into private and public categories.
 *
 * Private packages (always bundled):
 * - Packages from non-PyPI registries (private mirrors, custom indexes)
 * - Packages from git repositories
 * - Packages from local file paths
 * - Editable installs
 *
 * Public packages (can be runtime-installed):
 * - Packages from PyPI (https://pypi.org)
 *
 * @param options Classification options including lock path and packages to exclude
 * @returns Classification of packages into private and public
 */
export async function classifyPackages(
  options: ClassifyPackagesOptions
): Promise<PackageClassification> {
  const { lockPath, excludePackages = [] } = options;
  const privatePackages: string[] = [];
  const publicPackages: string[] = [];
  const packageVersions: Record<string, string> = {};

  // Normalize excluded package names for comparison (PEP 503)
  const normalizePackageName = (name: string): string =>
    name.toLowerCase().replace(/[-_.]+/g, '-');

  const excludeSet = new Set(excludePackages.map(normalizePackageName));

  if (!fs.existsSync(lockPath)) {
    debug(
      `Lock file not found at ${lockPath}, treating all packages as public`
    );
    return { privatePackages, publicPackages, packageVersions };
  }

  try {
    const lockFile = await parseUvLockFile(lockPath);

    for (const pkg of lockFile.package || []) {
      // Skip excluded packages (e.g., the project's own package)
      if (excludeSet.has(normalizePackageName(pkg.name))) {
        debug(`Package "${pkg.name}" excluded from classification`);
        continue;
      }

      packageVersions[pkg.name] = pkg.version;

      if (isPrivatePackageSource(pkg.source)) {
        privatePackages.push(pkg.name);
        debug(
          `Package "${pkg.name}" classified as PRIVATE (source: ${JSON.stringify(pkg.source)})`
        );
      } else {
        publicPackages.push(pkg.name);
        debug(`Package "${pkg.name}" classified as PUBLIC`);
      }
    }
  } catch (err) {
    debug(`Failed to parse uv.lock file: ${err}`);
    // On parse failure, treat all as public (safer - will be installed at runtime)
  }

  return { privatePackages, publicPackages, packageVersions };
}

/**
 * Generate a requirements.txt content for runtime installation.
 * Only includes public packages that will be installed at runtime.
 *
 * @param classification Package classification result
 * @returns Requirements file content
 */
export function generateRuntimeRequirements(
  classification: PackageClassification
): string {
  const lines: string[] = [
    '# Auto-generated requirements for runtime installation',
    '# These packages were excluded from the Lambda bundle due to size constraints',
    '# and will be installed at runtime using uv.',
    '#',
    '# Private packages are bundled in _vendor and are NOT listed here.',
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
