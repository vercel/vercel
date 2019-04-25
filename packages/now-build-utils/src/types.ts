import FileRef from './file-ref';
import FileFsRef from './file-fs-ref';

export interface File {
  type: string;
  mode: number;
  toStream: () => NodeJS.ReadableStream;
  /**
   * The absolute path to the file in the filesystem
   */
  fsPath?: string;
}

export interface Files {
  [filePath: string]: File;
}

export interface Config {
  [key: string]: string;
}

export interface Meta {
  isDev?: boolean;
  requestPath?: string;
  filesChanged?: string[];
  filesRemoved?: string[];
}

export interface AnalyzeOptions {
  /**
   * All source files of the project
   */
  files: {
    [filePath: string]: FileRef;
  };

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process. This directory will be populated with the restored cache.
   */
  workPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `now.json`.
   */
  config: Config;
}

export interface BuildOptions {
  /**
   * All source files of the project
   */
  files: Files;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process. This directory will be populated with the restored cache.
   */
  workPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `now.json`.
   */
  config: Config;

  /**
   * Metadata related to the invoker of the builder, used by `now dev`.
   * Builders may use the properties on this object to change behavior based
   * on the build environment.
   */
  meta?: Meta;
}

export interface PrepareCacheOptions {
  /**
   * All source files of the project
   */
  files: Files;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process.
   */
  workPath: string;

  /**
   * A writable temporary directory where you can build a cache to use for
   * the next run.
   */
  cachePath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `now.json`.
   */
  config: Config;
}

export interface ShouldServeOptions {
  /**
   * A path string from a request.
   */
  requestPath: string;

  /**
   * Name of entrypoint file for this particular build job. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   * `entrypoint` is always a discrete file and never a glob, since globs are
   * expanded into separate builds at deployment time.
   */
  entrypoint: string;

  /**
   * All source files of the project
   */
  files: {
    [path: string]: FileFsRef;
  };

  /**
   * A writable temporary directory where you are encouraged to perform your
   * build process. This directory will be populated with the restored cache.
   */
  workPath: string;

  /**
   * An arbitrary object passed by the user in the build definition defined
   * in `now.json`.
   */
  config: Config;
}
