import execa from 'execa';
import { debug, FileFsRef, type Files } from '@vercel/build-utils';
import fs from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';

/** Converts a hung compileall subprocess into a skipped optimization. */
export const COMPILEALL_TIMEOUT_MS = 5 * 60 * 1000;

/** Zip directory holding the `sys.pycache_prefix` bytecode tree. */
export const PYCACHE_PREFIX_DIR = '_vc_pycache';

/**
 * Runtime path of the bytecode tree (zip extracts to /var/task). Set as
 * PYTHONPYCACHEPREFIX so imports resolve bytecode from the read-only zip,
 * even for sources installed into /tmp at cold start.
 */
export const RUNTIME_PYCACHE_PREFIX = `/var/task/${PYCACHE_PREFIX_DIR}`;

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

export interface CompileAllResult {
  success: boolean;
  /**
   * Per-file compile seconds keyed by the exact source paths passed in.
   * Undefined when the coordinator did not emit a table (old template,
   * mocked subprocess, write failure) — callers fall back to size ranking.
   */
  timings?: Map<string, number>;
}

/**
 * Runs the Python compile coordinator to precompile `.py` files into `.pyc`
 * bytecode.
 *
 * Uses `--invalidation-mode unchecked-hash` for fastest cold-start: the
 * bytecode is trusted without re-hashing the source on every import.  This
 * is safe because Lambda payloads are immutable after deployment.
 *
 * Coordinator failures are logged but not surfaced to the user.
 */
