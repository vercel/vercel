// @ts-ignore
import tmp from 'tmp-promise';
import type { TmpDir } from './types';

// Security Note: This uses tmp-promise@1.0.3 which depends on tmp@0.0.31.
// This version is safe from the symbolic link vulnerability (CVE pending) 
// that affects tmp@0.2.0-0.2.3. The vulnerability allows bypassing directory
// restrictions via symlinks. See SECURITY-tmp.md for details.

const allTmpDirs: TmpDir[] = [];
let cachedTmpDir: TmpDir | undefined;

export function getCachedTmpDir(): string {
  if (cachedTmpDir) {
    return cachedTmpDir.name;
  }

  cachedTmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  }) as TmpDir;

  allTmpDirs.push(cachedTmpDir);
  return cachedTmpDir.name;
}

export function getNewTmpDir(): string {
  const tmpDir = tmp.dirSync({
    // This ensures the directory gets
    // deleted even if it has contents
    unsafeCleanup: true,
  }) as TmpDir;

  allTmpDirs.push(tmpDir);
  return tmpDir.name;
}

export function listTmpDirs() {
  return allTmpDirs;
}
