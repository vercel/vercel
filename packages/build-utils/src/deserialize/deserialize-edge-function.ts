import type { Files } from '../types';
import FileFsRef from '../file-fs-ref';
import { EdgeFunction } from '../edge-function';
import { hydrateFilesMap } from './hydrate-files-map';
import type { SerializedEdgeFunction } from './types';

export type DeserializeEdgeFunctionParams = SerializedEdgeFunction & {
  files: Files;
  deploymentTarget: 'v8-worker';
};

export interface DeserializeEdgeFunctionOptions<
  TEdgeFunction extends EdgeFunction = EdgeFunction,
> {
  files: Files;
  config: SerializedEdgeFunction;
  repoRootPath: string;
  fileFsRefsCache: Map<string, FileFsRef>;
  createEdgeFunction?: (params: DeserializeEdgeFunctionParams) => TEdgeFunction;
}

function defaultCreateEdgeFunction(
  params: DeserializeEdgeFunctionParams
): EdgeFunction {
  return new EdgeFunction(params);
}

export async function deserializeEdgeFunction<
  TEdgeFunction extends EdgeFunction = EdgeFunction,
>({
  files,
  config,
  repoRootPath,
  fileFsRefsCache,
  createEdgeFunction,
}: DeserializeEdgeFunctionOptions<TEdgeFunction>): Promise<TEdgeFunction> {
  if (config.filePathMap) {
    await hydrateFilesMap(
      files,
      config.filePathMap,
      repoRootPath,
      fileFsRefsCache
    );
  }

  const params: DeserializeEdgeFunctionParams = {
    deploymentTarget: 'v8-worker',
    ...config,
    files,
  };

  return createEdgeFunction
    ? createEdgeFunction(params)
    : (defaultCreateEdgeFunction(params) as TEdgeFunction);
}
