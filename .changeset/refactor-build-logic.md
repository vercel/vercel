---
'@vercel/build-utils': minor
'vercel': patch
---

Refactored build command to extract build-specific logic into @vercel/build-utils.

- Added new `runBuild` function that contains the core build execution logic
- Added helper functions: `expandBuild`, `mergeImages`, `mergeCrons`, `mergeWildcard`, `mergeDeploymentId`, `validateDeploymentId`, `writeBuildJson`, `writeFlagsJSON`, `getFrameworkRoutes`, `getFramework`
- Added type definitions: `BuildLogger`, `BuilderWithPkg`, `BuilderV2`, `BuilderV3`, `RunBuildOptions`, `BuildsManifest`, `BuildOutputConfig`, `SerializedBuilder`, `PathOverride`, `Route`, `Framework`, `ProjectSettings`, `VercelConfig`
- CLI build command now calls the build function from @vercel/build-utils while keeping CLI-specific logic (argument parsing, telemetry, project settings retrieval) in the CLI package
