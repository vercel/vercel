import fs from 'fs';
import { join, posix as pathPosix } from 'path';
import type { FileFsRef } from '@vercel/build-utils';
import { glob, debug } from '@vercel/build-utils';
import { readConfigFile } from '@vercel/build-utils';

export const FASTAPI_ENTRYPOINT_FILENAMES = ['app', 'index', 'server', 'main'];
export const FASTAPI_ENTRYPOINT_DIRS = ['', 'src', 'app', 'api'];
export const FASTAPI_CONTENT_REGEX =
  /(from\s+fastapi\s+import\s+FastAPI|import\s+fastapi|FastAPI\s*\()/;

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
    return FASTAPI_CONTENT_REGEX.test(contents);
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
    return FLASK_CONTENT_REGEX.test(contents);
  } catch {
    return false;
  }
}

/**
 * Detect a Flask entrypoint path relative to workPath, or return null if not found.
 */
export async function detectFlaskEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entry = configuredEntrypoint.endsWith('.py')
    ? configuredEntrypoint
    : `${configuredEntrypoint}.py`;

  try {
    const fsFiles = await glob('**', workPath);
    if (fsFiles[entry]) return entry;

    const candidates = FLASK_CANDIDATE_ENTRYPOINTS.filter(
      (c: string) => !!fsFiles[c]
    );
    if (candidates.length > 0) {
      const flaskEntrypoint =
        candidates.find((c: string) =>
          isFlaskEntrypoint(fsFiles[c] as FileFsRef)
        ) || candidates[0];
      debug(`Detected Flask entrypoint: ${flaskEntrypoint}`);
      return flaskEntrypoint;
    }

    return null;
  } catch {
    debug('Failed to discover entrypoint for Flask');
    return null;
  }
}

/**
 * Detect a FastAPI entrypoint path relative to workPath, or return null if not found.
 */
export async function detectFastapiEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entry = configuredEntrypoint.endsWith('.py')
    ? configuredEntrypoint
    : `${configuredEntrypoint}.py`;

  try {
    const fsFiles = await glob('**', workPath);
    // If the configured entrypoint exists, use it
    if (fsFiles[entry]) return entry;

    // Otherwise search for candidates
    const candidates = FASTAPI_CANDIDATE_ENTRYPOINTS.filter(
      (c: string) => !!fsFiles[c]
    );
    if (candidates.length > 0) {
      const fastapiEntrypoint =
        candidates.find((c: string) =>
          isFastapiEntrypoint(fsFiles[c] as FileFsRef)
        ) || candidates[0];
      debug(`Detected FastAPI entrypoint: ${fastapiEntrypoint}`);
      return fastapiEntrypoint;
    }

    // Nothing found
    return null;
  } catch {
    debug('Failed to discover entrypoint for FastAPI');
    return null;
  }
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
