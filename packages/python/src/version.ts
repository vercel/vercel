import { NowBuildError } from '@vercel/build-utils';
import which from 'which';

interface PythonVersion {
  version: string;
  pipPath: string;
  pythonPath: string;
  runtime: string;
  discontinueDate?: Date;
}

// The order must be most recent first
const allOptions: PythonVersion[] = [
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

export function getLatestPythonVersion({
  isDev,
}: {
  isDev?: boolean;
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  const selection = allOptions.find(isInstalled);
  if (!selection) {
    throw new NowBuildError({
      code: 'PYTHON_NOT_FOUND',
      link: 'http://vercel.link/python-version',
      message: `Unable to find any supported Python versions.`,
    });
  }
  return selection;
}

/**
 * example: "3.10" -> [3, 10]
 */
function parseVersionTuple(input: string): [number, number] | null {
  const cleaned = input.trim().replace(/\s+/g, '');
  const m = cleaned.match(/^(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] !== undefined ? Number(m[2]) : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  return [major, minor];
}

function compareTuples(a: [number, number], b: [number, number]): number {
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
  const m =
    s.match(/^(<=|>=|==|!=|~=|<|>)\s*([0-9]+(?:\.[0-9]+)?)(?:\.\*)?$/) ||
    // Bare version like "3.11" -> implied ==
    s.match(/^()([0-9]+(?:\.[0-9]+)?)(?:\.\*)?$/);
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

/**
 * Select a Python version from a `requires-python` expression in pyproject.toml.
 * example: ">=3.10,<3.12" -> PythonVersion | undefined
 */
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
  // Prefer the latest installed that matches; otherwise the latest supported
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
    source: 'Pipfile.lock' | 'pyproject.toml';
  };
}): PythonVersion {
  if (isDev) {
    return getDevPythonVersion();
  }

  let selection = getLatestPythonVersion({ isDev: false });

  if (declaredPythonVersion) {
    const { version, source } = declaredPythonVersion;
    let requested: PythonVersion | undefined;
    if (source === 'pyproject.toml') {
      requested = selectFromRequiresPython(version);
    } else {
      requested = allOptions.find(o => o.version === version);
    }
    if (requested) {
      // If a discontinued version is explicitly requested, error even if not installed
      if (isDiscontinued(requested)) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
          link: 'http://vercel.link/python-version',
          message: `Python version "${requested.version}" detected in ${source} is discontinued and must be upgraded.`,
        });
      }
      // Otherwise, prefer the requested version if installed; fall back to latest installed
      if (isInstalled(requested)) {
        selection = requested;
        console.log(`Using Python ${selection.version} from ${source}`);
      } else {
        console.warn(
          `Warning: Python version "${version}" detected in ${source} is not installed and will be ignored. http://vercel.link/python-version`
        );
        console.log(
          `Falling back to latest installed version: ${selection.version}`
        );
      }
    } else {
      console.warn(
        `Warning: Python version "${version}" detected in ${source} is invalid and will be ignored. http://vercel.link/python-version`
      );
      console.log(
        `Falling back to latest installed version: ${selection.version}`
      );
    }
  } else {
    console.log(
      `No Python version specified in pyproject.toml or Pipfile.lock. Using latest installed version: ${selection.version}`
    );
  }

  if (isDiscontinued(selection)) {
    throw new NowBuildError({
      code: 'BUILD_UTILS_PYTHON_VERSION_DISCONTINUED',
      link: 'http://vercel.link/python-version',
      message: `Python version "${selection.version}" declared in project configuration is discontinued and must be upgraded.`,
    });
  }

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    const srcSuffix = declaredPythonVersion
      ? `detected in ${declaredPythonVersion.source}`
      : 'selected by runtime';
    console.warn(
      `Error: Python version "${selection.version}" ${srcSuffix} has reached End-of-Life. Deployments created on or after ${d} will fail to build. http://vercel.link/python-version`
    );
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: PythonVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

function isInstalled({ pipPath, pythonPath }: PythonVersion): boolean {
  return (
    Boolean(which.sync(pipPath, { nothrow: true })) &&
    Boolean(which.sync(pythonPath, { nothrow: true }))
  );
}
