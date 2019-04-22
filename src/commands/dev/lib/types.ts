import http from 'http';
import { Lambda as FunLambda } from '@zeit/fun';
import { FileBlob, FileFsRef, Lambda } from '@now/build-utils';
import { Output } from '../../../util/output';

export interface DevServerOptions {
  output: Output;
  debug: boolean;
}

export interface EnvConfig {
  [name: string]: string | undefined;
}

export interface BuildConfig {
  src: string;
  use: string;
  config?: object;
}

export interface BuildMatch extends BuildConfig {
  builderWithPkg: BuilderWithPackage;
  buildOutput: BuilderOutputs;
  buildResults: Map<string | null, BuildResult>;
  builderCachePromise?: Promise<CacheOutputs>;
  buildTimestamp: number;
  workPath: string;
}

export interface RouteConfig {
  src: string;
  dest: string;
  methods?: string[];
  headers?: HttpHeadersConfig;
  status?: number;
  handle?: string;
}

export interface NowConfig {
  name?: string;
  version?: number;
  env?: EnvConfig;
  build?: {
    env?: EnvConfig;
  };
  builds?: BuildConfig[];
  routes?: RouteConfig[];
}

export interface HttpHandler {
  (req: http.IncomingMessage, res: http.ServerResponse): void;
}

export interface BuilderInputs {
  [path: string]: FileFsRef;
}

export type BuiltLambda = Lambda & {
  fn?: FunLambda;
};

export type BuilderOutput = BuiltLambda | FileFsRef | FileBlob;

export interface BuilderOutputs {
  [path: string]: BuilderOutput;
}

export type CacheOutput = FileFsRef | FileBlob;

export interface CacheOutputs {
  [path: string]: CacheOutput;
}

export interface BuilderParamsBase {
  files: BuilderInputs;
  entrypoint: string;
  config: object;
  meta?: {
    isDev?: boolean;
    requestPath?: string | null;
    filesChanged?: string[];
    filesRemoved?: string[];
  };
}

export interface BuilderParams extends BuilderParamsBase {
  workPath: string;
}

export interface PrepareCacheParams extends BuilderParams {
  cachePath: string;
}

export interface BuilderConfigAttr {
  maxLambdaSize?: string | number;
}

export interface Builder {
  version?: 2;
  requiresInitialBuild?: boolean;
  config?: BuilderConfigAttr;
  build(
    params: BuilderParams
  ):
    | BuilderOutputs
    | BuildResult
    | Promise<BuilderOutputs>
    | Promise<BuildResult>;
  shouldServe?(params: ShouldServeParams): boolean | Promise<boolean>;
  prepareCache?(
    params: PrepareCacheParams
  ): CacheOutputs | Promise<CacheOutputs>;
}

export type BuildResultV1 = BuilderOutputs;

export interface BuildResultV2 {
  output: BuilderOutputs;
  routes: RouteConfig[];
  watch: string[];
}

export type BuildResult = BuildResultV1 | BuildResultV2;

export interface ShouldServeParams {
  files: BuilderInputs;
  entrypoint: string;
  config?: object;
  requestPath: string;
}

export interface BuilderWithPackage {
  builder: Builder;
  package: {
    version: string;
  };
}

export interface HttpHeadersConfig {
  [name: string]: string;
}

export interface RouteResult {
  // `true` if a route was matched, `false` otherwise
  found: boolean;
  // "dest": <string of the dest, either file for lambda or full url for remote>
  dest: string;
  // "status": <integer in case exit code is intended to be changed>
  status?: number;
  // "headers": <object of the added response header values>
  headers?: HttpHeadersConfig;
  // "uri_args": <object (key=value) list of new uri args to be passed along to dest >
  uri_args?: { [key: string]: any };
  // "matched_route": <object of the route spec that matched>
  matched_route?: RouteConfig;
  // "matched_route_idx": <integer of the index of the route matched>
  matched_route_idx?: number;
  // "userDest": <boolean in case the destination was user defined>
  userDest?: boolean;
}

export interface InvokePayload {
  method: string;
  host?: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  encoding?: string;
  body?: string;
}

export interface InvokeResult {
  statusCode: number;
  headers: HttpHeadersConfig;
  encoding?: string;
  body?: string;
}
