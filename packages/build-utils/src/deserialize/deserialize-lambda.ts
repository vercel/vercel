import type { Files } from '../types';
import { Lambda } from '../lambda';
import { NodejsLambda } from '../nodejs-lambda';
import type FileFsRef from '../file-fs-ref';
import { hydrateFilesMap } from './hydrate-files-map';
import type {
  SerializedLambda,
  SerializedNodejsLambda,
} from './serialized-types';

export interface DeserializeLambdaOptions {
  useOnlyStreamingLambda?: boolean;
  forceNodejsStreaming?: boolean;
  /**
   * Custom Lambda class constructor. Defaults to the base Lambda class.
   * Pass an extended class (e.g. with BYOC `external` property) to
   * preserve extra properties through deserialization.
   */
  LambdaClass?: typeof Lambda;
  /**
   * Custom NodejsLambda class constructor. Defaults to the base NodejsLambda class.
   * Pass an extended class (e.g. with BYOC `external` property) to
   * preserve extra properties through deserialization.
   */
  NodejsLambdaClass?: typeof NodejsLambda;
}

export async function deserializeLambda(
  files: Files,
  config: SerializedLambda | SerializedNodejsLambda,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>,
  options?: DeserializeLambdaOptions
): Promise<Lambda> {
  const LambdaCtor = options?.LambdaClass ?? Lambda;
  const NodejsLambdaCtor = options?.NodejsLambdaClass ?? NodejsLambda;

  // Hydrate
  if (config.filePathMap) {
    await hydrateFilesMap(
      files,
      config.filePathMap,
      repoRootPath,
      fileFsRefsCache
    );
  }

  // Need to keep checking for `experimentalResponseStreaming` for some time
  // because older versions of Vercel CLI would be using this property.
  const supportsResponseStreaming =
    config.supportsResponseStreaming ?? config.experimentalResponseStreaming;

  if ('launcherType' in config && config.launcherType === 'Nodejs') {
    // Streaming isn't supported with AWS Handlers
    const overrideResponseStreaming =
      (options?.useOnlyStreamingLambda || options?.forceNodejsStreaming) &&
      (config.awsLambdaHandler === undefined || config.awsLambdaHandler === '');

    return new NodejsLambdaCtor({
      ...config,
      supportsResponseStreaming:
        overrideResponseStreaming || supportsResponseStreaming,
      files,
    });
  }

  return new LambdaCtor({
    ...config,
    supportsResponseStreaming,
    files,
  });
}
