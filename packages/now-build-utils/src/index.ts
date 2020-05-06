import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import { Lambda, createLambda, getLambdaOptionsFromFunction } from './lambda';
import { Prerender } from './prerender';
import download, { DownloadedFiles, isSymbolicLink } from './fs/download';
import getWriteableDirectory from './fs/get-writable-directory';
import glob, { GlobOptions } from './fs/glob';
import rename from './fs/rename';
import {
  execAsync,
  spawnAsync,
  execCommand,
  spawnCommand,
  walkParentDirs,
  installDependencies,
  runPackageJsonScript,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  getNodeBinPath,
} from './fs/run-user-scripts';
import {
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
} from './fs/node-version';
import streamToBuffer from './fs/stream-to-buffer';
import shouldServe from './should-serve';
import debug from './debug';

export {
  FileBlob,
  FileFsRef,
  FileRef,
  Lambda,
  createLambda,
  Prerender,
  download,
  DownloadedFiles,
  getWriteableDirectory,
  glob,
  GlobOptions,
  rename,
  execAsync,
  spawnAsync,
  installDependencies,
  runPackageJsonScript,
  execCommand,
  spawnCommand,
  walkParentDirs,
  getNodeBinPath,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  getNodeVersion,
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  getSpawnOptions,
  streamToBuffer,
  shouldServe,
  debug,
  isSymbolicLink,
  getLambdaOptionsFromFunction,
};

export {
  detectBuilders,
  detectOutputDirectory,
  detectApiDirectory,
  detectApiExtensions,
} from './detect-builders';
export { detectFramework } from './detect-framework';
export { DetectorFilesystem } from './detectors/filesystem';
export { readConfigFile } from './fs/read-config-file';

export * from './schemas';
export * from './types';
export * from './errors';

/**
 * Helper function to support both `@vercel` and legacy `@now` official Runtimes.
 */
export const isOfficialRuntime = (desired: string, name?: string): boolean => {
  return (
    typeof name === 'string' &&
    (name.startsWith(`@vercel/${desired}`) ||
      name.startsWith(`@now/${desired}`))
  );
};

/**
 * Helper function to support both `VERCEL_` and legacy `NOW_` env vars.
 */
export const getPlatformEnv = (name: string): string | undefined => {
  return process.env[`VERCEL_${name}`] || process.env[`NOW_${name}`];
};
