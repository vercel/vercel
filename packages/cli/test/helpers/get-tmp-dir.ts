// @ts-ignore
import tmp from 'tmp-promise';
import type { TmpDir } from './types';

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
