# @vercel/go

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
