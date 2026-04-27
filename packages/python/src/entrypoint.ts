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

interface EntrypointDiagnostics {
  /** Candidate files that exist on disk but don't export app/application/handler */
  existingWithoutEntrypoint: string[];
  /** Non-candidate .py files found in candidate directories */
  otherPyFiles: string[];
  /** Raw scripts.app value from pyproject.toml, if present */
  pyprojectAppScript?: string;
  /** Module paths checked for pyproject.toml scripts.app resolution */
  pyprojectCheckedPaths?: string[];
}

interface FindResult {
  entrypoint: PythonEntrypoint | null;
  existingWithoutEntrypoint: string[];
}

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

/**
 * Find .py files in candidate directories that are NOT in the candidate list.
 * Only called on error paths to provide better diagnostics.
 */
async function findOtherPyFiles(
  workPath: string,
  dirs: string[],
  candidateSet: Set<string>
): Promise<string[]> {
  const results: string[] = [];
  for (const dir of dirs) {
    const dirPath = join(workPath, dir);
    try {
      const entries = await fs.promises.readdir(dirPath);
      for (const entry of entries) {
        if (!entry.endsWith('.py')) continue;
        const relPath = dir ? pathPosix.join(dir, entry) : entry;
        if (candidateSet.has(relPath)) continue;
        const stat = await fs.promises.stat(join(dirPath, entry));
        if (stat.isFile()) {
          results.push(relPath);
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }
  return results;
}

interface PyprojectEntrypointResult {
  entrypoint: PythonEntrypoint | null;
  appScript?: string;
  checkedPaths?: string[];
}

export async function getPyprojectEntrypoint(
  workPath: string
): Promise<PyprojectEntrypointResult> {
  const pyprojectData = await readConfigFile<{
    project?: { scripts?: Record<string, unknown> };
  }>(join(workPath, 'pyproject.toml'));
  if (!pyprojectData) return { entrypoint: null };

  // If `pyproject.toml` has a [project.scripts] table and contains a script
  // named "app", parse the value (format: "module:attr") to determine the
  // module and map it to a file path.
  const scripts = pyprojectData.project?.scripts as
    | Record<string, unknown>
    | undefined;
  const appScript = scripts?.app;
  if (typeof appScript !== 'string') return { entrypoint: null };

  // Expect values like "package.module:app". Extract the module portion.
  const match = appScript.match(/([A-Za-z_][\w.]*)\s*:\s*([A-Za-z_][\w]*)/);
  if (!match) return { entrypoint: null, appScript };
  const modulePath = match[1];
  const variableName = match[2];
  const relPath = modulePath.replace(/\./g, '/');

  // Prefer an existing file match if present; otherwise fall back to "<module>.py".
  const candidates = [`${relPath}.py`, `${relPath}/__init__.py`];
  for (const candidate of candidates) {
    if (await fileExists(join(workPath, candidate))) {
      return { entrypoint: { entrypoint: candidate, variableName } };
    }
  }
  return { entrypoint: null, appScript, checkedPaths: candidates };
}

async function findValidEntrypoint(
  workPath: string,
  candidates: string[]
): Promise<FindResult> {
  const existingWithoutEntrypoint: string[] = [];
  for (const candidate of candidates) {
    const absPath = join(workPath, candidate);
    if (!(await fileExists(absPath))) continue;
    const content = await fs.promises.readFile(absPath, 'utf-8');
    const varName = await findAppOrHandler(content);
    if (varName) {
      debug(`Detected Python entrypoint: ${candidate} (variable: ${varName})`);
      return {
        entrypoint: { entrypoint: candidate, variableName: varName },
        existingWithoutEntrypoint,
      };
    }
    existingWithoutEntrypoint.push(candidate);
  }
  return { entrypoint: null, existingWithoutEntrypoint };
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

function makeDiagnosticError(
  framework: string,
  diagnostics: EntrypointDiagnostics
): NowBuildError {
  const code = `${framework.toUpperCase()}_ENTRYPOINT_NOT_FOUND`;
  const link = `https://vercel.com/docs/frameworks/backend/${framework}#exporting-the-${framework}-application`;
  const action = 'Learn More';

  let message: string;

  if (diagnostics.existingWithoutEntrypoint.length > 0) {
    const fileList = diagnostics.existingWithoutEntrypoint
      .slice(0, 3)
      .join(', ');
    message =
      diagnostics.existingWithoutEntrypoint.length === 1
        ? `Found ${fileList} but it does not export a top-level "app", "application", or "handler" variable.`
        : `Found ${fileList} but none export a top-level "app", "application", or "handler" variable.`;
  } else if (
    diagnostics.pyprojectAppScript &&
    diagnostics.pyprojectCheckedPaths?.length
  ) {
    const checked = diagnostics.pyprojectCheckedPaths.join(' or ');
    message = `pyproject.toml [project.scripts] defines app = "${diagnostics.pyprojectAppScript}" but ${checked} was not found.`;
  } else if (diagnostics.otherPyFiles.length > 0) {
    const fileList = diagnostics.otherPyFiles.slice(0, 5).join(', ');
    message = `No ${framework} entrypoint found in standard locations. Found Python files: ${fileList}. Rename one to app.py or add an "app" script to [project.scripts] in pyproject.toml.`;
  } else {
    const searchedList = PYTHON_CANDIDATE_ENTRYPOINTS.join(', ');
    message = `No ${framework} entrypoint found. Add an 'app' script in pyproject.toml or define an entrypoint in one of: ${searchedList}.`;
  }

  return new NowBuildError({ code, message, link, action });
}

/**
 * Detect a Python entrypoint for any Python framework using AST-based detection.
 */
export async function detectGenericPythonEntrypoint(
  workPath: string
): Promise<{
  detected: DetectedPythonEntrypoint | null;
  findDiagnostics: FindResult;
}> {
  try {
    // Search candidate locations using AST-based detection
    const result = await findValidEntrypoint(
      workPath,
      PYTHON_CANDIDATE_ENTRYPOINTS
    );
    return {
      detected: result.entrypoint ? { entrypoint: result.entrypoint } : null,
      findDiagnostics: result,
    };
  } catch {
    debug('Failed to discover Python entrypoint');
    return {
      detected: null,
      findDiagnostics: { entrypoint: null, existingWithoutEntrypoint: [] },
    };
  }
}

/**
 * Detect a Django Python entrypoint: look for manage.py with
 * DJANGO_SETTINGS_MODULE, then fall back to AST-based detection if needed.
 */
export async function detectDjangoPythonEntrypoint(
  workPath: string
): Promise<{
  detected: DetectedPythonEntrypoint | null;
  findDiagnostics: FindResult;
  dirs: string[];
}> {
  const emptyResult = {
    detected: null,
    findDiagnostics: {
      entrypoint: null,
      existingWithoutEntrypoint: [],
    } as FindResult,
    dirs: PYTHON_ENTRYPOINT_DIRS,
  };
  try {
    // Get root directories (workPath root + immediate subdirs)
    const subdirs = await getSubdirectories(workPath);
    const rootDirs = ['', ...subdirs];

    // Look for a Django manage.py in workPath and immediate subdirectories.
    for (const rootDir of rootDirs) {
      const currPath = join(workPath, rootDir);
      const isDjango = await checkDjangoManage(currPath);
      if (isDjango) {
        // Defer to the Django framework hook for entrypoint resolution.
        return {
          detected: { baseDir: rootDir },
          findDiagnostics: { entrypoint: null, existingWithoutEntrypoint: [] },
          dirs: rootDirs,
        };
      }
    }

    // Fall back to AST-based detection,
    // Look in all immediate subdirectories, not just those specified in PYTHON_ENTRYPOINT_DIRS.
    const candidates = getCandidateEntrypointsInDirs(rootDirs);
    const result = await findValidEntrypoint(workPath, candidates);
    return {
      detected: result.entrypoint ? { entrypoint: result.entrypoint } : null,
      findDiagnostics: result,
      dirs: rootDirs,
    };
  } catch {
    debug('Failed to discover Django Python entrypoint');
    return emptyResult;
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

  // Otherwise do a search, collecting diagnostics for better error messages
  let findDiagnostics: FindResult;
  let searchDirs: string[];

  if (framework === 'django') {
    const djangoResult = await detectDjangoPythonEntrypoint(workPath);
    findDiagnostics = djangoResult.findDiagnostics;
    searchDirs = djangoResult.dirs;
    if (djangoResult.detected) {
      if (djangoResult.detected.entrypoint) return djangoResult.detected;
      // Prepare a diagnostic error in case the Django framework hook also fails.
      const candidateSet = new Set(getCandidateEntrypointsInDirs(searchDirs));
      const otherPyFiles = await findOtherPyFiles(
        workPath,
        searchDirs,
        candidateSet
      );
      const pyprojectResult = await getPyprojectEntrypoint(workPath);
      const diagnostics: EntrypointDiagnostics = {
        existingWithoutEntrypoint: findDiagnostics.existingWithoutEntrypoint,
        otherPyFiles,
        pyprojectAppScript: pyprojectResult.appScript,
        pyprojectCheckedPaths: pyprojectResult.checkedPaths,
      };
      return {
        baseDir: djangoResult.detected.baseDir,
        error: makeDiagnosticError('django', diagnostics),
      };
    }
  } else {
    const genericResult = await detectGenericPythonEntrypoint(workPath);
    findDiagnostics = genericResult.findDiagnostics;
    searchDirs = PYTHON_ENTRYPOINT_DIRS;
    if (genericResult.detected) return genericResult.detected;
  }

  // Check pyproject.toml [project.scripts] for an "app" entry
  const pyprojectResult = await getPyprojectEntrypoint(workPath);
  if (pyprojectResult.entrypoint) {
    return { entrypoint: pyprojectResult.entrypoint };
  }

  // No entrypoint found — build a targeted error from collected diagnostics
  const candidateSet = new Set(getCandidateEntrypointsInDirs(searchDirs));
  const otherPyFiles = await findOtherPyFiles(
    workPath,
    searchDirs,
    candidateSet
  );
  const diagnostics: EntrypointDiagnostics = {
    existingWithoutEntrypoint: findDiagnostics.existingWithoutEntrypoint,
    otherPyFiles,
    pyprojectAppScript: pyprojectResult.appScript,
    pyprojectCheckedPaths: pyprojectResult.checkedPaths,
  };
  return { error: makeDiagnosticError(framework, diagnostics) };
}
