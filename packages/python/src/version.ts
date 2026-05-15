import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { NowBuildError } from '@vercel/build-utils';
import { selectPythonVersion, PythonConfigKind } from '@vercel/python-analysis';
import type { PythonBuild, PythonPackage } from '@vercel/python-analysis';
import { UvRunner, findUvInPath, UV_PYTHON_PATH_PREFIX } from './uv';
import { detectPlatform } from './utils';

export interface PythonVersion {
  // Undefined in `vercel dev` where we defer to the system `python3`.
  major?: number;
  minor?: number;
  pipPath: string;
  pythonPath: string;
  runtime: string;
  discontinueDate?: Date;
}

export interface PythonVersionResolution {
  pythonVersion: PythonVersion;
  pythonPackage: PythonPackage;
  versionSource?: string;
  /**
   * When set, the builder should write a `.python-version` file at this
   * absolute path with the selected version string.  This is returned when
   * the version was inferred from `requires-python` in `pyproject.toml`,
   * no `.python-version` already exists, and the resolved version is at or
   * below DEFAULT_PYTHON_VERSION.
   */
  pinVersionFilePath?: string;
}

export function pythonVersionString(pv: PythonVersion): string | undefined {
  if (pv.major === undefined || pv.minor === undefined) return undefined;
  return `${pv.major}.${pv.minor}`;
}

const DEFAULT_PYTHON_VERSION: PythonVersion = makePythonVersion(3, 12);
export const DEFAULT_PYTHON_VERSION_STRING: string = pythonVersionString(
  DEFAULT_PYTHON_VERSION
)!;

function makePythonVersion(
  major: number,
  minor: number,
  discontinueDate?: Date
): PythonVersion {
  return {
    major,
    minor,
    pipPath: `pip${major}.${minor}`,
    pythonPath: `python${major}.${minor}`,
    runtime: `python${major}.${minor}`,
    discontinueDate,
  };
}

// The order must be most recent first
const allOptions: PythonVersion[] = [
  makePythonVersion(3, 14),
  makePythonVersion(3, 13),
  makePythonVersion(3, 12),
  makePythonVersion(3, 11),
  makePythonVersion(3, 10),
  makePythonVersion(3, 9),
  makePythonVersion(3, 6, new Date('2022-07-18')),
];

function getDevPythonVersion(): PythonVersion {
  // Omitting major/minor lets uv resolve the interpreter via its own
  // chain (`.python-version`, managed default, system `python3`) instead
  // of the old `--python 3.0` placeholder that uv >= 0.10.11 rejects.
  return {
    pipPath: 'pip3',
    pythonPath: 'python3',
    runtime: 'python3',
  };
}

/**
 * Select the appropriate Python version for production builds when no version is specified
 * or an unsupported version is requested.
 */
