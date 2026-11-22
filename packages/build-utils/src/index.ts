import FileBlob from './file-blob';
import FileFsRef from './file-fs-ref';
import FileRef from './file-ref';
import {
  Lambda,
  createLambda,
  findMatchingFunction,
  getLambdaOptionsFromFunction,
  sanitizeConsumerName,
} from './lambda';
import { NodejsLambda, type NodejsLambdaOptions } from './nodejs-lambda';
import {
  Prerender,
  type PrerenderInitialMetadata,
  type PrerenderOnMiss,
} from './prerender';
import download, {
  downloadFile,
  type DownloadedFiles,
  isSymbolicLink,
  isDirectory,
  isExternalSymlink,
  isExternalSymlinkTarget,
  getSymlinkTarget,
} from './fs/download';
import getWriteableDirectory from './fs/get-writable-directory';
import glob, { type GlobOptions } from './fs/glob';
import rename from './fs/rename';
import {
  spawnAsync,
  execCommand,
  spawnCommand,
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
  type PipInstallResult,
  type NpmInstallOutput,
  type CliType,
  type WorkspaceInstallTarget,
} from './fs/run-user-scripts';
import {
  getLatestNodeVersion,
  getDiscontinuedNodeVersions,
  getSupportedNodeVersion,
  isBunVersion,
  getSupportedBunVersion,
} from './fs/node-version';
import {
  findPackageJson,
  walkParentDirs,
  traverseUpDirectories,
} from './fs/find-package-json';
import streamToBuffer, { streamToBufferChunks } from './fs/stream-to-buffer';
import { getOrCreateBunBinary } from './fs/bun-helpers';
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
import { getNodeExecPath } from './get-node-exec-path';
import { validateNpmrc } from './validate-npmrc';

export type { NodejsLambdaOptions, PrerenderInitialMetadata, PrerenderOnMiss };
export { createDaemonStaticFileFilter } from './daemon-static-publishing';
export type { LambdaAffinity } from './lambda';

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
  type DownloadedFiles,
  getWriteableDirectory,
  glob,
  type GlobOptions,
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
  getNodeExecPath,
  getSupportedNodeVersion,
  isBunVersion,
  getSupportedBunVersion,
  getOrCreateBunBinary,
  detectPackageManager,
  runNpmInstall,
  type NpmInstallOutput,
  type WorkspaceInstallTarget,
  runBundleInstall,
  runPipInstall,
  type PipInstallResult,
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
  findMatchingFunction,
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
export { getProvidedRuntime } from './provided-runtime';

export { shouldServe } from './should-serve';
export {
  getFunctionsSchema,
  functionsSchema,
  buildsSchema,
  packageManifestSchema,
} from './schemas';
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

export { resolveBuildConcurrency } from './resolve-build-concurrency';

export { generateNodeBuilderFunctions } from './generate-node-builder-functions';

export {
  getRegExpFromMatchers,
  resolveMiddlewareMatcher,
} from './middleware-matcher';

export {
  BACKEND_FRAMEWORKS,
  BACKEND_BUILDERS,
  UNIFIED_BACKEND_BUILDER,
  type BackendFramework,
  isBackendFramework,
  isNodeBackendFramework,
  isBackendBuilder,
  isExperimentalBackendsEnabled,
  isExperimentalBackendsWithoutIntrospectionEnabled,
  shouldUseExperimentalBackends,
  PYTHON_FRAMEWORKS,
  type PythonFramework,
  isPythonFramework,
} from './framework-helpers';

export { isNodeEntrypoint } from './node-entrypoint';
export * from './service-path-utils';
export * from './schedule-path-utils';
export * from './schedules';
export {
  DAEMON_NAME_PATTERN,
  getDaemonImageRepository,
  getDaemonNames,
  type DaemonConfig,
  type DaemonOutput,
  type DaemonInstances,
  type DaemonLivenessProbe,
  type DaemonReplicas,
  type DaemonResources,
  type Daemons,
} from './daemons';

export {
  streamToDigestAsync,
  sha256,
  type FileDigest,
} from './fs/stream-to-digest-async';

export {
  EMPTY_DISCOVERY,
  NAVIGATION_ACCEPT_RE,
  promoteStaticFiles,
  staticBundleExclusions,
  staticDirectoryRedirects,
  staticFallbackRoutes,
  staticShadowRoutes,
  type ShadowRoute,
  type StaticBundleExclusions,
  type StaticFallback,
  type StaticDiscovery,
  type StaticMount,
  type StaticPromotionOptions,
  type StaticPromotionResult,
} from './static-files';
