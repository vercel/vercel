declare module '@vercel/build-utils' {
  export interface FileFsRef {
    type: 'FileFsRef';
    fsPath: string;
    mode?: number;
  }

  export interface Files {
    [filePath: string]: FileFsRef | FileBlob | Lambda | EdgeFunction;
  }

  export interface Config {
    [key: string]: any;
  }

  export interface FileBlob {
    type: 'FileBlob';
    data: Buffer | string;
    mode?: number;
  }

  export interface Lambda {
    type: 'Lambda';
    files: Files;
    handler: string;
    runtime: string;
    memory?: number;
    maxDuration?: number;
    environment?: { [key: string]: string };
  }

  export interface NodejsLambda extends Lambda {
    runtime: 'nodejs';
  }

  export interface EdgeFunction {
    type: 'EdgeFunction';
    files: Files;
    name: string;
    entrypoint: string;
    deploymentTarget?: string;
  }

  export interface Prerender {
    expiration: number;
    lambda?: Lambda;
    fallback?: FileBlob | FileFsRef;
    group?: number;
    bypassToken?: string;
    initialHeaders?: Record<string, string>;
    initialStatus?: number;
  }

  export interface Images {
    domains: string[];
    sizes: number[];
    remotePatterns?: Array<{
      protocol?: string;
      hostname: string;
      port?: string;
      pathname?: string;
    }>;
  }

  export interface FlagDefinitions {
    [key: string]: boolean;
  }

  export interface Chain {
    [key: string]: any;
  }

  export function debug(...args: any[]): void;
  export function getLambdaOptionsFromFunction(fn: any): any;
  export function getPlatformEnv(): any;
  export function streamToBuffer(stream: any): Promise<Buffer>;
  export function glob(
    pattern: string,
    cwd: string
  ): Promise<Record<string, FileFsRef>>;
  export function isSymbolicLink(path: string): Promise<boolean>;

  export class NowBuildError extends Error {
    constructor(code: string, message: string);
    code: string;
  }
}
