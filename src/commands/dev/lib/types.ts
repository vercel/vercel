import http from 'http';
import { Output } from '../../../util/output';
import { Lambda as FunLambda } from '@zeit/fun';
import { FileBlob, FileFsRef, Lambda } from '@now/build-utils';

export enum DevServerStatus {
  busy,
  idle,
  error
}

export interface DevServerOptions {
  output: Output;
}

export interface EnvConfig {
  [name: string]: string | undefined;
}

export interface BuildConfig {
  src: string;
  use: string;
  config?: object;
  builder?: Builder;
  builderCachePromise?: Promise<CacheOutputs>;
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

export interface BuiltAsset {
  buildConfig?: BuildConfig;
  buildEntry?: FileFsRef;
  buildTimestamp?: number;
}

export type BuildSubscription = BuiltAsset & {
  type: 'Subscription';
  patterns: string[];
};

export type BuiltFileFsRef = FileFsRef & BuiltAsset;
export type BuiltFileBlob = FileBlob & BuiltAsset;
export type BuiltLambda = Lambda &
  BuiltAsset & {
    fn?: FunLambda;
  };
export type BuilderOutput = BuiltLambda | BuiltFileFsRef | BuiltFileBlob;

export interface BuilderOutputs {
  [path: string]: BuilderOutput;
}

export type CacheOutput = BuiltFileFsRef | BuiltFileBlob;

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
  };
}

export interface BuilderParams extends BuilderParamsBase {
  workPath: string;
}

export interface PrepareCacheParams extends BuilderParams {
  cachePath: string;
}

export interface Builder {
  config?: {
    maxLambdaSize?: string | number;
  };
  build(params: BuilderParams): BuilderOutputs;
  subscribe?(params: BuilderParamsBase): Promise<string[]>;
  prepareCache?(
    params: PrepareCacheParams
  ): CacheOutputs | Promise<CacheOutputs>;
}

export interface HttpHeadersConfig {
  [name: string]: string;
}

export interface RouteResult {
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
}

export interface InvokePayload {
  method: string;
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
