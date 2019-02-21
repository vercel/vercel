import http from 'http'
import FileFsRef from '@now/build-utils/file-fs-ref';
import { LambdaRuntime } from '@now/build-utils';

export enum DevServerStatus {
  busy,
  idle,
  error
}

export interface DevServerOptions {
  debug: boolean;
}

export interface BuildConfig {
  src: string;
  use: string;
  config?: object;
}

export interface HttpHandler {
  (
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void;
}

export type BuilderOutput = BuiltLambda | FileFsRef;

export interface BuilderOutputs {
  [path: string]: BuilderOutput;
}

export interface BuiltLambda {
  type: 'Lambda',
  zipBuffer: Buffer;
  handler: string;
  runtime: LambdaRuntime;
  environment: { [name: string]: string }
}

export interface HttpHeadersConfig {
  [name: string]: string;
}

export interface RouteConfig {
  src: string;
  dest: string;
  methods?: string[];
  headers?: HttpHeadersConfig;
  status?: number;
}

export interface RouteResult {
  // "dest": <string of the dest, either file for lambda or full url for remote>
  dest: string;
  // "status": <integer in case exit code is intended to be changed>
  status?: number;
  // "headers": <object of the added response header values>
  headers?: HttpHeadersConfig;
  // "uri_args": <object (key=value) list of new uri args to be passed along to dest >
  uri_args?: {[key: string]: any};
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
