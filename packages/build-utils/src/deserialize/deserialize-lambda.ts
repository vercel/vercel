import type { Files } from '../types';
import FileFsRef from '../file-fs-ref';
import { Lambda } from '../lambda';
import { NodejsLambda } from '../nodejs-lambda';
import { hydrateFilesMap } from './hydrate-files-map';
import type { SerializedLambda, SerializedNodejsLambda } from './types';

export type DeserializeLambdaParams = SerializedLambda & {
  files: Files;
  supportsResponseStreaming?: boolean;
};

export type DeserializeNodejsLambdaParams = SerializedNodejsLambda & {
  files: Files;
  supportsResponseStreaming?: boolean;
};

export interface DeserializeLambdaOptions<TLambda extends Lambda = Lambda> {
  files: Files;
  config: SerializedLambda | SerializedNodejsLambda;
  repoRootPath: string;
  fileFsRefsCache: Map<string, FileFsRef>;
  useOnlyStreamingLambda?: boolean;
  forceNodejsStreaming?: boolean;
  createLambda?: (params: DeserializeLambdaParams) => TLambda;
  createNodejsLambda?: (params: DeserializeNodejsLambdaParams) => TLambda;
}

function defaultCreateLambda(params: DeserializeLambdaParams): Lambda {
  return new Lambda(params as ConstructorParameters<typeof Lambda>[0]);
}

function defaultCreateNodejsLambda(
  params: DeserializeNodejsLambdaParams
): Lambda {
  return new NodejsLambda(
    params as ConstructorParameters<typeof NodejsLambda>[0]
  );
}

export async function deserializeLambda<TLambda extends Lambda = Lambda>({
  files,
  config,
  repoRootPath,
  fileFsRefsCache,
  useOnlyStreamingLambda,
  forceNodejsStreaming,
  createLambda,
  createNodejsLambda,
}: DeserializeLambdaOptions<TLambda>): Promise<TLambda> {
  if (config.filePathMap) {
    await hydrateFilesMap(
      files,
      config.filePathMap,
      repoRootPath,
      fileFsRefsCache
    );
  }

  // Keep checking the deprecated field because older producers still use it.
  const supportsResponseStreaming =
    config.supportsResponseStreaming ?? config.experimentalResponseStreaming;

  if ('launcherType' in config && config.launcherType === 'Nodejs') {
    const overrideResponseStreaming =
      (useOnlyStreamingLambda || forceNodejsStreaming) &&
      (config.awsLambdaHandler === undefined || config.awsLambdaHandler === '');

    const params: DeserializeNodejsLambdaParams = {
      ...config,
      supportsResponseStreaming:
        overrideResponseStreaming || supportsResponseStreaming,
      files,
    };

    return createNodejsLambda
      ? createNodejsLambda(params)
      : (defaultCreateNodejsLambda(params) as TLambda);
  }

  const params: DeserializeLambdaParams = {
    ...config,
    supportsResponseStreaming,
    files,
  };

  return createLambda
    ? createLambda(params)
    : (defaultCreateLambda(params) as TLambda);
}
