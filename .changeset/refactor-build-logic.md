---
'@vercel/build': minor
'vercel': patch
---

Created new `@vercel/build` package containing build orchestration utilities.

- Added new `runBuild` function that contains the core build execution logic
- Added `prepareBuild` function to detect builders and routes
- Added helper functions: `expandBuild`, `mergeImages`, `mergeCrons`, `mergeWildcard`, `mergeDeploymentId`, `validateDeploymentId`, `writeBuildJson`, `writeFlagsJSON`, `getFrameworkRoutes`, `getFramework`, `initCorepack`, `cleanupCorepack`
- Added type definitions: `BuildLogger`, `BuilderWithPkg`, `BuilderV2`, `BuilderV3`, `RunBuildOptions`, `BuildsManifest`, `BuildOutputConfig`, `SerializedBuilder`, `PathOverride`, `Route`, `Framework`, `ProjectSettings`, `VercelConfig`, `PrepareBuildOptions`, `PrepareBuildResult`, `DetectBuildersResult`
- CLI build command now imports from @vercel/build while keeping CLI-specific logic (argument parsing, telemetry, project settings retrieval) in the CLI package
- This new package avoids circular dependencies that would occur if these utilities were added to @vercel/build-utils
