import execa from 'execa';
import which from 'which';
import fs from 'fs';
import { join, sep } from 'path';
import { debug } from '@vercel/build-utils';
import type { DistributionIndex } from '@vercel/python-analysis';

/**
 * Match native shared libraries: `foo.so`, `foo.so.1`, `foo.so.1.2.3`.
 * These are ELF objects shipped inside binary wheels (numpy, pydantic-core,
 * cryptography, etc.) and usually retain debug symbols that are dead weight at
 * runtime.
 */
export function isNativeLibrary(filePath: string): boolean {
  const name = filePath.split(sep).pop() ?? '';
  return /\.so(\.\d+)*$/.test(name);
}

/** Whether the user has explicitly disabled native library stripping. */
function isStripDisabled(): boolean {
  const value = process.env.VERCEL_PYTHON_STRIP_DEBUG;
  if (value === undefined || value === '') return false;
  const lower = value.toLowerCase();
  return lower === '0' || lower === 'false';
}

type CanonicalArch = 'x86_64' | 'aarch64';

/** Canonical architecture of the build host. */
function hostArch(): CanonicalArch | undefined {
  switch (process.arch) {
    case 'x64':
      return 'x86_64';
    case 'arm64':
      return 'aarch64';
    default:
      return undefined;
  }
}

/** Normalize the various architecture spellings to a canonical value. */
function normalizeArch(arch: string | undefined): CanonicalArch | undefined {
  if (!arch) return undefined;
  if (arch === 'x86_64' || arch === 'x64') return 'x86_64';
  if (arch === 'aarch64' || arch === 'arm64') return 'aarch64';
  return undefined;
}

async function findTool(name: string): Promise<string | null> {
  try {
    return await which(name);
  } catch {
    return null;
  }
}

interface StripTool {
  bin: string;
  args: string[];
}

/**
 * Resolve a strip binary capable of processing objects for the target
 * architecture.
 *
 * `llvm-strip` is architecture-agnostic, so it is preferred when present (it
 * also handles cross-architecture builds).  Otherwise we fall back to binutils
 * `strip`, which can only process the host architecture's ELF objects — so it
 * is only used when the build host and the deploy target share an architecture.
 *
 * Uses `--strip-debug`, which removes only the DWARF debug sections (`.debug_*`)
 * and leaves every symbol table (`.symtab`/`.dynsym`) intact.  Those debug
 * sections are never mapped into memory at runtime, so removing them cannot
 * change runtime behavior; symbol names remain available for native crash
 * backtraces (only source line numbers are lost).
 */
async function resolveStripTool(
  targetArch: CanonicalArch | undefined
): Promise<StripTool | null> {
  const llvm = await findTool('llvm-strip');
  if (llvm) {
    return { bin: llvm, args: ['--strip-debug'] };
  }

  const strip = await findTool('strip');
  if (!strip) {
    return null;
  }

  const host = hostArch();
  // An undefined target means we are building on the deploy image itself, so
  // the target architecture is the host architecture.
  const effectiveTarget = targetArch ?? host;
  if (host && effectiveTarget && host === effectiveTarget) {
    return { bin: strip, args: ['--strip-debug'] };
  }

  return null;
}

/** Run an async function over `items` with a bounded level of concurrency. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) break;
        results[index] = await fn(items[index]);
      }
    })()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Maximum number of files passed to a single `strip` invocation.
 * Bounded to keep a single batch failure cheap to retry per-file.
 */
const STRIP_BATCH_MAX_FILES = 256;

/**
 * Soft cap on total argv bytes per batch (path lengths + separators).
 * 64 KB is far under any ARG_MAX and keeps retry overhead minimal.
 */
const STRIP_BATCH_MAX_ARGV_BYTES = 64 * 1024;

/**
 * Partition file paths into batches for `strip`, which accepts many file
 * arguments.  Each batch is bounded by both file count and total argv bytes
 * so a single failing batch can be efficiently retried per-file.
 */
