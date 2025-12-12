import fs from 'fs';
import { join, posix as pathPosix } from 'path';
import type { FileFsRef } from '@vercel/build-utils';
import {
  glob,
  debug,
  NowBuildError,
  readConfigFile,
  normalizePath,
} from '@vercel/build-utils';

export const FASTAPI_ENTRYPOINT_FILENAMES = ['app', 'index', 'server', 'main'];
export const FASTAPI_ENTRYPOINT_DIRS = ['', 'src', 'app', 'api'];
export const FASTAPI_CONTENT_REGEX =
  /(from\s+fastapi\s+import\s+FastAPI|import\s+fastapi|FastAPI\s*\()/;
export const PYTHON_APP_VARIABLE_REGEX = /^\s*app\s*[:=]/m;

// For deep scanning beyond known default locations, limit how far we search to
// avoid accidentally selecting unrelated apps in monorepos.
export const PYTHON_ENTRYPOINT_MAX_SEARCH_DEPTH = 2;

// Directories to exclude from "deep scan" entrypoint discovery.
// We intentionally keep this small and focused on very common non-app code.
const PYTHON_ENTRYPOINT_EXCLUDED_DIRS = new Set([
  'test',
  'tests',
  '__tests__',
  '__pycache__',
  '.git',
  '.vercel',
  '.venv',
  'venv',
  'node_modules',
]);

export const FASTAPI_CANDIDATE_ENTRYPOINTS =
  FASTAPI_ENTRYPOINT_FILENAMES.flatMap((filename: string) =>
    FASTAPI_ENTRYPOINT_DIRS.map((dir: string) =>
      pathPosix.join(dir, `${filename}.py`)
    )
  );

export function isFastapiEntrypoint(
  file: FileFsRef | { fsPath?: string }
): boolean {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;
    const contents = fs.readFileSync(fsPath, 'utf8');
    return (
      FASTAPI_CONTENT_REGEX.test(contents) &&
      PYTHON_APP_VARIABLE_REGEX.test(contents)
    );
  } catch {
    return false;
  }
}

// Flask zero-config detection
export const FLASK_ENTRYPOINT_FILENAMES = ['app', 'index', 'server', 'main'];
export const FLASK_ENTRYPOINT_DIRS = ['', 'src', 'app', 'api'];
export const FLASK_CONTENT_REGEX =
  /(from\s+flask\s+import\s+Flask|import\s+flask|Flask\s*\()/;

export const FLASK_CANDIDATE_ENTRYPOINTS = FLASK_ENTRYPOINT_FILENAMES.flatMap(
  (filename: string) =>
    FLASK_ENTRYPOINT_DIRS.map((dir: string) =>
      pathPosix.join(dir, `${filename}.py`)
    )
);

export function isFlaskEntrypoint(
  file: FileFsRef | { fsPath?: string }
): boolean {
  try {
    const fsPath = (file as FileFsRef).fsPath;
    if (!fsPath) return false;
    const contents = fs.readFileSync(fsPath, 'utf8');
    return (
      FLASK_CONTENT_REGEX.test(contents) &&
      PYTHON_APP_VARIABLE_REGEX.test(contents)
    );
  } catch {
    return false;
  }
}

function throwAmbiguousEntrypointError(
  framework: 'fastapi' | 'flask',
  candidates: string[]
): never {
  const sorted = [...candidates].sort();
  const list = sorted.map(p => `- ${p}`).join('\n');
  const code = `${framework.toUpperCase()}_ENTRYPOINT_AMBIGUOUS`;
  const link = `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`;
  throw new NowBuildError({
    code,
    message:
      `Multiple possible ${framework} entrypoints were found.\n\n` +
      `Please configure which one to use by setting the entrypoint explicitly (for example: "backend/my_server.py") ` +
      `or by adding an 'app' script to pyproject.toml.\n\n` +
      `Candidates:\n${list}`,
    link,
    action: 'Learn More',
  });
}

function shouldScanPathForEntrypoint(p: string, maxDepth: number): boolean {
  if (!p.endsWith('.py')) return false;
  const parts = p.split('/').filter(Boolean);
  // Depth is number of directories, so "a/b.py" => depth 1
  const depth = Math.max(0, parts.length - 1);
  if (depth > maxDepth) return false;
  return !parts.some(seg => PYTHON_ENTRYPOINT_EXCLUDED_DIRS.has(seg));
}

function scanEntrypoints(
  fsFiles: Record<string, FileFsRef>,
  maxDepth: number,
  isEntrypoint: (file: FileFsRef) => boolean
): string[] {
  const matches: string[] = [];
  for (const [p, ref] of Object.entries(fsFiles)) {
    if (!shouldScanPathForEntrypoint(p, maxDepth)) continue;
    if (isEntrypoint(ref)) matches.push(p);
  }
  return matches;
}

async function detectFrameworkEntrypoint(
  framework: 'fastapi' | 'flask',
  workPath: string,
  configuredEntrypoint: string,
  candidateEntrypoints: string[],
  isEntrypoint: (file: FileFsRef) => boolean
): Promise<string | null> {
  const entry = normalizePath(
    configuredEntrypoint.endsWith('.py')
      ? configuredEntrypoint
      : `${configuredEntrypoint}.py`
  );

  let fsFiles: Record<string, FileFsRef>;
  try {
    fsFiles = await glob('**', workPath);
  } catch (err) {
    debug(`Failed to discover entrypoint for ${framework}`, err);
    return null;
  }

  if (fsFiles[entry]) return entry;

  const candidates = candidateEntrypoints.filter(c => !!fsFiles[c]);
  if (candidates.length > 0) {
    const matched = candidates.filter(c => isEntrypoint(fsFiles[c]));
    if (matched.length === 1) {
      debug(`Detected ${framework} entrypoint: ${matched[0]}`);
      return matched[0];
    } else if (matched.length > 1) {
      throwAmbiguousEntrypointError(framework, matched);
    }
  }

  // No standard candidates exist, so do a shallow scan for a clear framework entrypoint.
  const scannedMatches = scanEntrypoints(
    fsFiles,
    PYTHON_ENTRYPOINT_MAX_SEARCH_DEPTH,
    isEntrypoint
  );
  if (scannedMatches.length === 1) {
    debug(`Detected ${framework} entrypoint via scan: ${scannedMatches[0]}`);
    return scannedMatches[0];
  } else if (scannedMatches.length > 1) {
    throwAmbiguousEntrypointError(framework, scannedMatches);
  }

  return null;
}

/**
 * Detect a Flask entrypoint path relative to workPath, or return null if not found.
 */
export async function detectFlaskEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  return detectFrameworkEntrypoint(
    'flask',
    workPath,
    configuredEntrypoint,
    FLASK_CANDIDATE_ENTRYPOINTS,
    isFlaskEntrypoint
  );
}

