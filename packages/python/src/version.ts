import { NowBuildError } from '@vercel/build-utils';
import { findUvInPath, UvRunner } from './uv';

interface PythonVersion {
  version: string;
  pipPath: string;
  pythonPath: string;
  runtime: string;
  discontinueDate?: Date;
}

export const DEFAULT_PYTHON_VERSION = '3.12';

// The order must be most recent first
const allOptions: PythonVersion[] = [
  {
    version: '3.14',
    pipPath: 'pip3.14',
    pythonPath: 'python3.14',
    runtime: 'python3.14',
  },
  {
    version: '3.13',
    pipPath: 'pip3.13',
    pythonPath: 'python3.13',
    runtime: 'python3.13',
  },
  {
    version: '3.12',
    pipPath: 'pip3.12',
    pythonPath: 'python3.12',
    runtime: 'python3.12',
  },
  {
    version: '3.11',
    pipPath: 'pip3.11',
    pythonPath: 'python3.11',
    runtime: 'python3.11',
  },
  {
    version: '3.10',
    pipPath: 'pip3.10',
    pythonPath: 'python3.10',
    runtime: 'python3.10',
  },
  {
    version: '3.9',
    pipPath: 'pip3.9',
    pythonPath: 'python3.9',
    runtime: 'python3.9',
  },
  {
    version: '3.6',
    pipPath: 'pip3.6',
    pythonPath: 'python3.6',
    runtime: 'python3.6',
    discontinueDate: new Date('2022-07-18'),
  },
];

