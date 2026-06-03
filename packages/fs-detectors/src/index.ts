export {
  detectBuilders,
  detectOutputDirectory,
  detectApiDirectory,
  detectApiExtensions,
  type Options as DetectBuildersOptions,
} from './detect-builders';
export {
  detectServices,
  generateServicesRoutes,
} from './services/detect-services';
export {
  resolveAllConfiguredServicesV2,
  resolveConfiguredServiceV2,
  validateServiceConfigV2,
} from './services/resolve-v2';
export {
  isExperimentalService,
  isExperimentalServiceV2,
} from '@vercel/build-utils';
export { autoDetectServices } from './services/auto-detect';
export type {
  AutoDetectOptions,
  AutoDetectResult,
} from './services/auto-detect';
export {
  isStaticBuild,
  isRouteOwningBuilder,
  INTERNAL_SERVICE_PREFIX,
  getInternalServiceFunctionPath,
  getInternalServiceCronPath,
  getInternalServiceCronPathPrefix,
  getInternalServiceWorkerPath,
  getInternalServiceWorkerPathPrefix,
} from './services/utils';
export { getServicesBuilders } from './services/get-services-builders';
export type {
  DetectServicesOptions,
  DetectServicesResult,
  DetectServicesSource,
  InferredServicesConfig,
  ResolvedServicesResult,
  InferredServicesResult,
  ResolvedService,
  Service,
  ExperimentalService,
  ExperimentalServiceV2,
  ExperimentalServiceV2Config,
  ExperimentalServicesV2,
  ExperimentalServiceV2Binding,
  ServicesRoutes,
  ServiceDetectionError,
} from './services/types';
export { detectFileSystemAPI } from './detect-file-system-api';
export {
  detectFramework,
  detectFrameworks,
  detectFrameworkRecord,
  detectFrameworkVersion,
} from './detect-framework';
export { getProjectPaths } from './get-project-paths';
export { DetectorFilesystem } from './detectors/filesystem';
export { LocalFileSystemDetector } from './detectors/local-file-system-detector';
export { workspaceManagers } from './workspaces/workspace-managers';
export {
  getWorkspaces,
  GetWorkspaceOptions,
  Workspace,
  WorkspaceType,
} from './workspaces/get-workspaces';
export {
  getWorkspacePackagePaths,
  GetWorkspacePackagePathsOptions,
} from './workspaces/get-workspace-package-paths';
export { monorepoManagers } from './monorepos/monorepo-managers';
export { isOfficialRuntime, isStaticRuntime } from './is-official-runtime';
export { packageManagers } from './package-managers/package-managers';
export * from './monorepos/get-monorepo-default-settings';
export { REGEX_NON_VERCEL_PLATFORM_FILES } from './detect-builders';
export { detectInstrumentation } from './detect-instrumentation';
