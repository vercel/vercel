# @vercel/build-utils

## 8.2.2

### Patch Changes

- Change node 16.x EOL for Vercel ([#11704](https://github.com/vercel/vercel/pull/11704))

- Improve error message and refactor ([#11706](https://github.com/vercel/vercel/pull/11706))

- [built-utils] Handle case of not having lockfile when corepack is enabled ([#11697](https://github.com/vercel/vercel/pull/11697))

## 8.2.1

### Patch Changes

- [node] update node@16 deprecation day ([#11671](https://github.com/vercel/vercel/pull/11671))

## 8.2.0

### Minor Changes

- fix corepack detection for package manager version determination ([#11596](https://github.com/vercel/vercel/pull/11596))

### Patch Changes

- Fix triggering of ignored project settings node version warning ([#11550](https://github.com/vercel/vercel/pull/11550))

## 8.1.3

### Patch Changes

- [build-utils] log more around package manager detection ([#11594](https://github.com/vercel/vercel/pull/11594))

## 8.1.2

### Patch Changes

- add log to package manager version detection ([#11592](https://github.com/vercel/vercel/pull/11592))

## 8.1.1

### Patch Changes

- [build-utils] pnpm lockfile testing and fixing ([#11591](https://github.com/vercel/vercel/pull/11591))

## 8.1.0

### Minor Changes

- Update pnpm version detection logic ([#11445](https://github.com/vercel/vercel/pull/11445))
  Add support for pnpm 9

## 8.0.0

### Major Changes

- Remove legacy `avoidTopLevelInstall` logic ([#11513](https://github.com/vercel/vercel/pull/11513))

### Patch Changes

- [build-utils] Add `VERCEL_PROJECT_PRODUCTION_URL` framework env var prefix ([#11506](https://github.com/vercel/vercel/pull/11506))

## 7.12.0

### Minor Changes

- Trigger release ([#11465](https://github.com/vercel/vercel/pull/11465))

## 7.11.0

### Minor Changes

- Add `getOsRelease()` and `getProvidedRuntime()` functions ([#11370](https://github.com/vercel/vercel/pull/11370))

## 7.10.0

### Minor Changes

- Allow environment variables to be specified for `EdgeFunction` ([#11029](https://github.com/vercel/vercel/pull/11029))

## 7.9.1

### Patch Changes

- Export `getSupportedNodeVersion` ([#11277](https://github.com/vercel/vercel/pull/11277))

## 7.9.0

### Minor Changes

- Add `base` parameter to `scanParentDirs()` ([#11261](https://github.com/vercel/vercel/pull/11261))

## 7.8.0

### Minor Changes

- Remove `VERCEL_ENABLE_NPM_DEFAULT` env var check ([#11242](https://github.com/vercel/vercel/pull/11242))

### Patch Changes

- Rename variants to flags and remove legacy flags ([#11121](https://github.com/vercel/vercel/pull/11121))

## 7.7.1

### Patch Changes

- [build-utils] increase max memory limit ([#11209](https://github.com/vercel/vercel/pull/11209))

## 7.7.0

### Minor Changes

- Revert "Revert "Default ruby to only currently supported version (3.2.0)"" ([#11137](https://github.com/vercel/vercel/pull/11137))

## 7.6.0

### Minor Changes

- Revert "Default ruby to only currently supported version (3.2.0)" ([#11135](https://github.com/vercel/vercel/pull/11135))

- Mark `flags` as deprecated and replace them with `variants` ([#11098](https://github.com/vercel/vercel/pull/11098))

- [build-utils] change default package manager when no lockfile detected from `yarn` to `npm` (gated behind feature flag) ([#11131](https://github.com/vercel/vercel/pull/11131))

### Patch Changes

- Update internal type for variants ([#11111](https://github.com/vercel/vercel/pull/11111))

## 7.5.1

### Patch Changes

- Add experimental field to Lambda and size to FileFsRef output ([#11059](https://github.com/vercel/vercel/pull/11059))

## 7.5.0

### Minor Changes

- Deprecate `EdgeFunction#name` property ([#11010](https://github.com/vercel/vercel/pull/11010))

## 7.4.1

### Patch Changes

- Extend Node v16 discontinue date to 2024-06-15 ([#10967](https://github.com/vercel/vercel/pull/10967))

## 7.4.0

### Minor Changes

- Adds new helper `getPathForPackageManager()` ([#10918](https://github.com/vercel/vercel/pull/10918))

## 7.3.0

### Minor Changes

- [cli] add `--deprecated` option to `vc project ls` command ([#10919](https://github.com/vercel/vercel/pull/10919))

## 7.2.5

### Patch Changes

- Remove Node.js v20 env var check ([#10834](https://github.com/vercel/vercel/pull/10834))

## 7.2.4

### Patch Changes

- Select Node.js version based on what's available in build-container ([#10822](https://github.com/vercel/vercel/pull/10822))

## 7.2.3

### Patch Changes

- Add experimental flag to allow Node.js v20 ([#10802](https://github.com/vercel/vercel/pull/10802))

## 7.2.2

### Patch Changes

- [cli] Update bun detection and add tests for projects with both bunlock binary and yarn.lock text files ([#10583](https://github.com/vercel/vercel/pull/10583))

## 7.2.1

### Patch Changes

- Internal variants ([#10549](https://github.com/vercel/vercel/pull/10549))

## 7.2.0

### Minor Changes

- Add new optional prerender field: experimentalStreamingLambdaPath ([#10476](https://github.com/vercel/vercel/pull/10476))

- [build-utils] Add zero config detection for bun package manager ([#10486](https://github.com/vercel/vercel/pull/10486))

### Patch Changes

- add `experimentalBypassFor` field to Prerender ([#10481](https://github.com/vercel/vercel/pull/10481))

## 7.1.1

### Patch Changes

- add descriptions to NodeVersion properties ([#10403](https://github.com/vercel/vercel/pull/10403))

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

## 7.1.0

### Minor Changes

- Support serverless function architecture ([#10392](https://github.com/vercel/vercel/pull/10392))

## 7.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

## 6.8.3

### Patch Changes

- Fix `getPrefixedEnvVars()` to handle `VERCEL_BRANCH_URL` ([#10315](https://github.com/vercel/vercel/pull/10315))

## 6.8.2

### Patch Changes

- Push back `nodejs16.x` discontinue date to `2024-02-06` ([#10209](https://github.com/vercel/vercel/pull/10209))

## 6.8.1

### Patch Changes

- Revert "[build-utils] Allow file-ref sema to be controlled through env flag" ([#10167](https://github.com/vercel/vercel/pull/10167))

## 6.8.0

### Minor Changes

- Add `getNodeBinPaths()` and `traverseUpDirectories()` functions ([#10150](https://github.com/vercel/vercel/pull/10150))

## 6.7.5

### Patch Changes

- Publish missing build-utils ([`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb))

## 6.7.4

### Patch Changes

- Remove usage of `env` from Edge Functions and Middleware ([#10018](https://github.com/vercel/vercel/pull/10018))

## 6.7.3

### Patch Changes

- Deprecate Node.js 14.x and 16.x with warning ([#9976](https://github.com/vercel/vercel/pull/9976))