function buildStripBatches(paths: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentArgvBytes = 0;

  for (const p of paths) {
    const argBytes = p.length + 1;
    if (
      current.length >= STRIP_BATCH_MAX_FILES ||
      (current.length > 0 &&
        currentArgvBytes + argBytes > STRIP_BATCH_MAX_ARGV_BYTES)
    ) {
      batches.push(current);
      current = [];
      currentArgvBytes = 0;
    }
    current.push(p);
    currentArgvBytes += argBytes;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

interface StripOptions {
  sitePackageDirs: string[];
  distributions: Map<string, DistributionIndex>;
  /** Deploy target architecture (`x86_64`, `aarch64`, `arm64`, or undefined). */
  targetArch: string | undefined;
  /** Skip stripping in `vercel dev`. */
  isDev?: boolean;
}

interface StripResult {
  /** Number of `.so` files successfully stripped. */
  count: number;
  /** Total bytes removed across all stripped libraries. */
  savedBytes: number;
}

/**
 * Strip debug symbols from the native shared libraries of installed
 * dependencies, in place, to reduce the uncompressed bundle size.
 *
 * Best-effort: any file that cannot be stripped (incompatible object, missing
 * tool, error) is left untouched.  Callers must re-`stat` native libraries
 * afterwards since their RECORD sizes become stale.
 */
export async function stripNativeLibraries({
  sitePackageDirs,
  distributions,
  targetArch,
  isDev,
}: StripOptions): Promise<StripResult> {
  const empty: StripResult = { count: 0, savedBytes: 0 };

  if (isDev) {
    return empty;
  }
  if (isStripDisabled()) {
    debug('native library stripping disabled via VERCEL_PYTHON_STRIP_DEBUG');
    return empty;
  }

  const tool = await resolveStripTool(normalizeArch(targetArch));
  if (!tool) {
    debug(
      'skipping native library stripping: no compatible strip tool for the target architecture'
    );
    return empty;
  }

  // Collect the unique set of native library paths across all distributions.
  const candidates = new Set<string>();
  for (const dir of sitePackageDirs) {
    const dirDistributions = distributions.get(dir);
    if (!dirDistributions) continue;
    for (const [, dist] of dirDistributions) {
      for (const { path: rawPath } of dist.files) {
        const relPath = rawPath.replaceAll('/', sep);
        if (isNativeLibrary(relPath)) {
          candidates.add(join(dir, relPath));
        }
      }
    }
  }

  if (candidates.size === 0) {
    return empty;
  }

  const paths = [...candidates];

  // Stat all candidates in parallel to record pre-strip sizes and filter
  // out any files that are missing on disk.
  const statResults = await mapWithConcurrency(paths, 16, async fsPath => {
    try {
      const stats = await fs.promises.stat(fsPath);
      return { fsPath, before: stats.size };
    } catch {
      return null;
    }
  });

  const existing = statResults.filter(
    (r): r is { fsPath: string; before: number } => r !== null
  );
  if (existing.length === 0) {
    return empty;
  }

  const existingPaths = existing.map(e => e.fsPath);
  const beforeMap = new Map(existing.map(e => [e.fsPath, e.before]));

  // Batch file paths to reduce process spawns.  `strip` accepts many file
  // arguments, so batching cuts spawns from O(n) to O(n / batch_size).
  const batches = buildStripBatches(existingPaths);

  // Run batches with bounded concurrency.  On a batch failure, fall back to
  // per-file stripping for that batch: `strip` processes files sequentially
  // and may stop mid-batch on an incompatible object.  Re-stripping
  // already-stripped files is idempotent, so per-file retry is safe and
  // recovers partial success.
  const stripBatch = async (batchPaths: string[]): Promise<void> => {
    try {
      await execa(tool.bin, [...tool.args, ...batchPaths]);
    } catch {
      await mapWithConcurrency(batchPaths, 16, async fsPath => {
        try {
          await execa(tool.bin, [...tool.args, fsPath]);
        } catch (err) {
          debug(`could not strip "${fsPath}": ${JSON.stringify(err)}`);
        }
      });
    }
  };

  await mapWithConcurrency(batches, 16, stripBatch);

  // Stat all stripped files in parallel to compute per-file savings.
  const afterResults = await mapWithConcurrency(
    existingPaths,
    16,
    async fsPath => {
      try {
        const stats = await fs.promises.stat(fsPath);
        return { fsPath, after: stats.size };
      } catch {
        return null;
      }
    }
  );

  let savedBytes = 0;
  let count = 0;
  for (const result of afterResults) {
    if (!result) continue;
    const before = beforeMap.get(result.fsPath);
    if (before === undefined) continue;
    const saved = Math.max(0, before - result.after);
    if (saved > 0) {
      savedBytes += saved;
      count += 1;
    }
  }

  if (count > 0) {
    const savedMB = (savedBytes / (1024 * 1024)).toFixed(2);
    debug(`Stripped ${count} native libraries, saving ${savedMB} MB`);
  }

  return { count, savedBytes };
}
