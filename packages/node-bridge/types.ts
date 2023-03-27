/// <reference types="node" />
import type { CipherCCMTypes } from 'crypto';
import type {
  Server,
  IncomingHttpHeaders,
  OutgoingHttpHeaders,
  ServerResponse,
  IncomingMessage,
} from 'http';
export interface VercelProxyEvent {
  Action: string;
  body: string;
}
export interface VercelProxyRequest {
  isApiGateway: boolean;
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
  encoding?: string;
  payloads?: Array<VercelProxyRequest>;
  features?: Record<string, boolean>;
  responseCallbackCipher?: CipherCCMTypes;
  responseCallbackCipherIV?: string;
  responseCallbackCipherKey?: string;
  responseCallbackStream?: string;
  responseCallbackUrl?: string;
}
export interface VercelProxyResponse {
  statusCode: number;
  headers: OutgoingHttpHeaders;
  body: string;
  encoding: BufferEncoding;
}
export type VercelStreamProxyResponse = Record<string, never>;
export interface ServerLike {
  timeout?: number;
  listen: (
    opts: {
      host?: string;
      port?: number;
    },
    callback: (this: Server | null) => void
  ) => Server | void;
}
export type LauncherConfiguration = {
  entrypointPath: string;
  bridgePath: string;
  helpersPath: string;
  sourcemapSupportPath: string;
  shouldAddHelpers?: boolean;
  shouldAddSourcemapSupport?: boolean;
  awsLambdaHandler?: string;
  useRequire?: boolean;
};

export type VercelRequestCookies = { [key: string]: string };
export type VercelRequestQuery = { [key: string]: string | string[] };
export type VercelRequestBody = any;

export type VercelRequest = IncomingMessage & {
  query: VercelRequestQuery;
  cookies: VercelRequestCookies;
  body: VercelRequestBody;
};

export type VercelResponse = ServerResponse & {
  send: (body: any) => VercelResponse;
  json: (jsonBody: any) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: (statusOrUrl: string | number, url?: string) => VercelResponse;
};
