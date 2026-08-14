import type { Files } from '../types';
import FileFsRef from '../file-fs-ref';
import { join } from 'path';

export async function hydrateFilesMap(
  files: Files,
  filesMap: Record<string, string>,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>
) {
  for (const [funcPath, projectPath] of Object.entries(filesMap)) {
    files[funcPath] = await fileFsRefCached(
      join(repoRootPath, projectPath),
      fileFsRefsCache
    );
  }
}

async function fileFsRefCached(fsPath: string, cache: Map<string, FileFsRef>) {
  let file = cache.get(fsPath);
  if (!file) {
    file = await FileFsRef.fromFsPath({ fsPath });
    cache.set(fsPath, file);
  }
  return file;
}
