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
}

export interface RouteConfig {
  src: string;
  dest: string;
  methods?: string[];
  headers?: HttpHeadersConfig;
  status?: number;
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

export interface BuiltFileFsRef extends FileFsRef {
  buildConfig?: BuildConfig;
  buildEntry?: FileFsRef;
  buildTimestamp?: number;
}

export interface BuiltFileBlob extends FileBlob {
  buildConfig?: BuildConfig;
  buildEntry?: FileFsRef;
  buildTimestamp?: number;
}

export type BuilderOutput = BuiltLambda | BuiltFileFsRef | BuiltFileBlob;

export interface BuilderOutputs {
  [path: string]: BuilderOutput;
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

export interface PrepareCacheParams extends BuilderParamsBase {
  cachePath: string;
}

export interface Builder {
  config?: {
    maxLambdaSize?: string | number;
  };
  build(params: BuilderParams): BuilderOutputs;
  prepareCache?(params: PrepareCacheParams): BuilderOutputs;
}

export interface BuiltLambda extends Lambda {
  fn?: FunLambda;
  buildConfig?: BuildConfig;
  buildEntry?: FileFsRef;
  buildTimestamp?: number;
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
