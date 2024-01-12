# @vercel/build-utils

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
