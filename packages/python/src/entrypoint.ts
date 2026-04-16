import fs from 'fs';
import { join, posix as pathPosix } from 'path';
import {
  PythonFramework,
  NowBuildError,
  isScheduleTriggeredService,
  isQueueTriggeredService,
  type ServiceType,
  type JobTrigger,
} from '@vercel/build-utils';
import { debug } from '@vercel/build-utils';
import { readConfigFile } from '@vercel/build-utils';
import { findAppOrHandler } from '@vercel/python-analysis';

export interface PythonEntrypoint {
  /** Path to the entrypoint file (e.g. "src/app.py"). */
  entrypoint: string;
  /** The callable name within the module (e.g. "app"). */
  variableName: string;
}

export interface DetectedPythonEntrypoint {
  /** Resolved entrypoint, if found. */
  entrypoint?: PythonEntrypoint;
  /** Directory containing manage.py, if detected via Django path. */
  baseDir?: string;
  /** Exception to raise, if we can't fix it with per-framework hooks */
  error?: NowBuildError;
}

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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a Python file contains a top-level app/handler.
 * Returns the matched variable name (e.g. "app"), or null if not found.
 */
async function checkEntrypoint(
  workPath: string,
  relPath: string
): Promise<string | null> {
  const absPath = join(workPath, relPath);
  if (!(await fileExists(absPath))) return null;
  const content = await fs.promises.readFile(absPath, 'utf-8');
  return findAppOrHandler(content);
}

export async function getPyprojectEntrypoint(
  workPath: string
): Promise<PythonEntrypoint | null> {
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
  const variableName = match[2];
  const relPath = modulePath.replace(/\./g, '/');

  // Prefer an existing file match if present; otherwise fall back to "<module>.py".
  const candidates = [`${relPath}.py`, `${relPath}/__init__.py`];
  for (const candidate of candidates) {
    if (await fileExists(join(workPath, candidate))) {
      return { entrypoint: candidate, variableName };
    }
  }
  return null;
}

async function findValidEntrypoint(
  workPath: string,
  candidates: string[]
): Promise<PythonEntrypoint | null> {
  for (const candidate of candidates) {
    const varName = await checkEntrypoint(workPath, candidate);
    if (varName) {
      debug(`Detected Python entrypoint: ${candidate} (variable: ${varName})`);
      return { entrypoint: candidate, variableName: varName };
    }
  }
  return null;
}

/**
 * Check if manage.py exists in workPath and references DJANGO_SETTINGS_MODULE.
 */
async function checkDjangoManage(workPath: string): Promise<boolean> {
  const managePath = join(workPath, 'manage.py');
  try {
    const content = await fs.promises.readFile(managePath, 'utf-8');
    if (!content.includes('DJANGO_SETTINGS_MODULE')) return false;
    debug(`Found Django manage.py with DJANGO_SETTINGS_MODULE at ${workPath}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * List immediate subdirectories of workPath (non-hidden).
 */
async function getSubdirectories(workPath: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(workPath, {
      withFileTypes: true,
    });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
      .sort();
  } catch {
    return [];
  }
}

function makeDetectError(framework: string): NowBuildError {
  const searchedList = PYTHON_CANDIDATE_ENTRYPOINTS.join(', ');
  return new NowBuildError({
    code: `${framework!.toUpperCase()}_ENTRYPOINT_NOT_FOUND`,
    message: `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searchedList}.`,
    link: `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`,
    action: 'Learn More',
  });
}

/**
 * Detect a Python entrypoint for any Python framework using AST-based detection.
 */
export async function detectGenericPythonEntrypoint(
  workPath: string
): Promise<DetectedPythonEntrypoint | null> {
  try {
    // Search candidate locations using AST-based detection
    const found = await findValidEntrypoint(
      workPath,
      PYTHON_CANDIDATE_ENTRYPOINTS
    );
    return found ? { entrypoint: found } : null;
  } catch {
    debug('Failed to discover Python entrypoint');
    return null;
  }
}

/**
 * Detect a Django Python entrypoint: look for manage.py with
 * DJANGO_SETTINGS_MODULE, then fall back to AST-based detection if needed.
 */
export async function detectDjangoPythonEntrypoint(
  workPath: string
): Promise<DetectedPythonEntrypoint | null> {
  try {
    // Get root directories (workPath root + immediate subdirs)
    const subdirs = await getSubdirectories(workPath);
    const rootDirs = ['', ...subdirs];

    // Look for a Django manage.py in workPath and immediate subdirectories.
    for (const rootDir of rootDirs) {
      const currPath = join(workPath, rootDir);
      const isDjango = await checkDjangoManage(currPath);
      if (isDjango) {
        return { baseDir: rootDir, error: makeDetectError('django') };
      }
    }

    // Fall back to AST-based detection,
    // Look in all immediate subdirectories, not just those specified in PYTHON_ENTRYPOINT_DIRS.
    const candidates = getCandidateEntrypointsInDirs(rootDirs);
    const found = await findValidEntrypoint(workPath, candidates);
    return found ? { entrypoint: found } : null;
  } catch {
    debug('Failed to discover Django Python entrypoint');
    return null;
  }
}

/**
 * Detect a Python entrypoint path for a given framework relative to workPath, or return null if not found.
 */
export async function detectPythonEntrypoint(
  framework: PythonFramework | undefined,
  workPath: string,
  configuredEntrypoint?: { filePath: string; varName?: string },
  service?: { type?: ServiceType; trigger?: JobTrigger }
): Promise<DetectedPythonEntrypoint | null> {
  // If a configured entrypoint was provided, check it first
  if (configuredEntrypoint) {
    const { filePath: configEntryFile, varName: configEntryVar } =
      configuredEntrypoint;
    const entrypoint = configEntryFile.endsWith('.py')
      ? configEntryFile
      : `${configEntryFile}.py`;

    let varName: string | null =
      configEntryVar ?? (await checkEntrypoint(workPath, entrypoint));

    if (!varName) {
      // Queue-backed and schedule-triggered services create an `app` dynamically.
      // Any other service type (including workflow-triggered jobs) uses the
      // normal WSGI/ASGI entrypoint detection.
      const needsDynamicApp =
        !!service &&
        (isScheduleTriggeredService(service) ||
          isQueueTriggeredService(service));
      if (needsDynamicApp) {
        varName = 'app';
      }
    }

    if (varName) {
      debug(`Using configured Python entrypoint: ${entrypoint}`);
      return { entrypoint: { entrypoint, variableName: varName } };
    } else {
      return {
        error: new NowBuildError({
          code: 'PYTHON_ENTRYPOINT_NOT_FOUND',
          message: `Could not find a top-level "app", "application", or "handler" in "${entrypoint}".`,
          link: 'https://vercel.com/docs/functions/serverless-functions/runtimes/python',
          action: 'Learn More',
        }),
      };
    }
  }
  if (!framework) {
    return null;
  }

  // Otherwise do a search
  const result =
    framework === 'django'
      ? await detectDjangoPythonEntrypoint(workPath)
      : await detectGenericPythonEntrypoint(workPath);
  if (result) return result;
  const pyprojectEntry = await getPyprojectEntrypoint(workPath);
  return pyprojectEntry
    ? { entrypoint: pyprojectEntry }
    : { error: makeDetectError(framework) };
}
