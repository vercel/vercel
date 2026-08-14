import type { Files } from '../types';
import { EdgeFunction } from '../edge-function';
import type FileFsRef from '../file-fs-ref';
import { hydrateFilesMap } from './hydrate-files-map';
import type { SerializedEdgeFunction } from './serialized-types';

export async function deserializeEdgeFunction(
  files: Files,
  config: SerializedEdgeFunction,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>
): Promise<EdgeFunction> {
  if (config.filePathMap) {
    await hydrateFilesMap(
      files,
      config.filePathMap,
      repoRootPath,
      fileFsRefsCache
    );
  }

  const edgeFunction = new EdgeFunction({
    // "v8-worker" is currently the only supported target, so specify
    // it implicitly here so that `.vc-config.json` does not need to.
    deploymentTarget: 'v8-worker',
    ...config,
    files,
  });

  return edgeFunction;
}
