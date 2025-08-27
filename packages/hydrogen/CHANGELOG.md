# @vercel/hydrogen

## 1.2.4

### Patch Changes

- Updated dependencies [[`6260486192ca407fc2d91f317ed81533548b8629`](https://github.com/vercel/vercel/commit/6260486192ca407fc2d91f317ed81533548b8629)]:
  - @vercel/static-config@3.1.2

## 1.2.3

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 1.2.2

### Patch Changes

- Updated dependencies [[`6c8e763ab63c79e12c7d5455fd79cf158f43cc77`](https://github.com/vercel/vercel/commit/6c8e763ab63c79e12c7d5455fd79cf158f43cc77)]:
  - @vercel/static-config@3.1.1

## 1.2.1

### Patch Changes

- Updated dependencies [[`0d86d9c3fa61ae91f0ed4ffe4c0c97655411468f`](https://github.com/vercel/vercel/commit/0d86d9c3fa61ae91f0ed4ffe4c0c97655411468f)]:
  - @vercel/static-config@3.1.0

## 1.2.0

### Minor Changes

- Detect v9 pnpm lock files as pnpm 10 for new projects ([#13072](https://github.com/vercel/vercel/pull/13072))

## 1.1.0

### Minor Changes

- Add .yarn/cache to build cache ([#12961](https://github.com/vercel/vercel/pull/12961))

## 1.0.11

### Patch Changes

- Revert build utils refactor ([#12818](https://github.com/vercel/vercel/pull/12818))

## 1.0.10

### Patch Changes

- Refactor build-util usage to reuse detected lockfile ([#12813](https://github.com/vercel/vercel/pull/12813))

## 1.0.9

### Patch Changes

- Fix corepack `packageManager` detection on monorepos ([#12258](https://github.com/vercel/vercel/pull/12258))

## 1.0.8

### Patch Changes

- Revert "[build-utils] Fix corepack `packageManager` detection on monorepos" ([#12242](https://github.com/vercel/vercel/pull/12242))

## 1.0.7

### Patch Changes

- Disable corepack when Turborepo does not support `COREPACK_HOME` ([#12211](https://github.com/vercel/vercel/pull/12211))

- Fix corepack `packageManager` detection on monorepos ([#12219](https://github.com/vercel/vercel/pull/12219))

## 1.0.6

### Patch Changes

- Revert "Revert "Revert "Fix corepack `packageManager` detection on monorepos""" ([#12099](https://github.com/vercel/vercel/pull/12099))

## 1.0.5

### Patch Changes

- Revert "Revert "Fix corepack `packageManager` detection on monorepos"" ([#11871](https://github.com/vercel/vercel/pull/11871))

## 1.0.4

### Patch Changes

- Revert "Fix corepack `packageManager` detection on monorepos" ([#11865](https://github.com/vercel/vercel/pull/11865))

## 1.0.3

### Patch Changes

- Fix corepack `packageManager` detection on monorepos ([#11811](https://github.com/vercel/vercel/pull/11811))

## 1.0.2

### Patch Changes

- Deprecate `EdgeFunction#name` property ([#11010](https://github.com/vercel/vercel/pull/11010))

## 1.0.1

### Patch Changes

- Use `build-builder.mjs` script to bundle, and remove types and source maps ([#10480](https://github.com/vercel/vercel/pull/10480))

## 1.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))
