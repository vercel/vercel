// https://zeit.co/docs/v2/deployments/builders/developer-guide/

declare module '@now/build-utils/lambda' {
  type Lambda = BuildUtils.Lambda;
  export default Lambda;
}

declare module '@now/build-utils' {
  type Files = BuildUtils.Files;
  type LambdaRuntime = BuildUtils.LambdaRuntime;

  export {
    Files,
    LambdaRuntime
  };
}

declare module '@now/build-utils/file-ref' {
  type FileRef = BuildUtils.FileRef;
  export default FileRef;
}

declare module '@now/build-utils/file-fs-ref' {
  type FileFsRef = BuildUtils.FileFsRef;
  export default FileFsRef;
}

declare module '@now/build-utils/fs/glob' {
  function glob (
    pattern: string,
    workPath: string
  ) : Promise<BuildUtils.Files>;

  export default glob
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

  export type File = FileRef | FileFsRef | Lambda;

  export interface FileRef {
    type: 'FileRef';
    mode: number;
    digest: string;
    toStream(): NodeJS.ReadableStream;
  }

  export interface FileFsRef {
    type: 'FileFsRef';
    mode: number;
    fsPath: string;
    fromStream({ mode, stream, fsPath }: {
      mode: number;
      stream: NodeJS.ReadableStream;
      fsPath: string;
    }): FileFsRef;
    toStream(): NodeJS.ReadableStream;
  }

  export interface Lambda {
    files: Files;
    handler: string;
    runtime: LambdaRuntime;
    environment: {[key: string]: string};
  }

  export type LambdaRuntime = string;
}