function getDevPythonVersion(): PythonVersion {
  // Use the system-installed version of `python3` when running `vercel dev`
  return {
    version: '3',
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

  // When no version is explicitly specified use default version
  const defaultOption = allOptions.find(
    opt => opt.version === DEFAULT_PYTHON_VERSION && isInstalled(opt)
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

/**
 * example: "3.10" -> [3, 10]
 */
export function parseVersionTuple(input: string): [number, number] | null {
  const cleaned = input.trim().replace(/\s+/g, '');
  const m = cleaned.match(/^(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] !== undefined ? Number(m[2]) : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  return [major, minor];
}

export function compareTuples(
  a: [number, number],
  b: [number, number]
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

type SpecOp = '<' | '<=' | '>' | '>=' | '==' | '!=' | '~=';
interface VersionSpecifier {
  op: SpecOp;
  ver: [number, number];
}

/**
 * example: ">=3.10" -> { op: '>=', ver: [3, 10] }
 */
function parseSpecifier(spec: string): VersionSpecifier | null {
  const s = spec.trim();
  // Support operators: <=, >=, ==, !=, ~=, <, >
  // Allow optional patch version (e.g., 3.11.4) which will be ignored (only major.minor used)
  const m =
    s.match(
      /^(<=|>=|==|!=|~=|<|>)\s*([0-9]+(?:\.[0-9]+)?)(?:\.[0-9]+)?(?:\.\*)?$/
    ) ||
    // Bare version like "3.11" or "3.11.4" -> implied ==
    s.match(/^()([0-9]+(?:\.[0-9]+)?)(?:\.[0-9]+)?(?:\.\*)?$/);
  if (!m) return null;
  const op = (m[1] || '==') as SpecOp;
  const vt = parseVersionTuple(m[2]);
  if (!vt) return null;
  return { op, ver: vt };
}

/**
 * example: [3, 10] satisfies ">=3.10" -> true
 * example: [3, 9] satisfies ">=3.10" -> false
 */
function satisfies(
  candidate: [number, number],
  spec: VersionSpecifier
): boolean {
  const cmp = compareTuples(candidate, spec.ver);
  switch (spec.op) {
    case '==':
      return cmp === 0;
    case '!=':
      return cmp !== 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '~=': {
      // Compatible release, e.g. ~=3.10 means >=3.10 and <3.11
      const lowerOk = cmp >= 0;
      const upper: [number, number] = [spec.ver[0], spec.ver[1] + 1];
      return lowerOk && compareTuples(candidate, upper) < 0;
    }
    default:
      return false;
  }
}

function selectFromRequiresPython(expr: string): PythonVersion | undefined {
  const raw = expr.trim();
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  const specifiers: VersionSpecifier[] = [];
  for (const p of parts) {
    const sp = parseSpecifier(p);
    if (sp) specifiers.push(sp);
  }
  if (specifiers.length === 0) {
    // Try direct exact match with the raw string (e.g. "3.11")
    return allOptions.find(o => o.version === raw);
  }
  // Filter all supported options by the specifiers (intersection semantics)
  const matches = allOptions.filter(opt => {
    const vt = parseVersionTuple(opt.version)!;
    return specifiers.every(sp => satisfies(vt, sp));
  });
  if (matches.length === 0) return undefined;

  // Prefer DEFAULT_PYTHON_VERSION (3.12) if it satisfies the constraints.
  // This makes Python 3.13+ opt-in only - users must explicitly require
  const defaultMatch = matches.find(
    opt => opt.version === DEFAULT_PYTHON_VERSION && isInstalled(opt)
  );
  if (defaultMatch) {
    return defaultMatch;
  }

  // If DEFAULT_PYTHON_VERSION doesn't match constraints, fall back to
  // the latest installed version that matches
  const installedMatch = matches.find(isInstalled);
  return installedMatch ?? matches[0];
}

export function getSupportedPythonVersion({
  isDev,
  declaredPythonVersion,
}: {
  isDev?: boolean;
  declaredPythonVersion?: {
    version: string;
    source: 'Pipfile.lock' | 'pyproject.toml' | '.python-version';
  };
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  let selection = getDefaultPythonVersion({ isDev: false });

  if (declaredPythonVersion) {
    const { version, source } = declaredPythonVersion;
    let requested: PythonVersion | undefined;
    if (source === 'pyproject.toml' || source === '.python-version') {
      // Support both exact versions and version specifiers (e.g. ">=3.12")
      requested = selectFromRequiresPython(version);
    } else {
      // For Pipfile.lock, do exact match
      requested = allOptions.find(o => o.version === version);
    }
    if (requested) {
      // If a discontinued version is explicitly requested, error even if not installed
      if (isDiscontinued(requested)) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
          link: 'https://vercel.link/python-version',
          message: `Python version "${requested.version}" detected in ${source} is discontinued and must be upgraded.`,
        });
      }
      // Otherwise, prefer the requested version if installed; fall back to latest installed
      if (isInstalled(requested)) {
        selection = requested;
        console.log(`Using Python ${selection.version} from ${source}`);
      } else {
        console.warn(
          `Warning: Python version "${version}" detected in ${source} is not installed and will be ignored. https://vercel.link/python-version`
        );
        console.log(`Using python version: ${selection.version}`);
      }
    } else {
      console.warn(
        `Warning: Python version "${version}" detected in ${source} is invalid and will be ignored. https://vercel.link/python-version`
      );
      console.log(`Using python version: ${selection.version}`);
    }
  } else {
    console.log(
      `No Python version specified in .python-version, pyproject.toml, or Pipfile.lock. Using python version: ${selection.version}`
    );
  }

  if (isDiscontinued(selection)) {
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'https://vercel.link/python-version',
      message: `Python version "${selection.version}" declared in project configuration is discontinued and must be upgraded.`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    const srcSuffix = declaredPythonVersion
      ? `detected in ${declaredPythonVersion.source}`
      : 'selected by runtime';
    console.warn(
      `Error: Python version "${selection.version}" ${srcSuffix} has reached End-of-Life. Deployments created on or after ${d} will fail to build. https://vercel.link/python-version`
    );
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: PythonVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

// Cache for installed Python versions to avoid repeated execSync calls
let installedPythonsCache: Set<string> | null = null;

function getInstalledPythons(): Set<string> {
  if (installedPythonsCache !== null) {
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

function isInstalled({ version }: PythonVersion): boolean {
  try {
    const installed = getInstalledPythons();
    return installed.has(version);
  } catch (err) {
    throw new NowBuildError({
      code: 'UV_ERROR',
      link: 'https://vercel.link/python-version',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