export function getDefaultPythonVersion({
  isDev,
}: {
  isDev?: boolean;
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  const defaultOption = allOptions.find(
    opt => versionsEqual(opt, DEFAULT_PYTHON_VERSION) && isInstalled(opt)
  );
  if (defaultOption) {
    return defaultOption;
  }

  // Fallback to the latest installed version if the default isn't available
  const selection = allOptions.find(isInstalled);
  if (!selection) {
    throw new NowBuildError({
      code: 'PYTHON_NOT_FOUND',
      link: 'https://vercel.link/python-version',
      message: `Unable to find any supported Python versions.`,
    });
  }
  return selection;
}

function versionsEqual(a: PythonVersion, b: PythonVersion): boolean {
  return a.major === b.major && a.minor === b.minor;
}

function versionLessOrEqual(a: PythonVersion, b: PythonVersion): boolean {
  const am = a.major ?? 0;
  const bm = b.major ?? 0;
  if (am !== bm) return am < bm;
  return (a.minor ?? 0) <= (b.minor ?? 0);
}

function toPythonBuild(opt: PythonVersion): PythonBuild {
  if (opt.major === undefined || opt.minor === undefined) {
    throw new Error(
      'toPythonBuild called with PythonVersion missing `major`/`minor`; this is a bug.'
    );
  }
  const platform = detectPlatform();
  return {
    version: { major: opt.major, minor: opt.minor },
    implementation: 'cpython',
    variant: 'default',
    os: platform.os,
    architecture: platform.archName,
    libc: platform.libc,
  };
}

/**
 * Build the list of available Python builds for selectPythonVersion().
 *
 * Ordered with DEFAULT_PYTHON_VERSION first, then remaining versions in
 * descending order. Only includes installed, non-discontinued versions.
 * This preserves the "3.12 preferred" behavior since selectPythonVersion
 * returns the first match.
 */
function getAvailablePythonBuilds(): PythonBuild[] {
  const installed = allOptions.filter(
    opt => !isDiscontinued(opt) && isInstalled(opt)
  );
  const defaultOpt = installed.find(opt =>
    versionsEqual(opt, DEFAULT_PYTHON_VERSION)
  );
  const rest = installed.filter(
    opt => !versionsEqual(opt, DEFAULT_PYTHON_VERSION)
  );
  const ordered = defaultOpt ? [defaultOpt, ...rest] : rest;
  return ordered.map(toPythonBuild);
}

/**
 * Build the list of ALL known Python builds (including discontinued
 * and not-installed), used for producing better error diagnostics.
 */
function getAllPythonBuilds(): PythonBuild[] {
  return allOptions.map(toPythonBuild);
}

/**
 * Map a python-analysis PythonBuild back to a local PythonVersion entry.
 */
function getPythonVersionForBuild(
  build: PythonBuild
): PythonVersion | undefined {
  return allOptions.find(
    opt =>
      opt.major === build.version.major && opt.minor === build.version.minor
  );
}

/**
 * Resolve Python version from an already-discovered PythonPackage.
 *
 * Handles isDev early return, delegates constraint matching to
 * python-analysis selectPythonVersion, and applies builder-specific
 * logging, warnings, and error handling.
 */
export function resolvePythonVersion({
  isDev,
  pythonPackage,
  rootDir,
}: {
  isDev?: boolean;
  pythonPackage: PythonPackage;
  rootDir: string;
}): PythonVersionResolution {
  if (isDev) {
    return {
      pythonVersion: getDevPythonVersion(),
      pythonPackage,
    };
  }

  const constraints = pythonPackage.requiresPython;
  const defaultPv = getDefaultPythonVersion({ isDev: false });

  let selection: PythonVersion;
  let source: string | undefined;
  let autoUpgraded = false;

  if (!constraints || constraints.length === 0) {
    console.log(
      `No Python version specified in .python-version, pyproject.toml, or Pipfile.lock. Using python version: ${pythonVersionString(defaultPv)}`
    );
    selection = defaultPv;
  } else {
    const defaultBuild = toPythonBuild(defaultPv);
    const availableBuilds = getAvailablePythonBuilds();
    const allBuilds = getAllPythonBuilds();

    const result = selectPythonVersion({
      constraints,
      availableBuilds,
      allBuilds,
      defaultBuild,
      majorMinorOnly: true,
      legacyTildeEquals: true,
    });

    source = result.source;
    selection = getPythonVersionForBuild(result.build) ?? defaultPv;

    // Auto-upgrade: when the constraint comes from a converted manifest
    // (e.g. Pipfile.lock) and resolves to a version below the default,
    // upgrade to the default.  Legacy projects often pin old versions
    // that are incompatible with the builder's runtime requirements.
    if (
      pythonPackage.manifest?.origin &&
      !result.notAvailable &&
      !result.invalidConstraint &&
      !versionLessOrEqual(defaultPv, selection)
    ) {
      const originalVersion = pythonVersionString(selection);
      selection = defaultPv;
      autoUpgraded = true;
      console.log(
        `Python version ${originalVersion} detected in ${source} is below the minimum supported version. Using python version: ${pythonVersionString(selection)}`
      );
    } else if (result.notAvailable) {
      const npv = getPythonVersionForBuild(result.notAvailable.build);
      if (npv && isDiscontinued(npv)) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
          link: 'https://vercel.link/python-version',
          message: `Python version "${pythonVersionString(npv)}" detected in ${source} is discontinued and must be upgraded.`,
        });
      }
      if (npv) {
        console.warn(
          `Warning: Python version "${pythonVersionString(npv)}" detected in ${source} is not installed and will be ignored. https://vercel.link/python-version`
        );
      }
      console.log(`Using python version: ${pythonVersionString(selection)}`);
    } else if (result.invalidConstraint) {
      console.warn(
        `Warning: Python version "${result.invalidConstraint.versionString}" detected in ${source} is invalid and will be ignored. https://vercel.link/python-version`
      );
      console.log(`Using python version: ${pythonVersionString(selection)}`);
    } else {
      console.log(
        `Using Python ${pythonVersionString(selection)} from ${source}`
      );
    }
  }

  if (isDiscontinued(selection)) {
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'https://vercel.link/python-version',
      message: `Python version "${pythonVersionString(selection)}" declared in project configuration is discontinued and must be upgraded.`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    const srcSuffix = source ? `detected in ${source}` : 'selected by runtime';
    console.warn(
      `Error: Python version "${pythonVersionString(selection)}" ${srcSuffix} has reached End-of-Life. Deployments created on or after ${d} will fail to build. https://vercel.link/python-version`
    );
  }

  let pinVersionFilePath: string | undefined;
  const hasPythonVersionFile =
    pythonPackage.configs?.some(
      configSet => configSet[PythonConfigKind.PythonVersion] !== undefined
    ) ?? false;

  if (
    !hasPythonVersionFile &&
    pythonPackage.manifest &&
    versionLessOrEqual(selection, defaultPv)
  ) {
    // Pin .python-version when:
    // - The version was auto-upgraded from a converted manifest (Pipfile.lock, etc.)
    // - Or the version came from requires-python in a native pyproject.toml
    if (
      autoUpgraded ||
      (!pythonPackage.manifest.origin && source?.endsWith('pyproject.toml'))
    ) {
      const manifestDir = join(rootDir, dirname(pythonPackage.manifest.path));
      pinVersionFilePath = join(manifestDir, '.python-version');
    }
  }

  return {
    pythonVersion: selection,
    pythonPackage,
    versionSource: source,
    pinVersionFilePath,
  };
}