/**
 * Detect a FastAPI entrypoint path relative to workPath, or return null if not found.
 */
export async function detectFastapiEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  return detectFrameworkEntrypoint(
    'fastapi',
    workPath,
    configuredEntrypoint,
    FASTAPI_CANDIDATE_ENTRYPOINTS,
    isFastapiEntrypoint
  );
}

export async function getPyprojectEntrypoint(
  workPath: string
): Promise<string | null> {
  const pyprojectData = await readConfigFile<{
    project?: { scripts?: Record<string, unknown> };
  }>(join(workPath, 'pyproject.toml'));
  if (!pyprojectData) return null;

  // If `pyproject.toml` has a [project.scripts] table and contains a script
  // named "app", parse the value (format: "module:attr") to determine the
  // module and map it to a file path.
  const scripts = pyprojectData.project?.scripts as
    | Record<string, unknown>
    | undefined;
  const appScript = scripts?.app;
  if (typeof appScript !== 'string') return null;

  // Expect values like "package.module:app". Extract the module portion.
  const match = appScript.match(/([A-Za-z_][\w.]*)\s*:\s*([A-Za-z_][\w]*)/);
  if (!match) return null;
  const modulePath = match[1];
  const relPath = modulePath.replace(/\./g, '/');

  // Prefer an existing file match if present; otherwise fall back to "<module>.py".
  try {
    const fsFiles = await glob('**', workPath);
    const candidates = [`${relPath}.py`, `${relPath}/__init__.py`];
    for (const candidate of candidates) {
      if (fsFiles[candidate]) return candidate;
    }
    return null;
  } catch {
    debug('Failed to discover Python entrypoint from pyproject.toml');
    return null;
  }
}

/**
 * Detect a Python entrypoint path for a given framework relative to workPath, or return null if not found.
 */
export async function detectPythonEntrypoint(
  framework: 'fastapi' | 'flask',
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  let entrypoint = null;
  if (framework === 'fastapi') {
    entrypoint = await detectFastapiEntrypoint(workPath, configuredEntrypoint);
  } else if (framework === 'flask') {
    entrypoint = await detectFlaskEntrypoint(workPath, configuredEntrypoint);
  }
  if (entrypoint) return entrypoint;
  return await getPyprojectEntrypoint(workPath);
}
