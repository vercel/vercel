import execa from 'execa';
import { debug } from '@vercel/build-utils';

/**
 * Check whether Python bytecode precompilation is enabled via the
 * `VERCEL_PYTHON_COMPILEALL` environment variable.
 *
 * Defaults to OFF (opt-in during initial rollout).
 */
export function isCompileAllEnabled(): boolean {
  const val = process.env.VERCEL_PYTHON_COMPILEALL;
  if (val === undefined || val === '') {
    return false;
  }
  const lower = val.toLowerCase();
  return lower === '1' || lower === 'true';
}

interface CompileAllOptions {
  /** Path to the venv Python binary (e.g. from getVenvPythonBin). */
  pythonBin: string;
  /** Directories to compile. */
  directories: string[];
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
 * Failures are logged as warnings but never fail the build — Python will
 * fall back to runtime compilation.
 */
export async function runCompileAll({
  pythonBin,
  directories,
  env,
  excludeRegex,
}: CompileAllOptions): Promise<void> {
  if (directories.length === 0) return;

  const args = [
    '-m',
    'compileall',
    '-q',
    '--invalidation-mode',
    'unchecked-hash',
    ...(excludeRegex ? ['-x', excludeRegex] : []),
    ...directories,
  ];

  try {
    await execa(pythonBin, args, { env: env || process.env });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Python bytecode compilation failed: ${message}`);
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
