import fs from 'fs';
import { isAbsolute, join, relative, sep } from 'path';
import FileBlob from '../file-blob';
import FileFsRef from '../file-fs-ref';
import type { Files } from '../types';
import type { StaticBundleExclusions, StaticMount } from './types';

/** Stub file that keeps an excluded mount directory present in the Lambda. */
export const STATIC_PLACEHOLDER_FILE = '.static-placeholder';

/**
 * Lambda bundle trimming for promoted mounts: exclude each mount directory
 * (inside `workPath`) from the bundle, and add a placeholder stub plus any
 * `keepFiles` present in the directory so framework startup checks (directory
 * exists, fallback file exists) still pass. Mounts outside `workPath` are
 * skipped.
 */
export function staticBundleExclusions(
  mounts: StaticMount[],
  workPath: string,
  keepFiles: string[]
): StaticBundleExclusions {
  const excludePatterns: string[] = [];
  const directoryStubs: Files = {};
  for (const mount of mounts) {
    const relDir = relative(workPath, mount.directory);
    if (!relDir || relDir.startsWith('..') || isAbsolute(relDir)) continue;
    const relDirUnix = relDir.split(sep).join('/');
    excludePatterns.push(`${relDirUnix}/**`);
    directoryStubs[`${relDirUnix}/${STATIC_PLACEHOLDER_FILE}`] = new FileBlob({
      data: '',
    });
    for (const keepFile of keepFiles) {
      const fsPath = join(mount.directory, keepFile);
      if (fs.existsSync(fsPath)) {
        directoryStubs[`${relDirUnix}/${keepFile}`] = new FileFsRef({
          fsPath,
        });
      }
    }
  }
  return { excludePatterns, directoryStubs };
}
