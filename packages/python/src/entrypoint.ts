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
import execa from 'execa';
import { getUvBinaryOrInstall } from './install';

export const PYTHON_ENTRYPOINT_FILENAMES = ['app', 'index', 'server', 'main'];
export const PYTHON_ENTRYPOINT_DIRS = ['', 'src', 'app', 'api'];
export const PYTHON_APP_CANDIDATE_REGEX = /\bapp\b/;
export const PYTHON_CANDIDATE_ENTRYPOINTS = PYTHON_ENTRYPOINT_FILENAMES.flatMap(
  filename =>
    PYTHON_ENTRYPOINT_DIRS.map(dir => pathPosix.join(dir, `${filename}.py`))
);

let cachedPythonAstCheckScriptPath: string | null = null;

function resolvePythonAstCheckScriptPath(): string {
  // When running from source/tests, __dirname points to `src/`.
  // When running from the published package, __dirname points to `dist/`.
  const candidates = [
    join(__dirname, '..', 'entrypoint.py'),
    join(__dirname, '..', '..', 'entrypoint.py'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new NowBuildError({
    code: 'PYTHON_ENTRYPOINT_AST_SCRIPT_NOT_FOUND',
    message:
      'Failed to locate "entrypoint.py" used for Python entrypoint discovery.',
  });
}

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

export async function hasAppExport(
  file: FileFsRef | { fsPath?: string }
): Promise<boolean> {
  const fsPath = (file as FileFsRef).fsPath;
  if (!fsPath) return false;
  if (!fsPath.endsWith('.py')) return false;
  const source = fs.readFileSync(fsPath, 'utf8');
  if (!source) return false;
  if (!PYTHON_APP_CANDIDATE_REGEX.test(source)) return false;

  // Cache the script path on first use
  if (cachedPythonAstCheckScriptPath === null) {
    cachedPythonAstCheckScriptPath = resolvePythonAstCheckScriptPath();
  }

  try {
    const uvPath = await getUvBinaryOrInstall(
      process.env.VERCEL_PYTHON_PATH || ''
    );
    const res = await execa(
      uvPath,
      ['run', 'python', cachedPythonAstCheckScriptPath],
      {
        input: source,
        cwd: process.cwd(),
      }
    );
    const out = res.stdout.trim();
    return out === '1';
  } catch (err) {
    debug('Failed to check for app export', err);
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

async function scanEntrypoints(
  fsFiles: Record<string, FileFsRef>,
  maxDepth: number
): Promise<string[]> {
  const matches: string[] = [];
  for (const [p, ref] of Object.entries(fsFiles)) {
    if (!shouldScanPathForEntrypoint(p, maxDepth)) continue;
    if (await hasAppExport(ref)) matches.push(p);
  }
  return matches;
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
  const entrypoint = (await getPyprojectEntrypoint(workPath)) || null;
  if (entrypoint) return entrypoint;

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

  // If the configured entry exists, only accept it when it exports `app`.
  // Otherwise treat it like a missing entrypoint and fall back to discovery.
  if (fsFiles[entry] && (await hasAppExport(fsFiles[entry]))) return entry;

  const candidates = PYTHON_CANDIDATE_ENTRYPOINTS.filter(c => !!fsFiles[c]);
  if (candidates.length > 0) {
    const matched: string[] = [];
    for (const c of candidates) {
      if (await hasAppExport(fsFiles[c])) {
        matched.push(c);
      }
    }

    if (matched.length === 1) {
      debug(`Detected ${framework} entrypoint: ${matched[0]}`);
      return matched[0];
    } else if (matched.length > 1) {
      throwAmbiguousEntrypointError(framework, matched);
    }
  }

  // No standard candidates matched, so do a shallow scan for a clear framework entrypoint.
  const scannedMatches = await scanEntrypoints(
    fsFiles,
    PYTHON_ENTRYPOINT_MAX_SEARCH_DEPTH
  );
  if (scannedMatches.length === 1) {
    debug(`Detected ${framework} entrypoint via scan: ${scannedMatches[0]}`);
    return scannedMatches[0];
  } else if (scannedMatches.length > 1) {
    throwAmbiguousEntrypointError(framework, scannedMatches);
  }

  return null;
}
