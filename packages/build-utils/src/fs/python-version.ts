import { statSync, promises as fs } from 'fs';
import { join } from 'path';
import { NowBuildError } from '../errors';
import { PythonVersion } from '../types';
import debug from '../debug';

export type PythonVersionMajorMinor = `${number}.${number}`;

/**
 * Reads the Python version from a `.python-version` file in the given directory.
 */
export async function readPythonVersionFile(
  workPath: string
): Promise<string | undefined> {
  try {
    const filePath = join(workPath, '.python-version');
    const content = await fs.readFile(filePath, 'utf8');
    const version = content.trim();
    if (version) {
      debug(`Found .python-version: ${version}`);
      return version;
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      debug(`Failed to read .python-version: ${error.message}`);
    }
  }
  return undefined;
}

/**
 * Reads the `requires-python` field from pyproject.toml in the given directory.
 */
export async function readRequiresPython(
  workPath: string
): Promise<string | undefined> {
  try {
    const filePath = join(workPath, 'pyproject.toml');
    const content = await fs.readFile(filePath, 'utf8');
    // Extract requires-python value
    // requires-python = ">=3.12" or requires-python = '>=3.12'
    const match = content.match(/requires-python\s*=\s*["']([^"']+)["']/);
    if (match) {
      debug(`Found requires-python in pyproject.toml: ${match[1]}`);
      return match[1];
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      debug(`Failed to read pyproject.toml: ${error.message}`);
    }
  }
  return undefined;
}

export interface DeclaredPythonVersion {
  version: string;
  source: '.python-version' | 'pyproject.toml';
}

/**
 * Detects the Python version
 * workPath/.python-version > workPath/pyproject.toml >
 * rootDirectoryPath/.python-version > rootDirectoryPath/pyproject.toml
 */
export async function detectPythonVersion(
  workPath: string,
  rootDirectoryPath: string
): Promise<DeclaredPythonVersion | undefined> {
  const workPathVersion = await readPythonVersionFile(workPath);
  if (workPathVersion) {
    return { version: workPathVersion, source: '.python-version' };
  }

  const workPathRequires = await readRequiresPython(workPath);
  if (workPathRequires) {
    return { version: workPathRequires, source: 'pyproject.toml' };
  }

  // Check rootDirectoryPath
  if (rootDirectoryPath !== workPath) {
    const rootVersion = await readPythonVersionFile(rootDirectoryPath);
    if (rootVersion) {
      return { version: rootVersion, source: '.python-version' };
    }

    const rootRequires = await readRequiresPython(rootDirectoryPath);
    if (rootRequires) {
      return { version: rootRequires, source: 'pyproject.toml' };
    }
  }

  return undefined;
}

/*
 * PEP 440 Version Specifiers: https://peps.python.org/pep-0440/#version-specifiers
 */

type VersionTuple = [number, number];
type SpecOp = '<' | '<=' | '>' | '>=' | '==' | '!=' | '~=';

interface VersionSpecifier {
  op: SpecOp;
  ver: VersionTuple;
}

/**
 * Parse a version string into [major, minor] tuple.
 * Example: "3.12" -> [3, 12]
 */
function parseVersionTuple(input: string): VersionTuple | undefined {
  const cleaned = input.trim().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)(?:\.(\d+))?/);
  if (!match) return undefined;
  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return undefined;
  return [major, minor];
}

function compareTuples(a: VersionTuple, b: VersionTuple): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * Parse a version specifier string.
 * Example: ">=3.12" -> { op: '>=', ver: [3, 12] }
 */
function parseSpecifier(spec: string): VersionSpecifier | undefined {
  const s = spec.trim();
  // Match operators: <=, >=, ==, !=, ~=, <, >
  const match =
    s.match(/^(<=|>=|==|!=|~=|<|>)\s*([0-9]+(?:\.[0-9]+)?)(?:\.\*)?$/) ||
    // Bare version like "3.12" implies ==
    s.match(/^()([0-9]+(?:\.[0-9]+)?)(?:\.\*)?$/);
  if (!match) return undefined;
  const op = (match[1] || '==') as SpecOp;
  const ver = parseVersionTuple(match[2]);
  if (!ver) return undefined;
  return { op, ver };
}

/**
 * Check if a version tuple satisfies a specifier.
 */
function satisfies(candidate: VersionTuple, spec: VersionSpecifier): boolean {
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
      // Compatible release: ~=3.10 means >=3.10 and <4.0
      const lowerOk = cmp >= 0;
      const upper: VersionTuple = [spec.ver[0] + 1, 0];
      return lowerOk && compareTuples(candidate, upper) < 0;
    }
    default:
      return false;
  }
}

/**
 * Select a Python version from a `requires-python` expression.
 * Example: ">=3.10,<3.13" -> finds best matching PythonVersion
 */
