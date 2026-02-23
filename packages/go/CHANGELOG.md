# @vercel/go

## 3.4.1

### Patch Changes

- Forward Go and Ruby dev server output through `startDevServer` stdout/stderr callbacks so service logs are correctly prefixed in multi-service `vercel dev`. ([#14989](https://github.com/vercel/vercel/pull/14989))

## 3.4.0

### Minor Changes

- Add experimental Go runtime framework preset. ([#14865](https://github.com/vercel/vercel/pull/14865))

  This adds support for deploying standalone Go HTTP servers (using `package main` with `func main()`) in addition to the existing serverless function pattern. The preset supports:

  - `main.go` at project root (simple projects)
  - `cmd/api/main.go` (API servers)
  - `cmd/server/main.go` (HTTP servers)

  The Go application must listen on the port specified by the `PORT` environment variable.

## 3.3.5

### Patch Changes

- Update deprecated tar package ([#14877](https://github.com/vercel/vercel/pull/14877))

## 3.3.4

### Patch Changes

- Add syncpack to enforce @types/node version consistency across the monorepo. ([#14665](https://github.com/vercel/vercel/pull/14665))

  Update @types/node to 20.11.0 and fix type compatibility issues.

## 3.3.3

### Patch Changes

- [go] fix ci failing e2e tests ([#14640](https://github.com/vercel/vercel/pull/14640))

## 3.3.2

### Patch Changes

- Set runtimeLanguage to 'go' when creating Lambda functions ([#14628](https://github.com/vercel/vercel/pull/14628))

## 3.3.1

### Patch Changes

- Use deterministic tmpdir when setting GOMODCACHE and GOCACHE dirs. ([#14626](https://github.com/vercel/vercel/pull/14626))

## 3.3.0

### Minor Changes

- Use GOMODCACHE and GOCACHE to speed up rebuilding Go projects ([#14484](https://github.com/vercel/vercel/pull/14484))

## 3.2.4

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

## 3.2.3

### Patch Changes

- Respect patch version of 0 ([#13672](https://github.com/vercel/vercel/pull/13672))

## 3.2.2

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 3.2.1

### Patch Changes

- fix bug on go.work in dev missing go version declaration ([#12574](https://github.com/vercel/vercel/pull/12574))

## 3.2.0

### Minor Changes

- Support parse go patch version in go.mod and allows to use specific toolchain ([#11064](https://github.com/vercel/vercel/pull/11064))

## 3.1.3

### Patch Changes

- Support patch versions in go mod ([#12110](https://github.com/vercel/vercel/pull/12110))

## 3.1.2

### Patch Changes

- Added support for Go 1.23 and updated Go patch versions of 1.22 and 1.21 ([#12027](https://github.com/vercel/vercel/pull/12027))

## 3.1.1

### Patch Changes

- Add support for `1.22` and update Go minor versions `1.19`, `1.20` and `1.21` ([#11156](https://github.com/vercel/vercel/pull/11156))

## 3.1.0

### Minor Changes

- Use `provided.al2023` runtime when using AL2023 build image ([#11370](https://github.com/vercel/vercel/pull/11370))

## 3.0.5

### Patch Changes

- Remove `VERCEL_USE_GO_PROVIDED_RUNTIME` env var check ([#10968](https://github.com/vercel/vercel/pull/10968))

## 3.0.4

### Patch Changes

- Set Lambda runtime to "provided.al2" ([#10880](https://github.com/vercel/vercel/pull/10880))

## 3.0.3

### Patch Changes

- Update broken documentation link ([#10579](https://github.com/vercel/vercel/pull/10579))

## 3.0.2

### Patch Changes

- Add support for Go v1.21.0 ([#10552](https://github.com/vercel/vercel/pull/10552))

## 3.0.1

### Patch Changes

- Update to esbuild script ([#10468](https://github.com/vercel/vercel/pull/10468))

## 3.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
