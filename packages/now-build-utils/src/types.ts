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
  [key: string]: string | string[] | boolean | number | undefined;
  maxLambdaSize?: string;
  includeFiles?: string | string[];
  bundle?: boolean;
  ldsflags?: string;
  helpers?: boolean;
  rust?: string;
  debug?: boolean;
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
   * An mapping of layer name to layer from the `prepareLayers()` function
   */
  layers: { [use: string]: Layer };

  /**
   * Metadata related to the invoker of the builder, used by `now dev`.
   * Builders may use the properties on this object to change behavior based
   * on the build environment.
   */
  meta?: Meta;
}

export interface Layer {
  name: string;
  getEntrypoint(): Promise<string>;
  getFiles(): Promise<Files>;
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

export interface PrepareLayersOptions {
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
   * An arbitrary object passed by the user in the build definition defined
   * in `now.json`.
   */
  config: Config;
}

export interface BuildLayerConfig {
  [key: string]: any;
  /**
   * The version of the layer we are building, not to be confused with the version of the npm package
   */
  runtimeVersion: string;
  /**
   * The platform of the layer we are building, typically `process.platform`
   */
  platform: string;
  /**
   * The architecture of the layer we are building, typically `process.arch`
   */
  arch: string;
}

export interface BuildLayerResult {
  /**
   * All the files in the layer
   */
  files: Files;
  /**
   * Name of entrypoint file for this particular Layer. Value
   * `files[entrypoint]` is guaranteed to exist and be a valid File reference.
   */
  entrypoint: string;
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