function selectFromRequiresPython(
  expr: string,
  availableVersions?: PythonVersionMajorMinor[]
): PythonVersion | undefined {
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
    // Try direct exact match (e.g., "3.12")
    const parsed = parseVersionTuple(raw);
    if (parsed) {
      return getOptions().find(
        o =>
          o.major === parsed[0] &&
          o.minor === parsed[1] &&
          (!availableVersions?.length ||
            availableVersions.includes(
              `${o.major}.${o.minor}` as PythonVersionMajorMinor
            ))
      );
    }
    return undefined;
  }

  // Filter supported versions by the specifiers
  const matches = getOptions().filter(opt => {
    const vt: VersionTuple = [opt.major, opt.minor];
    const satisfiesAll = specifiers.every(sp => satisfies(vt, sp));
    const isAvailable =
      !availableVersions?.length ||
      availableVersions.includes(
        `${opt.major}.${opt.minor}` as PythonVersionMajorMinor
      );
    return satisfiesAll && isAvailable;
  });

  return matches[0];
}

// Sorted with newest supported version first
export const PYTHON_VERSIONS: PythonVersion[] = [
  // TODO: Uncomment when available in build container:
  // new PythonVersion({
  //   major: 3,
  //   minor: 14,
  //   range: '3.14',
  //   runtime: 'python3.14',
  //   pythonPath: 'python3.14',
  // }),
  // new PythonVersion({
  //   major: 3,
  //   minor: 13,
  //   range: '3.13',
  //   runtime: 'python3.13',
  //   pythonPath: 'python3.13',
  // }),
  new PythonVersion({
    major: 3,
    minor: 12,
    range: '3.12',
    runtime: 'python3.12',
    pythonPath: 'python3.12',
  }),
];

function getOptions(): PythonVersion[] {
  return PYTHON_VERSIONS;
}

/**
 * Check if a Python version directory exists in the build container.
 * Python is installed at /python{major}{minor} (e.g., /python312)
 */
function isPythonVersionAvailable(version: PythonVersion): boolean {
  try {
    return statSync(`/python${version.major}${version.minor}`).isDirectory();
  } catch {
    // ENOENT, or any other error
    return false;
  }
}

export function getAvailablePythonVersions(): PythonVersionMajorMinor[] {
  return getOptions()
    .filter(isPythonVersionAvailable)
    .map(v => `${v.major}.${v.minor}` as PythonVersionMajorMinor);
}

export function getLatestPythonVersion(
  availableVersions?: PythonVersionMajorMinor[]
): PythonVersion {
  const all = getOptions();
  if (availableVersions?.length) {
    for (const version of all) {
      const key =
        `${version.major}.${version.minor}` as PythonVersionMajorMinor;
      if (availableVersions.includes(key)) {
        return version;
      }
    }
  }
  return all[0];
}

function getHint() {
  const { range } = getLatestPythonVersion();
  return `Please set ".python-version" to "${range}".`;
}

/**
 * Parse a .python-version file content into major and minor components.
 */
export function parsePythonVersion(
  versionString: string
): { major: number; minor: number } | undefined {
  const trimmed = versionString.trim();
  const parts = trimmed.split('.');
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  if (isNaN(major) || isNaN(minor)) return undefined;
  return { major, minor };
}

/**
 * Get a supported Python version based on declared version.
 * Handles both .python-version (exact) and pyproject.toml (specifiers).
 */
export function getSupportedPythonVersion(
  declared: DeclaredPythonVersion | undefined,
  availableVersions?: PythonVersionMajorMinor[]
): PythonVersion {
  let selection: PythonVersion | undefined;

  if (declared) {
    const { version, source } = declared;

    if (source === 'pyproject.toml') {
      // Handle version specifiers like ">=3.12"
      selection = selectFromRequiresPython(version, availableVersions);

      if (!selection) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_UNSUPPORTED',
          link: 'http://vercel.link/python-version',
          message: `No supported Python version matches "${version}" from pyproject.toml. ${getHint()}`,
        });
      }
    } else {
      // .python-version: exact version only
      const parsed = parsePythonVersion(version);

      if (!parsed) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_INVALID',
          link: 'http://vercel.link/python-version',
          message: `Invalid Python version "${version}" in .python-version. ${getHint()}`,
        });
      }

      selection = getOptions().find(
        o =>
          o.major === parsed.major &&
          o.minor === parsed.minor &&
          (!availableVersions?.length ||
            availableVersions.includes(
              `${o.major}.${o.minor}` as PythonVersionMajorMinor
            ))
      );

      if (!selection) {
        throw new NowBuildError({
          code: 'BUILD_UTILS_PYTHON_VERSION_UNSUPPORTED',
          link: 'http://vercel.link/python-version',
          message: `Unsupported Python version "${version}" in .python-version. ${getHint()}`,
        });
      }
    }
  }

  if (!selection) {
    selection = getLatestPythonVersion(availableVersions);
  }

  debug(`Selected Python ${selection.range}`);
  return selection;
}
