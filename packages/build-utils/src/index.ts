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
import { getServiceUrlEnvVars } from './get-service-url-env-vars';
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
  streamToBuffer,
  streamToBufferChunks,
  debug,
  isSymbolicLink,
  isDirectory,
  getLambdaOptionsFromFunction,
  sanitizeConsumerName,
  scanParentDirs,
  findPackageJson,
  getIgnoreFilter,
  cloneEnv,
  hardLinkDir,
  traverseUpDirectories,
  validateNpmrc,
};

export { EdgeFunction } from './edge-function';
export { readConfigFile, getPackageJson } from './fs/read-config-file';
export { normalizePath } from './fs/normalize-path';
export { getOsRelease, getProvidedRuntime } from './os';

export * from './should-serve';
export * from './schemas';
export * from './types';
export * from './errors';

export * from './trace';

export { NODE_VERSIONS } from './fs/node-version';

export { getInstalledPackageVersion } from './get-installed-package-version';

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

export {
  getEncryptedEnv,
  type EncryptedEnvFile,
} from './process-serverless/get-encrypted-env-file';
export { getLambdaEnvironment } from './process-serverless/get-lambda-environment';
export {
  getLambdaPreloadScripts,
  type BytecodeCachingOptions,
} from './process-serverless/get-lambda-preload-scripts';
export {
  getLambdaSupportsStreaming,
  type SupportsStreamingResult,
} from './process-serverless/get-lambda-supports-streaming';

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
export {
  streamWithExtendedPayload,
  type ExtendedBodyData,
} from './collect-build-result/stream-with-extended-payload';

export { collectUncompressedSize } from './collect-uncompressed-size';

export {
  finalizeLambda,
  type CreateZipResult,
  type CreateZipFn,
  type FinalizeLambdaParams,
  type FinalizeLambdaResult,
  type TraceFn,
} from './finalize-lambda';

export {
  validateLambdaSize,
  validateUncompressedLambdaSize,
  FunctionSizeError,
  MAX_LAMBDA_SIZE,
  MAX_LAMBDA_UNCOMPRESSED_SIZE,
  validateEnvWrapperSupport,
  ENV_WRAPPER_SUPPORTED_FAMILIES,
} from './validate-lambda-size';
