import { ContainerImage } from '../container-image';
import type FileFsRef from '../file-fs-ref';
import type { Files } from '../types';
import { hydrateFilesMap } from './hydrate-files-map';
import type { SerializedContainerImage } from './serialized-types';

export async function deserializeContainerImage(
  files: Files,
  config: SerializedContainerImage,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>
): Promise<ContainerImage> {
  if (config.filePathMap) {
    await hydrateFilesMap(
      files,
      config.filePathMap,
      repoRootPath,
      fileFsRefsCache
    );
  }

  const { filePathMap, type, ...containerConfig } = config;

  return new ContainerImage({
    ...containerConfig,
    files,
  });
}
