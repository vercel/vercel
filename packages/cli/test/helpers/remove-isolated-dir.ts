import { chmodSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

/** Prefix of the run-wide root created by `vitest.global-setup.mts`. */
export const ISOLATED_DIR_PREFIX = 'vercel-cli-test-';

// Resolve symlinks so both sides of the containment check use the same form.
// macOS `os.tmpdir()` returns `/var/...`, a symlink to `/private/var/...`.
// Missing trailing segments are kept as-is under their nearest existing
// ancestor.
function canonicalPath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch (err) {
    const parent = dirname(resolved);
    if (
      (err as NodeJS.ErrnoException).code !== 'ENOENT' ||
      parent === resolved
    ) {
      throw err;
    }
    return join(canonicalPath(parent), basename(resolved));
  }
}

// Captured when the module loads, which happens before any test file runs, so
// a test that changes `TMPDIR` cannot widen what this helper may delete.
const tempRoot = canonicalPath(tmpdir());

/**
 * Throw unless `dir` is a `vercel-cli-test-*` dir, or a path inside one,
 * directly under the OS temp dir.
 */
export function assertIsolatedTempDir(dir: string): void {
  const rel = relative(tempRoot, canonicalPath(dir));
  const [topLevel] = rel.split(sep);
  // `relative` returns an absolute path across Windows drives, a `..` segment
  // when `dir` is outside the temp dir, and '' when it is the temp dir.
  if (isAbsolute(rel) || !topLevel.startsWith(ISOLATED_DIR_PREFIX)) {
    throw new Error(
      `Refusing to remove ${dir}: it is not inside a ${ISOLATED_DIR_PREFIX}* directory under ${tempRoot}`
    );
  }
}

// Restore owner write permission so `rmSync` can unlink every entry. Go marks
// its module cache read-only, and the Go builder keeps that cache under the
// redirected XDG cache dir.
function makeTreeWritable(dir: string): void {
  chmodSync(dir, 0o700);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      makeTreeWritable(entryPath);
    } else if (entry.isFile()) {
      // Read-only files block deletion on Windows.
      chmodSync(entryPath, 0o600);
    }
  }
}

/**
 * Remove a test-owned temp dir, including trees that tools such as Go made
 * read-only. Throws without touching anything if `dir` is not a
 * `vercel-cli-test-*` temp dir.
 */
export function removeIsolatedDir(dir: string): void {
  assertIsolatedTempDir(dir);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // A denied unlink surfaces as EACCES on Linux, ENOTEMPTY on macOS, and
    // EPERM on Windows, so retry once after any failure.
    makeTreeWritable(dir);
    rmSync(dir, { recursive: true, force: true });
  }
}
