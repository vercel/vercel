import http from 'http';
import { ChildProcess } from 'child_process';
import { Lambda as FunLambda } from '@zeit/fun';
import {
  Builder as BuildConfig,
  FileBlob,
  FileFsRef,
  Lambda,
  PackageJson,
  Config,
} from '@now/build-utils';
import { NowConfig } from 'now-client';
import { HandleValue, Route } from '@now/routing-utils';
import { Output } from '../output';

export { NowConfig };

export interface DevServerOptions {
  output: Output;
  debug: boolean;
  devCommand?: string;
}

export interface EnvConfig {
  [name: string]: string | undefined;
}

export interface BuildMatch extends BuildConfig {
  entrypoint: string;
  builderWithPkg: BuilderWithPackage;
  buildOutput: BuilderOutputs;
  buildResults: Map<string | null, BuildResult>;
  buildTimestamp: number;
  buildProcess?: ChildProcess;
}

export type RouteConfig = Route;

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
  config: Config;
  meta?: {
    isDev?: boolean;
    requestPath?: string | null;
    filesChanged?: string[];
    filesRemoved?: string[];
    env?: EnvConfig;
    buildEnv?: EnvConfig;
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
  version?: 1 | 2 | 3 | 4;
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

export interface BuildResult {
  output: BuilderOutputs;
  routes: RouteConfig[];
  watch: string[];
  distPath?: string;
}

export interface BuildResultV3 {
  output: Lambda;
  routes: RouteConfig[];
  watch: string[];
  distPath?: string;
}

export interface BuildResultV4 {
  output: { [filePath: string]: Lambda };
  routes: RouteConfig[];
  watch: string[];
  distPath?: string;
}

export interface ShouldServeParams {
  files: BuilderInputs;
  entrypoint: string;
  config?: Config;
  requestPath: string;
  workPath: string;
}

export interface BuilderWithPackage {
  runInProcess?: boolean;
  builder: Readonly<Builder>;
  package: Readonly<PackageJson>;
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
  headers: HttpHeadersConfig;
  // "uri_args": <object (key=value) list of new uri args to be passed along to dest >
  uri_args?: { [key: string]: any };
  // "matched_route": <object of the route spec that matched>
  matched_route?: RouteConfig;
  // "matched_route_idx": <integer of the index of the route matched>
  matched_route_idx?: number;
  // "userDest": <boolean in case the destination was user defined>
  userDest?: boolean;
  // url as destination should end routing
  isDestUrl: boolean;
  // the phase that this route is defined in
  phase?: HandleValue | null;
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

export type SocketSpec = [string];
export type HostPortSpec = [number, string?];
export type ListenSpec = SocketSpec | HostPortSpec;
