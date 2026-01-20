import { join, posix as pathPosix } from 'path';
import type { FileFsRef, PythonFramework } from '@vercel/build-utils';
import { glob, debug, isPythonEntrypoint } from '@vercel/build-utils';
import { readConfigFile } from '@vercel/build-utils';

export const PYTHON_ENTRYPOINT_FILENAMES = [
  'app',
  'index',
  'server',
  'main',
  'wsgi',
  'asgi',
];
export const PYTHON_ENTRYPOINT_DIRS = ['', 'src', 'app', 'api'];

export const PYTHON_CANDIDATE_ENTRYPOINTS = PYTHON_ENTRYPOINT_FILENAMES.flatMap(
  (filename: string) =>
    PYTHON_ENTRYPOINT_DIRS.map((dir: string) =>
      pathPosix.join(dir, `${filename}.py`)
    )
);

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
 * Detect a Python entrypoint for any Python framework using AST-based detection.
 */
export async function detectGenericPythonEntrypoint(
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entry = configuredEntrypoint.endsWith('.py')
    ? configuredEntrypoint
    : `${configuredEntrypoint}.py`;

  try {
    const fsFiles = await glob('**', workPath);

    // If the configured entrypoint exists and is valid, use it
    if (fsFiles[entry]) {
      const isValid = await isPythonEntrypoint(fsFiles[entry] as FileFsRef);
      if (isValid) {
        debug(`Using configured Python entrypoint: ${entry}`);
        return entry;
      }
    }

    // Search candidate locations using AST-based detection
    const candidates = PYTHON_CANDIDATE_ENTRYPOINTS.filter(
      (c: string) => !!fsFiles[c]
    );

    for (const candidate of candidates) {
      const isValid = await isPythonEntrypoint(fsFiles[candidate] as FileFsRef);
      if (isValid) {
        debug(`Detected Python entrypoint: ${candidate}`);
        return candidate;
      }
    }

    // No valid entrypoint found via AST detection
    return null;
  } catch {
    debug('Failed to discover Python entrypoint');
    return null;
  }
}

/**
 * Detect a Python entrypoint path for a given framework relative to workPath, or return null if not found.
 */
export async function detectPythonEntrypoint(
  _framework: PythonFramework,
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entrypoint = await detectGenericPythonEntrypoint(
    workPath,
    configuredEntrypoint
  );
  if (entrypoint) return entrypoint;
  return await getPyprojectEntrypoint(workPath);
}
