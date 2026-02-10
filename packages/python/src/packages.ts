import fs from 'fs';
import toml from 'smol-toml';
import { debug } from '@vercel/build-utils';
import { parseUvLockFile, UvLockPackage } from './uv';

export interface PackageClassification {
  privatePackages: string[];
  publicPackages: string[];
  packageVersions: Record<string, string>;
}

/**
 * Represents the relevant structure of a pyproject.toml file for extracting the project name.
 */
interface PyprojectToml {
  project?: {
    name?: string;
  };
}

export async function getProjectNameFromPyproject(
  pyprojectPath: string
): Promise<string | undefined> {
  if (!fs.existsSync(pyprojectPath)) {
    debug(`pyproject.toml not found at ${pyprojectPath}`);
    return undefined;
  }

  try {
    const content = await fs.promises.readFile(pyprojectPath, 'utf8');
    const parsed = toml.parse(content) as PyprojectToml;

    const name = parsed.project?.name;
    if (name) {
      debug(`Found project name in pyproject.toml: ${name}`);
      return name;
    }

    debug('Could not find project name in pyproject.toml');
    return undefined;
  } catch (err) {
    debug(`Failed to parse pyproject.toml: ${err}`);
    return undefined;
  }
}

/**
 * Check if a registry URL is a public PyPI registry.
 */
function isPublicPyPIRegistry(registryUrl: string | undefined): boolean {
  const pypiRegistryPatterns = [
    'https://pypi.org',
    'https://files.pythonhosted.org',
    'pypi.org',
  ];
  if (!registryUrl) return true; // Default registry is PyPI
  const normalized = registryUrl.toLowerCase();
  return pypiRegistryPatterns.some(pattern => normalized.includes(pattern));
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
  if (!source) return false;
  if (source.git) return true;
  if (source.path) return true;
  if (source.editable) return true;
  if (source.url) return true;
  if (source.registry && !isPublicPyPIRegistry(source.registry)) {
    return true;
  }
  return false;
}

export interface ClassifyPackagesOptions {
  lockPath: string;
  excludePackages?: string[];
}

/**
 * Classify packages from a uv.lock file into private and public categories.
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
    // On parse failure, treat all as public
  }

  return { privatePackages, publicPackages, packageVersions };
}

/**
 * Generate a requirements.txt content for runtime installation.
 * Only includes public packages that will be installed at runtime.
 */
export function generateRuntimeRequirements(
  classification: PackageClassification
): string {
  const lines: string[] = [
    '# Auto-generated requirements for runtime installation',
    '# Private packages are bundled in _vendor and are not listed here.',
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
