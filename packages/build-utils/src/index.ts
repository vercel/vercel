import FileBlob from './file-blob.js';
import FileFsRef from './file-fs-ref.js';
import FileRef from './file-ref.js';
import {
  Lambda,
  createLambda,
  getLambdaOptionsFromFunction,
} from './lambda.js';
import { NodejsLambda } from './nodejs-lambda.js';
import { Prerender } from './prerender.js';
import download, {
  downloadFile,
  isSymbolicLink,
  isDirectory,
} from './fs/download.js';
import type { DownloadedFiles } from './fs/download.js';
import getWriteableDirectory from './fs/get-writable-directory.js';
import glob from './fs/glob.js';
import type { GlobOptions } from './fs/glob.js';
import rename from './fs/rename.js';
import {
  spawnAsync,
  execCommand,
  spawnCommand,
  walkParentDirs,
  getScriptName,
  installDependencies,
  runPackageJsonScript,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  runCustomInstallCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getSpawnOptions,
  getNodeBinPath,
  getNodeBinPaths,
  scanParentDirs,
  traverseUpDirectories,
} from './fs/run-user-scripts.js';
import {
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
} from './fs/node-version.js';
import streamToBuffer from './fs/stream-to-buffer.js';
import debug from './debug.js';
import getIgnoreFilter from './get-ignore-filter.js';
import { getPlatformEnv } from './get-platform-env.js';
import { getPrefixedEnvVars } from './get-prefixed-env-vars.js';
import { cloneEnv } from './clone-env.js';
import { hardLinkDir } from './hard-link-dir.js';
import { validateNpmrc } from './validate-npmrc.js';

export {
  FileBlob,
  FileFsRef,
  FileRef,
  Lambda,
  NodejsLambda,
  createLambda,
  Prerender,
  download,
  downloadFile,
  getWriteableDirectory,
  glob,
  rename,
  spawnAsync,
  getScriptName,
  installDependencies,
  runPackageJsonScript,
  execCommand,
  spawnCommand,
  walkParentDirs,
  getNodeBinPath,
  getNodeBinPaths,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  runCustomInstallCommand,
  getEnvForPackageManager,
  getNodeVersion,
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  getSpawnOptions,
  getPlatformEnv,
  getPrefixedEnvVars,
  streamToBuffer,
  debug,
  isSymbolicLink,
  isDirectory,
  getLambdaOptionsFromFunction,
  scanParentDirs,
  getIgnoreFilter,
  cloneEnv,
  hardLinkDir,
  traverseUpDirectories,
  validateNpmrc,
};

export type { DownloadedFiles, GlobOptions };

export { EdgeFunction } from './edge-function.js';
export { readConfigFile } from './fs/read-config-file.js';
export { normalizePath } from './fs/normalize-path.js';

export * from './should-serve.js';
export * from './schemas.js';
export * from './types.js';
export * from './errors.js';
