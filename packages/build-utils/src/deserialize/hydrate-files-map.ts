import type { Files } from '../types';
import FileFsRef from '../file-fs-ref';
import { join } from 'path';

export async function hydrateFilesMap(
  files: Files,
  filesMap: Record<string, string>,
  fileHashes: Record<string, string> | undefined,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>
) {
  for (const [funcPath, projectPath] of Object.entries(filesMap)) {
    files[funcPath] = await fileFsRefCached(
      join(repoRootPath, projectPath),
      fileHashes?.[funcPath],
      fileFsRefsCache
    );
  }
}

async function fileFsRefCached(
  fsPath: string,
  contentHash: string | undefined,
  cache: Map<string, FileFsRef>
) {
  let file = cache.get(fsPath);
  if (!file) {
    file = await FileFsRef.fromFsPath({ fsPath, contentHash });
    cache.set(fsPath, file);
  }
  return file;
}
