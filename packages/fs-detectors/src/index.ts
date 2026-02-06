export {
  detectApiDirectory,
  detectApiExtensions,
  detectBuilders,
  detectOutputDirectory,
  type Options as DetectBuildersOptions,
  REGEX_NON_VERCEL_PLATFORM_FILES,
} from './detect-builders';
export { detectFileSystemAPI } from './detect-file-system-api';
export {
  detectFramework,
  detectFrameworkRecord,
  detectFrameworks,
  detectFrameworkVersion,
} from './detect-framework';
export { detectInstrumentation } from './detect-instrumentation';
export { DetectorFilesystem } from './detectors/filesystem';
export { LocalFileSystemDetector } from './detectors/local-file-system-detector';
export { getProjectPaths } from './get-project-paths';
export { isOfficialRuntime, isStaticRuntime } from './is-official-runtime';
export * from './monorepos/get-monorepo-default-settings';
export { monorepoManagers } from './monorepos/monorepo-managers';
export { packageManagers } from './package-managers/package-managers';
export type {
  AutoDetectOptions,
  AutoDetectResult,
} from './services/auto-detect';
export { autoDetectServices } from './services/auto-detect';
export {
  detectServices,
  generateServicesRoutes,
} from './services/detect-services';
export { getServicesBuilders } from './services/get-services-builders';
export type {
  DetectServicesOptions,
  DetectServicesResult,
  ResolvedService,
  Service,
  ServiceDetectionError,
  ServicesRoutes,
} from './services/types';
export { isStaticBuild } from './services/utils';
export {
  GetWorkspacePackagePathsOptions,
  getWorkspacePackagePaths,
} from './workspaces/get-workspace-package-paths';
export {
  GetWorkspaceOptions,
  getWorkspaces,
  Workspace,
  WorkspaceType,
} from './workspaces/get-workspaces';
export { workspaceManagers } from './workspaces/workspace-managers';
