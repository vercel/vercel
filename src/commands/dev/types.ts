import http from 'http'
// @ts-ignore
import FileFsRef from '@now/build-utils/file-fs-ref';
// @ts-ignore
import Lambda from '@now/build-utils/lambda'

export enum DevServerStatus {
  busy,
  idle,
  error
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
  ): void
}

type BuilderOutput = FileFsRef | Lambda

export interface BuilderOutputs {
  [key: string]: BuilderOutput
}

export interface HttpHeadersConfig {
  [header: string]: string
}

export interface RouteConfig {
  src: string,
  dest: string,
  methods?: string[],
  headers?: HttpHeadersConfig,
  status?: number
}

export interface RouteResult {
  // "dest": <string of the dest, either file for lambda or full url for remote>
  dest: BuilderOutput | string,
  // "status": <integer in case exit code is intended to be changed>
  status?: number,
  // "headers": <object of the added response header values>
  headers?: HttpHeadersConfig,
  // "uri_args": <object (key=value) list of new uri args to be passed along to dest >
  uri_args?: {[key: string]: any},
  // "matched_route": <object of the route spec that matched>
  matched_route?: RouteConfig,
  // "matched_route_idx": <integer of the index of the route matched>
  matched_route_idx?: number
}
