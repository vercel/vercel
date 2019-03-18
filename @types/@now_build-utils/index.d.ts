// https://zeit.co/docs/v2/deployments/builders/developer-guide/

declare module '@now/build-utils/lambda' {
  type Lambda = BuildUtils.Lambda;
  export default Lambda;
}

declare module '@now/build-utils' {
  type File = BuildUtils.File;
  type Files = BuildUtils.Files;
  type LambdaRuntime = BuildUtils.LambdaRuntime;

  export { File, Files, LambdaRuntime };
}

declare module '@now/build-utils/file-ref' {
  type FileRef = BuildUtils.FileRef;
  export default FileRef;
}

declare module '@now/build-utils/file-fs-ref' {
  export = BuildUtils.FileFsRef;
}

declare module '@now/build-utils/file-blob' {
  export = BuildUtils.FileBlob;
}

declare module '@now/build-utils/fs/glob' {
  function glob(
    pattern: string,
    workPath: string
  ): Promise<BuildUtils.FileFsRef>;

  export default glob;
}

declare module '@now/build-utils/fs/get-writable-directory' {
  type getWritableDirectory = () => string;
  export default getWritableDirectory;
}

declare module '@now/build-utils/fs/rename' {
  type RenameFn = (path: string) => string;
  type rename = (files: BuildUtils.Files, fn: RenameFn) => BuildUtils.Files;
  export default rename;
}

declare namespace BuildUtils {
  export interface BuilderParams {
    files: Files;
    entrypoint: string;
    workPath: string;
    config: object;
  }

  export interface PrepareCacheParams extends BuilderParams {
    cachePath: string;
  }

  export interface Files {
    [filePath: string]: File;
  }

  export type File = FileRef | FileFsRef | FileBlob | Lambda;

  export interface FileRef {
    type: 'FileRef';
    mode: number;
    digest: string;
    toStream(): NodeJS.ReadableStream;
  }

  export interface FileBlob {
    type: 'FileBlob';
    mode: number;
    data: Buffer;
    toStream(): NodeJS.ReadableStream;
  }

  export declare class FileFsRef {
    constructor({ mode, fsPath }: { mode: number, fsPath: string });
    type: 'FileFsRef';
    mode: number;
    fsPath: string;
    fromStream({
      mode,
      stream,
      fsPath
    }: {
      mode: number;
      stream: NodeJS.ReadableStream;
      fsPath: string;
    }): FileFsRef;
    toStream(): NodeJS.ReadableStream;
  }

  export interface Lambda {
    type: 'Lambda';
    files: Files;
    handler: string;
    runtime: LambdaRuntime;
    environment: { [key: string]: string };
  }

  export type LambdaRuntime = string;
}
