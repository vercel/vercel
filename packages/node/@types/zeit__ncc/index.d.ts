declare function ncc(
  entrypoint: string,
  options?: ncc.NccOptions
): ncc.NccResult;

declare namespace ncc {
  export interface NccOptions {
    watch?: any;
    sourceMap?: boolean;
    sourceMapRegister?: boolean;
  }

  export interface Asset {
    source: Buffer;
    permissions: number;
  }

  export interface Assets {
    [name: string]: Asset;
  }

  export interface BuildResult {
    err: Error | null | undefined;
    code: string;
    map: string | undefined;
    assets: Assets | undefined;
    permissions: number | undefined;
  }

  export type HandlerFn = (params: BuildResult) => void;
  export type HandlerCallback = (fn: HandlerFn) => void;
  export type RebuildFn = () => void;
  export type RebuildCallback = (fn: RebuildFn) => void;
  export type CloseCallback = () => void;

  export interface NccResult {
    handler: HandlerCallback;
    rebuild: RebuildCallback;
    close: CloseCallback;
  }
}

declare module '@vercel/ncc' {
  export = ncc;
}
