import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import { Lambda, createLambda, getLambdaOptionsFromFunction } from './lambda';
import { Prerender } from './prerender';
import download, { DownloadedFiles, isSymbolicLink } from './fs/download';
import getWriteableDirectory from './fs/get-writable-directory';
import glob from './fs/glob';
import rename from './fs/rename';
import {
  execAsync,
  spawnAsync,
  execCommand,
  spawnCommand,
  installDependencies,
  runPackageJsonScript,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
} from './fs/run-user-scripts';
import streamToBuffer from './fs/stream-to-buffer';
import shouldServe from './should-serve';
import { detectBuilders } from './detect-builders';
import { detectRoutes, detectOutputDirectory } from './detect-routes';
import DetectorFilesystem from './detectors/filesystem';
import debug from './debug';

export {
  FileBlob,
  FileFsRef,
  FileRef,
  Lambda,
  DetectorFilesystem,
  createLambda,
  Prerender,
  download,
  DownloadedFiles,
  getWriteableDirectory,
  glob,
  rename,
  execAsync,
  spawnAsync,
  installDependencies,
  runPackageJsonScript,
  execCommand,
  spawnCommand,
  runNpmInstall,
  runBundleInstall,
  runPipInstall,
  runShellScript,
  getNodeVersion,
  getSpawnOptions,
  streamToBuffer,
  shouldServe,
  detectBuilders,
  detectRoutes,
  detectOutputDirectory,
  debug,
  isSymbolicLink,
  getLambdaOptionsFromFunction,
};

export { detectBuildersLegacy } from './detect-builders-legacy';
export { detectRoutesLegacy } from './detect-routes-legacy';

export { detectDefaults } from './detectors';
export * from './schemas';
export * from './types';
