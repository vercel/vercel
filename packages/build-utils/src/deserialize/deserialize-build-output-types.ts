import type FileFsRef from '../file-fs-ref';
import type { Lambda } from '../lambda';
import type { Prerender } from '../prerender';
import type { BuildResultV2Typical, Files } from '../types';
import type {
  SerializedEdgeFunction,
  SerializedLambda,
  SerializedNodejsLambda,
  SerializedPrerender,
} from './serialized-types';

export interface DeserializeBuildOutputPathOverride {
  contentType?: string;
  mode?: number;
  path?: string;
}

export interface DeserializeBuildOutputConfig<TFlags = unknown> {
  version?: 3;
  wildcard?: BuildResultV2Typical['wildcard'];
  images?: BuildResultV2Typical['images'];
  routes?: BuildResultV2Typical['routes'];
  overrides?: Record<string, DeserializeBuildOutputPathOverride>;
  framework?: BuildResultV2Typical['framework'];
  crons?: BuildResultV2Typical['crons'];
  flags?: TFlags;
  deploymentId?: string;
}

export type DeserializeBuildOutputResult<
  TFlags = unknown,
  TMeta = unknown,
> = Omit<BuildResultV2Typical, 'flags'> & {
  flags?: TFlags;
  meta?: TMeta;
};

export type DeserializeBuildOutputLambdaOptions = {
  forceNodejsStreaming?: boolean;
  useOnlyStreamingLambda?: boolean;
};

export type GroupLambdasOptions = {
  force: 'all' | undefined;
  maxBundleSizeMb: number | undefined;
  debug: boolean | undefined;
};

export type DeserializeBuildOutputLambda<TLambda extends Lambda> = (
  files: Files,
  config: SerializedLambda | SerializedNodejsLambda,
  repoRootPath: string,
  fileFsRefsCache: Map<string, FileFsRef>,
  options?: DeserializeBuildOutputLambdaOptions
) => Promise<TLambda>;

export type GroupLambdas<TLambda extends Lambda> = (
  lambdas: Record<string, TLambda>,
  options: GroupLambdasOptions
) => Promise<Record<string, TLambda>>;

export type InspectSerializedLambda = (
  path: string,
  config: SerializedLambda | SerializedNodejsLambda,
  repoRootPath: string,
  hasServerActions: boolean
) => Promise<boolean>;

export interface DeserializeBuildOutputOptions<
  TResult extends DeserializeBuildOutputResult = DeserializeBuildOutputResult,
  TLambda extends Lambda = Lambda,
> {
  outputDir: string;
  repoRootPath: string;
  maxBundleSizeMb?: number;
  debugGroupLambdas?: boolean;
  useOnlyStreamingLambda?: boolean;
  forceNodejsStreaming?: boolean;
  deserializeLambda: DeserializeBuildOutputLambda<TLambda>;
  groupLambdas: GroupLambdas<TLambda>;
  inspectSerializedLambda?: InspectSerializedLambda;
  warn?: (message: string) => void;
  includeDeploymentId?: boolean;
  getMeta?: (
    hasServerActions: boolean
  ) => TResult extends { meta?: infer TMeta } ? TMeta : never;
}

export type DeserializeBuildOutputFiles = BuildResultV2Typical['output'];
export type DeserializeBuildOutputPrerenderFallback = Prerender['fallback'];
export type DeserializeBuildOutputSerializedConfig =
  | SerializedEdgeFunction
  | SerializedLambda
  | SerializedNodejsLambda;
export type DeserializeBuildOutputSerializedPrerender = SerializedPrerender;