function isDiscontinued({ discontinueDate }: PythonVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

// Cache for installed Python versions to avoid repeated calls
let installedPythonsCache: Set<string> | null = null;

/**
 * Detect installed Python versions by probing for symlinks at
 * {basePath}/bin/python{major}.{minor}.  On the Vercel build image this
 * avoids spawning a `uv python list` subprocess.
 */
export function getInstalledPythonsFromFilesystem(
  basePath: string = UV_PYTHON_PATH_PREFIX
): Set<string> {
  const result = new Set<string>();
  for (const opt of allOptions) {
    const version = pythonVersionString(opt);
    if (!version) continue;
    const binPath = join(basePath, 'bin', `python${version}`);
    if (existsSync(binPath)) {
      result.add(version);
    }
  }
  return result;
}

function getInstalledPythons(): Set<string> {
  if (installedPythonsCache !== null) {
    return installedPythonsCache;
  }

  if (process.env.VERCEL_BUILD_IMAGE) {
    installedPythonsCache = getInstalledPythonsFromFilesystem();
    return installedPythonsCache;
  }

  const uvPath = findUvInPath();
  if (!uvPath) {
    throw new NowBuildError({
      code: 'UV_ERROR',
      link: 'https://vercel.link/python-version',
      message: 'uv is required but was not found in PATH.',
    });
  }
  const uv = new UvRunner(uvPath);
  installedPythonsCache = uv.listInstalledPythons();
  return installedPythonsCache;
}

/**
 * Reset the installed Python versions cache.
 * Exported for testing purposes only.
 * @internal
 */
export function resetInstalledPythonsCache(): void {
  installedPythonsCache = null;
}

function isInstalled(pv: PythonVersion): boolean {
  try {
    const installed = getInstalledPythons();
    const version = pythonVersionString(pv);
    if (!version) return false;
    return installed.has(version);
  } catch (err) {
    throw new NowBuildError({
      code: 'UV_ERROR',
      link: 'https://vercel.link/python-version',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
