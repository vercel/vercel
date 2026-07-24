import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import {
  Lambda,
  createLambda,
  getLambdaOptionsFromFunction,
  sanitizeConsumerName,
} from './lambda';
import { NodejsLambda, type NodejsLambdaOptions } from './nodejs-lambda';
import { Prerender } from './prerender';
import download, {
  downloadFile,
  DownloadedFiles,
  isSymbolicLink,
  isDirectory,
  isExternalSymlink,
  isExternalSymlinkTarget,
  getSymlinkTarget,
} from './fs/download';
import getWriteableDirectory from './fs/get-writable-directory';
import glob, { GlobOptions } from './fs/glob';
import rename from './fs/rename';
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
  resetCustomInstallCommandSet,
  getEnvForPackageManager,
  getNodeVersion,
  getPathForPackageManager,
  detectPackageManager,
  getSpawnOptions,
  getNodeBinPath,
  getNodeBinPaths,
  scanParentDirs,
  findPackageJson,
  traverseUpDirectories,
  PipInstallResult,
  NpmInstallOutput,
  type CliType,
} from './fs/run-user-scripts';
import {
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  getSupportedNodeVersion,
  isBunVersion,
  getSupportedBunVersion,
} from './fs/node-version';
import streamToBuffer, { streamToBufferChunks } from './fs/stream-to-buffer';
import debug from './debug';
import getIgnoreFilter from './get-ignore-filter';
import { getPlatformEnv } from './get-platform-env';
import { getPrefixedEnvVars } from './get-prefixed-env-vars';
import {
  getServiceUrlEnvVars,
  getExperimentalServiceUrlEnvVars,
} from './get-service-url-env-vars';
import { cloneEnv } from './clone-env';
import { hardLinkDir } from './hard-link-dir';
import { validateNpmrc } from './validate-npmrc';

export type { NodejsLambdaOptions };

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
  DownloadedFiles,
  getWriteableDirectory,
  glob,
  GlobOptions,
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
  getSupportedNodeVersion,
  isBunVersion,
  getSupportedBunVersion,
  detectPackageManager,
  runNpmInstall,
  NpmInstallOutput,
  runBundleInstall,
  runPipInstall,
  PipInstallResult,
  runShellScript,
  runCustomInstallCommand,
  resetCustomInstallCommandSet,
  getEnvForPackageManager,
  getNodeVersion,
  getPathForPackageManager,
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  getSpawnOptions,
  getPlatformEnv,
  getPrefixedEnvVars,
  getServiceUrlEnvVars,
  getExperimentalServiceUrlEnvVars,
  streamToBuffer,
  streamToBufferChunks,
  debug,
  isSymbolicLink,
  isDirectory,
  isExternalSymlink,
  isExternalSymlinkTarget,
  getSymlinkTarget,
  getLambdaOptionsFromFunction,
  sanitizeConsumerName,
  scanParentDirs,
  findPackageJson,
  getIgnoreFilter,
  cloneEnv,
  hardLinkDir,
  traverseUpDirectories,
  validateNpmrc,
  type CliType,
};

export { EdgeFunction } from './edge-function';
export { ContainerImage } from './container-image';
export type { ContainerImageConfig } from './container-image';
export { readConfigFile, getPackageJson } from './fs/read-config-file';
export { normalizePath } from './fs/normalize-path';
export { getOsRelease, getProvidedRuntime } from './os';

export * from './should-serve';
export * from './schemas';
export {
  DEFAULT_MAX_DURATION_LIMIT,
  SKIP_MAX_DURATION_LIMIT_ENV,
  getMaxDurationLimit,
  getMaxDurationSchema,
} from './max-duration';
export * from './package-manifest';
export * from './deploy-manifest';
export { generateProjectManifest } from './node-diagnostics';
export {
  generateRubyProjectManifest,
  parseGemfileLock,
} from './ruby-diagnostics';
export * from './types';
export * from './errors';

export * from './trace';

export { NODE_VERSIONS } from './fs/node-version';

export { getInstalledPackageVersion } from './get-installed-package-version';
export { isPackageInstalled } from './is-package-installed';

export { defaultCachePathGlob } from './default-cache-path-glob';

export { generateNodeBuilderFunctions } from './generate-node-builder-functions';

export {
  BACKEND_FRAMEWORKS,
  BACKEND_BUILDERS,
  UNIFIED_BACKEND_BUILDER,
  BackendFramework,
  isBackendFramework,
  isNodeBackendFramework,
  isBackendBuilder,
  isExperimentalBackendsEnabled,
  isExperimentalBackendsWithoutIntrospectionEnabled,
  shouldUseExperimentalBackends,
  PYTHON_FRAMEWORKS,
  PythonFramework,
  isPythonFramework,
} from './framework-helpers';

export * from './python';
export * from './node-entrypoint';
export * from './service-path-utils';

export {
  streamToDigestAsync,
  sha256,
  md5,
  type FileDigest,
} from './fs/stream-to-digest-async';

export {
  getBuildResultMetadata,
  type BuildResultMetadata,
} from './collect-build-result/get-build-result-metadata';
export { getLambdaByOutputPath } from './collect-build-result/get-lambda-by-output-path';
export { isRouteMiddleware } from './collect-build-result/is-route-middleware';
export { getPrerenderChain } from './collect-build-result/get-prerender-chain';

export { validateFrameworkVersion } from './deserialize/validate-framework-version';
export { hydrateFilesMap } from './deserialize/hydrate-files-map';
export { createFunctionsIterator } from './deserialize/create-functions-iterator';
export { maybeReadJSON } from './deserialize/maybe-read-json';
export {
  deserializeBuildOutput,
  validateDeploymentId,
} from './deserialize/deserialize-build-output';
export type {
  DeserializeBuildOutputConfig,
  DeserializeBuildOutputResult,
  DeserializeBuildOutputPathOverride,
  DeserializeBuildOutputOptions,
  DeserializeBuildOutputLambdaOptions,
  GroupLambdasOptions,
  DeserializeBuildOutputSerializedConfig,
  DeserializeBuildOutputSerializedPrerender,
} from './deserialize/deserialize-build-output-types';

export {
  deserializeLambda,
  type DeserializeLambdaOptions,
} from './deserialize/deserialize-lambda';
export { deserializeEdgeFunction } from './deserialize/deserialize-edge-function';
export type {
  Properties,
  SerializedLambda,
  SerializedNodejsLambda,
  SerializedEdgeFunction,
  SerializedFileFsRef,
  SerializedPrerender,
} from './deserialize/serialized-types';
