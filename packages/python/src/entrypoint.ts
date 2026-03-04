import { join, posix as pathPosix } from 'path';
import type { FileFsRef, PythonFramework } from '@vercel/build-utils';
import {
  glob,
  debug,
  isDirectory,
  isPythonEntrypoint,
  getDjangoEntrypoint,
} from '@vercel/build-utils';
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

export const PYTHON_CANDIDATE_ENTRYPOINTS = getCandidateEntrypointsInDirs(
  PYTHON_ENTRYPOINT_DIRS
);

function getCandidateEntrypointsInDirs(dirs: string[]) {
  return dirs.flatMap((dir: string) =>
    PYTHON_ENTRYPOINT_FILENAMES.map((filename: string) =>
      pathPosix.join(dir, `${filename}.py`)
    )
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

async function findValidEntrypoint(
  fsFiles: Record<string, FileFsRef>,
  candidates: string[]
): Promise<string | null> {
  for (const candidate of candidates) {
    if (fsFiles[candidate]) {
      const isValid = await isPythonEntrypoint(fsFiles[candidate] as FileFsRef);
      if (isValid) {
        debug(`Detected Python entrypoint: ${candidate}`);
        return candidate;
      }
    }
  }
  return null;
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
    return findValidEntrypoint(fsFiles, candidates);
  } catch {
    debug('Failed to discover Python entrypoint');
    return null;
  }
}

/**
 * Detect a Django Python entrypoint: resolve WSGI_APPLICATION from settings
 * to get the wsgi module file (e.g. hello/wsgi.py), then fall back to
 * AST-based detection if needed.
 */
export async function detectDjangoPythonEntrypoint(
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

    // Get root directories
    const rootGlobs = await glob('*', {
      cwd: workPath,
      includeDirectories: true,
    });
    const rootDirs = [
      '',
      ...Object.keys(rootGlobs).filter(
        name =>
          !name.startsWith('.') &&
          rootGlobs[name].mode != null &&
          isDirectory(rootGlobs[name].mode)
      ),
    ];

    // Look for an entrypoint via manage.py -> settings.py -> WSGI_APPLICATION:
    // Try workPath and immediate subdirectories.
    for (const rootDir of rootDirs) {
      const currPath = join(workPath, rootDir);
      const wsgiEntry = await getDjangoEntrypoint(currPath);
      if (wsgiEntry) {
        const fullWsgiEntry = pathPosix.join(rootDir, wsgiEntry);
        if (fsFiles[fullWsgiEntry]) {
          debug(`Using Django WSGI entrypoint: ${fullWsgiEntry}`);
          return fullWsgiEntry;
        }
      }
    }

    // Fall back to AST-based detection,
    // Look in all immediate subdirectories, not just those specified in PYTHON_ENTRYPOINT_DIRS.
    const baseCandidates = getCandidateEntrypointsInDirs(rootDirs);
    const candidates = baseCandidates.filter((c: string) => !!fsFiles[c]);
    return findValidEntrypoint(fsFiles, candidates);
  } catch {
    debug('Failed to discover Django Python entrypoint');
    return null;
  }
}

/**
 * Detect a Python entrypoint path for a given framework relative to workPath, or return null if not found.
 */
export async function detectPythonEntrypoint(
  framework: PythonFramework,
  workPath: string,
  configuredEntrypoint: string
): Promise<string | null> {
  const entrypoint =
    framework === 'django'
      ? await detectDjangoPythonEntrypoint(workPath, configuredEntrypoint)
      : await detectGenericPythonEntrypoint(workPath, configuredEntrypoint);
  if (entrypoint) return entrypoint;
  return await getPyprojectEntrypoint(workPath);
}