export async function runCompileAll({
  pythonBin,
  sourceFiles,
  env,
  pycachePrefix,
}: {
  pythonBin: string;
  sourceFiles: string[];
  env?: NodeJS.ProcessEnv;
  pycachePrefix?: string;
}): Promise<CompileAllResult> {
  const uniqueSourceFiles = [...new Set(sourceFiles)];
  if (uniqueSourceFiles.length === 0) {
    return { success: false };
  }

  let tempDir: string | undefined;

  try {
    tempDir = await fs.promises.mkdtemp(
      join(tmpdir(), 'vercel-python-compileall-')
    );
    const listPath = join(tempDir, 'pysources.json');
    await fs.promises.writeFile(listPath, JSON.stringify(uniqueSourceFiles));
    const timingsPath = join(tempDir, 'timings.json');
    const scriptPath = join(__dirname, '..', 'templates', 'vc_compileall.py');

    const baseEnv = env || process.env;
    const subprocessEnv = pycachePrefix
      ? { ...baseEnv, PYTHONPYCACHEPREFIX: pycachePrefix }
      : baseEnv;

    await execa(pythonBin, [scriptPath, listPath, timingsPath], {
      env: subprocessEnv,
      timeout: COMPILEALL_TIMEOUT_MS,
    });

    let timings: Map<string, number> | undefined;
    try {
      const raw = await fs.promises.readFile(timingsPath, 'utf8');
      timings = new Map(Object.entries(JSON.parse(raw)));
    } catch (err) {
      debug(`compileall timings unavailable: ${String(err)}`);
    }
    return { success: true, timings };
  } catch (err) {
    debug(`compileall error details: ${JSON.stringify(err)}`);
    return { success: false };
  } finally {
    if (tempDir) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (err) {
        debug(`compileall temporary file cleanup error: ${String(err)}`);
      }
    }
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

/**
 * Prefix-tree relative `.pyc` path (no `__pycache__` component):
 * `"pkg/mod.py"` → `"pkg/mod.cpython-312.pyc"`. Null for non-`.py` input.
 */
export function derivePrefixPycRelPath(
  pyRelPath: string,
  pythonMajor: number,
  pythonMinor: number
): string | null {
  if (!pyRelPath.endsWith('.py')) return null;
  return `${pyRelPath.slice(0, -3)}.cpython-${pythonMajor}${pythonMinor}.pyc`;
}

/**
 * Port of the root stripping CPython's `cache_from_source`
 * applies in pycache-prefix mode (importlib/_bootstrap_external.py).
 */
function stripPycachePrefixRoot(head: string): string {
  const pycachePathSeparators = new Set(['/', '\\']);
  if (
    head.length > 1 &&
    head[1] === ':' &&
    !pycachePathSeparators.has(head[0])
  ) {
    head = head.slice(2);
  }
  let start = 0;
  while (start < head.length && pycachePathSeparators.has(head[start])) {
    start++;
  }
  return head.slice(start);
}

/**
 * Staged `.pyc` path produced by compileall run with
 * PYTHONPYCACHEPREFIX=stagingDir for an absolute source path.
 */
export function deriveStagedPycFsPath(
  stagingDir: string,
  srcAbsPath: string,
  pythonMajor: number,
  pythonMinor: number
): string | null {
  const rel = derivePrefixPycRelPath(
    stripPycachePrefixRoot(srcAbsPath),
    pythonMajor,
    pythonMinor
  );
  if (!rel) return null;
  return join(stagingDir, rel.replaceAll('/', sep));
}

/**
 * Zip bundle key of the `.pyc` for a source living at `runtimeAbsPath`:
 * `_vc_pycache/<runtime path, .py → .<tag>.pyc>`.
 */
export function derivePrefixPycBundlePath(
  runtimeAbsPath: string,
  pythonMajor: number,
  pythonMinor: number
): string | null {
  const rel = derivePrefixPycRelPath(
    stripPycachePrefixRoot(runtimeAbsPath),
    pythonMajor,
    pythonMinor
  );
  if (!rel) return null;
  return `${PYCACHE_PREFIX_DIR}/${rel}`;
}

/**
 * A single `.pyc` candidate for bytecode packing, at per-file granularity.
 */
export interface BytecodeItem {
  /** Bundle-relative path of the `.pyc` file. */
  bundlePath: string;
  file: FileFsRef;
  /** Uncompressed `.pyc` size in bytes (the knapsack weight). */
  size: number;
  /**
   * Module identity for import-closure membership: workPath-relative for
   * app files, site-packages-relative for vendor files (forward slashes).
   */
  moduleKey: string;
  /** Absolute fs path of the `.py` source (join key for compile timings). */
  sourceAbsPath: string;
}

export interface BytecodeCollectionResult {
  /** FileFsRef entries for .pyc files, keyed by bundle-relative path. */
  files: Files;
  /** Total uncompressed size of all collected .pyc files. */
  totalSize: number;
  /** Per-item bytecode sizes for knapsack packing (keyed by package name or bundle path). */
  perItemSizes: Map<string, number>;
  /** Per-file candidates for import-aware, value-ranked packing. */
  items: BytecodeItem[];
}

/**
 * Collect staged prefix `.pyc` files for the app's bundled `.py` sources,
 * keyed under `_vc_pycache/<runtimeTaskRoot>/...`. Missing staged files are
 * silently dropped.
 */
export async function collectAppPrefixBytecodeFiles({
  stagingDir,
  workPath,
  files: appFiles,
  runtimeTaskRoot,
  pythonMajor,
  pythonMinor,
}: {
  stagingDir: string;
  workPath: string;
  files: Files;
  runtimeTaskRoot: string;
  pythonMajor: number;
  pythonMinor: number;
}): Promise<BytecodeCollectionResult> {
  const pending: {
    bundlePath: string;
    srcFsPath: string;
    moduleKey: string;
    sourceAbsPath: string;
  }[] = [];

  for (const bundlePath of Object.keys(appFiles)) {
    if (!bundlePath.endsWith('.py')) continue;

    const sourceAbsPath = join(workPath, bundlePath.replaceAll('/', sep));
    const stagedFsPath = deriveStagedPycFsPath(
      stagingDir,
      sourceAbsPath,
      pythonMajor,
      pythonMinor
    );
    const pycBundlePath = derivePrefixPycBundlePath(
      `${runtimeTaskRoot}/${bundlePath}`,
      pythonMajor,
      pythonMinor
    );
    if (!stagedFsPath || !pycBundlePath) continue;

    pending.push({
      bundlePath: pycBundlePath,
      srcFsPath: stagedFsPath,
      moduleKey: bundlePath,
      sourceAbsPath,
    });
  }

  const results = await Promise.all(
    pending.map(async ({ bundlePath, srcFsPath, moduleKey, sourceAbsPath }) => {
      try {
        const stats = await fs.promises.stat(srcFsPath);
        return {
          bundlePath,
          srcFsPath,
          moduleKey,
          sourceAbsPath,
          size: stats.size,
        };
      } catch {
        return null;
      }
    })
  );

  const files: Files = {};
  const perItemSizes = new Map<string, number>();
  const items: BytecodeItem[] = [];
  let totalSize = 0;

  for (const result of results) {
    if (!result) continue;
    const file = new FileFsRef({
      fsPath: result.srcFsPath,
      size: result.size,
    });
    files[result.bundlePath] = file;
    perItemSizes.set(result.bundlePath, result.size);
    items.push({
      bundlePath: result.bundlePath,
      file,
      size: result.size,
      moduleKey: result.moduleKey,
      sourceAbsPath: result.sourceAbsPath,
    });
    totalSize += result.size;
  }

  return { files, totalSize, perItemSizes, items };
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
  const pending: {
    bundlePath: string;
    srcFsPath: string;
    moduleKey: string;
    sourceAbsPath: string;
  }[] = [];

  for (const bundlePath of Object.keys(appFiles)) {
    const pycRel = derivePycPath(bundlePath, pythonMajor, pythonMinor);
    if (!pycRel) continue;

    pending.push({
      bundlePath: pycRel,
      srcFsPath: join(workPath, pycRel.replaceAll('/', sep)),
      moduleKey: bundlePath,
      sourceAbsPath: join(workPath, bundlePath.replaceAll('/', sep)),
    });
  }

  const results = await Promise.all(
    pending.map(async ({ bundlePath, srcFsPath, moduleKey, sourceAbsPath }) => {
      try {
        const stats = await fs.promises.stat(srcFsPath);
        return {
          bundlePath,
          srcFsPath,
          moduleKey,
          sourceAbsPath,
          size: stats.size,
        };
      } catch {
        return null;
      }
    })
  );

  const files: Files = {};
  const perItemSizes = new Map<string, number>();
  const items: BytecodeItem[] = [];
  let totalSize = 0;

  for (const result of results) {
    if (!result) continue;
    const file = new FileFsRef({
      fsPath: result.srcFsPath,
      size: result.size,
    });
    files[result.bundlePath] = file;
    perItemSizes.set(result.bundlePath, result.size);
    items.push({
      bundlePath: result.bundlePath,
      file,
      size: result.size,
      moduleKey: result.moduleKey,
      sourceAbsPath: result.sourceAbsPath,
    });
    totalSize += result.size;
  }

  return { files, totalSize, perItemSizes, items };
}
