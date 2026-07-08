import execa from 'execa';
import { debug, FileFsRef, type Files } from '@vercel/build-utils';
import fs from 'fs';
import { join, sep } from 'path';

/** Converts a hung compileall subprocess into a skipped optimization. */
export const COMPILEALL_TIMEOUT_MS = 5 * 60 * 1000;

function isCompileAllFlagEnabled(): boolean {
  const val = process.env.VERCEL_PYTHON_COMPILEALL;
  if (val === undefined || val === '') return false;

  const lower = val.toLowerCase();
  return lower === '1' || lower === 'true';
}

/**
 * Whether to precompile bytecode, gated by `VERCEL_PYTHON_COMPILEALL`
 * (`1`/`true`). Callers decide the fill capacity based on which deploy path
 * the function takes.
 */
export function shouldCompileAll({
  isDev,
  hasCustomCommand,
  hasPreDeployCommand,
}: {
  isDev?: boolean;
  hasCustomCommand: boolean;
  hasPreDeployCommand?: boolean;
}): boolean {
  if (isDev) return false;

  // Custom install commands replace the standard install, leaving no
  // known-good venv layout to compile against. Custom build commands are
  // safe: they run after the standard install, and bytecode collection
  // degrades gracefully.
  if (hasCustomCommand) return false;

  // Precompiled bytecode uses `--invalidation-mode unchecked-hash`, which trusts
  // the .pyc without re-hashing the source at import — safe only because the
  // build output is normally immutable. A `preDeployCommand` runs after the build
  // and can rewrite source files, which would leave the (already-compiled) bytecode
  // stale and served instead of the updated source. Skip precompilation in that case.
  if (hasPreDeployCommand) return false;

  return isCompileAllFlagEnabled();
}

interface CompileAllOptions {
  /** Path to the venv Python binary (e.g. from getVenvPythonBin). */
  pythonBin: string;
  /** Files or directories to compile. */
  filesOrDirectories: string[];
  /** Environment to pass to the subprocess. */
  env?: NodeJS.ProcessEnv;
  /** Optional regular expression passed to compileall's -x skip filter. */
  excludeRegex?: string;
}

/**
 * Run `python -m compileall` to precompile `.py` files into `.pyc` bytecode.
 *
 * Uses `--invalidation-mode unchecked-hash` for fastest cold-start: the
 * bytecode is trusted without re-hashing the source on every import.  This
 * is safe because Lambda payloads are immutable after deployment.
 *
 * Failures are logged but not surfaced to the user
 */
export async function runCompileAll({
  pythonBin,
  filesOrDirectories,
  env,
  excludeRegex,
}: CompileAllOptions): Promise<void> {
  if (filesOrDirectories.length === 0) return;

  const args = [
    '-m',
    'compileall',
    '-q',
    '-j',
    '0',
    '-f',
    '--invalidation-mode',
    'unchecked-hash',
    ...(excludeRegex ? ['-x', excludeRegex] : []),
    ...filesOrDirectories,
  ];

  try {
    await execa(pythonBin, args, {
      env: env || process.env,
      timeout: COMPILEALL_TIMEOUT_MS,
    });
  } catch (err) {
    debug(`compileall error details: ${JSON.stringify(err)}`);
  }
}

/**
 * Derive the expected `__pycache__` `.pyc` path for a given `.py` source
 * file relative path and CPython version.
 *
 * For example, given `"pkg/mod.py"` and version `(3, 12)`, returns
 * `"pkg/__pycache__/mod.cpython-312.pyc"`.
 *
 * Returns `null` if the input is not a `.py` file.
 */
export function derivePycPath(
  pyRelPath: string,
  pythonMajor: number,
  pythonMinor: number
): string | null {
  if (!pyRelPath.endsWith('.py')) return null;

  const lastSlash = pyRelPath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : pyRelPath.slice(0, lastSlash + 1);
  const baseName = pyRelPath.slice(lastSlash + 1, -3); // strip ".py"

  return `${dir}__pycache__/${baseName}.cpython-${pythonMajor}${pythonMinor}.pyc`;
}

export interface BytecodeCollectionResult {
  /** FileFsRef entries for .pyc files, keyed by bundle-relative path. */
  files: Files;
  /** Total uncompressed size of all collected .pyc files. */
  totalSize: number;
  /** Per-item bytecode sizes for knapsack packing (keyed by package name or bundle path). */
  perItemSizes: Map<string, number>;
}

/**
 * Directories excluded from application bytecode compilation.
 * Mirrors the predefined excludes used by the source-file glob in the
 * builder so that compileall does not waste time on files that will
 * never enter the Lambda bundle.
 */
const COMPILEALL_APP_EXCLUDED_DIRS = [
  '.git',
  '.vercel',
  '.pnpm-store',
  'node_modules',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.ruff_cache',
  'public',
];

function escapePythonRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/**
 * Build a Python regex for the `-x` flag of `compileall` that skips the
 * same directories the source-file glob excludes.
 */
export function getCompileAllAppExcludeRegex(workPath: string): string {
  const excludedDirs =
    COMPILEALL_APP_EXCLUDED_DIRS.map(escapePythonRegex).join('|');
  return `${escapePythonRegex(workPath)}[/\\\\](?:${excludedDirs})(?:[/\\\\]|$)`;
}

export async function collectAppBytecodeFiles({
  workPath,
  files: appFiles,
  pythonMajor,
  pythonMinor,
}: {
  workPath: string;
  files: Files;
  pythonMajor: number;
  pythonMinor: number;
}): Promise<BytecodeCollectionResult> {
  const pending: { bundlePath: string; srcFsPath: string }[] = [];

  for (const bundlePath of Object.keys(appFiles)) {
    const pycRel = derivePycPath(bundlePath, pythonMajor, pythonMinor);
    if (!pycRel) continue;

    pending.push({
      bundlePath: pycRel,
      srcFsPath: join(workPath, pycRel.replaceAll('/', sep)),
    });
  }

  const results = await Promise.all(
    pending.map(async ({ bundlePath, srcFsPath }) => {
      try {
        const stats = await fs.promises.stat(srcFsPath);
        return { bundlePath, srcFsPath, size: stats.size };
      } catch {
        return null;
      }
    })
  );

  const files: Files = {};
  const perItemSizes = new Map<string, number>();
  let totalSize = 0;

  for (const result of results) {
    if (!result) continue;
    files[result.bundlePath] = new FileFsRef({
      fsPath: result.srcFsPath,
      size: result.size,
    });
    perItemSizes.set(result.bundlePath, result.size);
    totalSize += result.size;
  }

  return { files, totalSize, perItemSizes };
}
