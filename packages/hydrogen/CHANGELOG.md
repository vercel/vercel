# @vercel/hydrogen

## 24.0.0

### Patch Changes

- Updated dependencies [5f55ccc]
- Updated dependencies [d0629bd]
  - @vercel/build-utils@15.1.0

## 23.0.2

### Patch Changes

- 2f0edaf: Report the runtime preset for services without a framework.
- Updated dependencies [2f0edaf]
  - @vercel/build-utils@15.0.2

## 23.0.1

### Patch Changes

- Updated dependencies [1a379a3]
  - @vercel/build-utils@15.0.1

## 23.0.0

### Patch Changes

- Updated dependencies [9b1b587]
- Updated dependencies [fec2df1]
- Updated dependencies [d123652]
  - @vercel/build-utils@15.0.0

## 22.0.0

### Patch Changes

- Updated dependencies [9abaa6d]
- Updated dependencies [179d4ab]
- Updated dependencies [d39dd61]
- Updated dependencies [5aa1b58]
  - @vercel/build-utils@14.23.0

## 21.0.0

### Patch Changes

- Updated dependencies [a19979c]
- Updated dependencies [a2e9f5d]
  - @vercel/build-utils@14.22.0

## 20.0.3

### Patch Changes

- Updated dependencies [bb42e81]
  - @vercel/build-utils@14.21.3

## 20.0.2

### Patch Changes

- Updated dependencies [cd68435]
  - @vercel/build-utils@14.21.2

## 20.0.1

### Patch Changes

- Updated dependencies [1336097]
  - @vercel/build-utils@14.21.1

## 20.0.0

### Patch Changes

- Updated dependencies [24a7e04]
- Updated dependencies [7e396f7]
  - @vercel/build-utils@14.21.0

## 19.0.1

### Patch Changes

- Updated dependencies [42cc083]
  - @vercel/build-utils@14.20.1

## 19.0.0

### Patch Changes

- Updated dependencies [e041037]
  - @vercel/build-utils@14.20.0

## 18.0.0

### Patch Changes

- Updated dependencies [e58b37a]
  - @vercel/build-utils@14.19.0

## 17.0.0

### Patch Changes

- Updated dependencies [94f6cea]
- Updated dependencies [3eeaad5]
- Updated dependencies [8ac5320]
  - @vercel/build-utils@14.18.0

## 16.0.0

### Patch Changes

- Updated dependencies [28a7ab7]
- Updated dependencies [28a7ab7]
  - @vercel/build-utils@14.17.0

## 15.0.0

### Patch Changes

- Updated dependencies [20c5940]
  - @vercel/build-utils@14.16.0

## 14.0.0

### Patch Changes

- Updated dependencies [a7ef28c]
  - @vercel/build-utils@14.15.0

## 13.0.0

### Patch Changes

- Updated dependencies [deb48cd]
  - @vercel/build-utils@14.14.0

## 12.0.2

### Patch Changes

- Updated dependencies [5d88f1f]
- Updated dependencies [ff3d2f7]
  - @vercel/static-config@3.4.4
  - @vercel/build-utils@14.13.2

## 12.0.1

### Patch Changes

- Updated dependencies [5082546]
  - @vercel/build-utils@14.13.1

## 12.0.0

### Patch Changes

- Updated dependencies [34b2c8e]
  - @vercel/build-utils@14.13.0

## 11.0.0

### Patch Changes

- Updated dependencies [6e68e60]
  - @vercel/build-utils@14.12.0

## 10.0.0

### Patch Changes

- Updated dependencies [888f59e]
- Updated dependencies [7eb63c0]
  - @vercel/build-utils@14.11.0

## 9.0.2

### Patch Changes

- Updated dependencies [53a6086]
  - @vercel/build-utils@14.10.2

## 9.0.1

### Patch Changes

- Updated dependencies [f9d0e90]
- Updated dependencies [8a277e4]
- Updated dependencies [66e443e]
- Updated dependencies [08b0be2]
  - @vercel/build-utils@14.10.1

## 9.0.0

### Patch Changes

- Updated dependencies [2a57243]
- Updated dependencies [54a6d73]
- Updated dependencies [3d16792]
  - @vercel/build-utils@14.10.0

## 8.0.3

### Patch Changes

- Updated dependencies [55e8d1e]
  - @vercel/build-utils@14.9.3

## 8.0.2

### Patch Changes

- Updated dependencies [b174f14]
  - @vercel/build-utils@14.9.2

## 8.0.1

### Patch Changes

- Updated dependencies [1817491]
  - @vercel/build-utils@14.9.1

## 8.0.0

### Patch Changes

- Updated dependencies [392c759]
  - @vercel/build-utils@14.9.0

## 7.0.0

### Patch Changes

- Updated dependencies [a652a99]
  - @vercel/build-utils@14.8.0

## 6.0.0

### Patch Changes

- Updated dependencies [26b891e]
- Updated dependencies [37ff9da]
  - @vercel/build-utils@14.7.0

## 5.0.1

### Patch Changes

- Updated dependencies [aad9541]
  - @vercel/build-utils@14.6.1

## 5.0.0

### Patch Changes

- Updated dependencies [e82de48]
  - @vercel/build-utils@14.6.0

## 4.0.3

### Patch Changes

- Updated dependencies [b9e12f0]
  - @vercel/static-config@3.4.3

## 4.0.2

### Patch Changes

- Updated dependencies [a443e57]
  - @vercel/build-utils@14.5.1

## 4.0.1

### Patch Changes

- 2c363fd: Use Oxc as `@vercel/static-config`'s primary parser with a traced ts-morph compatibility fallback.
- Updated dependencies [2c363fd]
  - @vercel/static-config@3.4.2

## 4.0.0

### Patch Changes

- Updated dependencies [90afd71]
  - @vercel/build-utils@14.5.0

## 3.0.1

### Patch Changes

- Updated dependencies [e5b0363]
  - @vercel/build-utils@14.4.1

## 3.0.0

### Patch Changes

- Updated dependencies [f8add0a]
  - @vercel/build-utils@14.4.0

## 2.0.0

### Patch Changes

- cd6b038: Honor `package.json` pnpm pins without Corepack, and default new projects to pnpm 11.

  When Corepack is off, `devEngines.packageManager` is preferred, then a lockfile-compatible `packageManager` field, then `engines.pnpm` as a selector. Unpinned lockfile `9.0` projects created on or after 2026-08-19 use pnpm 11 (Node 22+) if `/pnpm11` is present in the build image; otherwise they keep pnpm 10.

- 0d71a61: Declare `@vercel/build-utils` as a peer dependency provided by Vercel CLI so builders load correctly with strict dependency isolation, including pnpm global installs.
- Updated dependencies [0b08df6]
- Updated dependencies [cd6b038]
- Updated dependencies [96444ba]
  - @vercel/build-utils@14.3.0

## 1.4.2

### Patch Changes

- b4f09c1: Support selecting Bun 1.4.x as an explicit runtime and build-time package manager, including local Bun servers.

## 1.4.1

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.
- Updated dependencies [6d7fbfa]
  - @vercel/static-config@3.4.1

## 1.4.0

### Minor Changes

- 78e5d4f: Add project manifest to node frontend builders.

## 1.3.8

### Patch Changes

- Updated dependencies [eecd10d]
  - @vercel/static-config@3.4.0

## 1.3.7

### Patch Changes

- Updated dependencies [c56f851]
  - @vercel/static-config@3.3.0

## 1.3.6

### Patch Changes

- Updated dependencies [[`8a3558f680d592b4ea47ac7e48c99145d6368941`](https://github.com/vercel/vercel/commit/8a3558f680d592b4ea47ac7e48c99145d6368941)]:
  - @vercel/static-config@3.2.0

## 1.3.5

### Patch Changes

- Remove getSpawnOptions ([#14604](https://github.com/vercel/vercel/pull/14604))

## 1.3.4

### Patch Changes

- Replace getNodeVersion with getRuntimeNodeVersion ([#14600](https://github.com/vercel/vercel/pull/14600))

## 1.3.3

### Patch Changes

- Use `workspace:*` for workspace dependencies ([#14396](https://github.com/vercel/vercel/pull/14396))

## 1.3.2

### Patch Changes

- Revert "Remove getSpawnOptions" ([#14261](https://github.com/vercel/vercel/pull/14261))

## 1.3.1

### Patch Changes

- Remove getSpawnOptions ([#14176](https://github.com/vercel/vercel/pull/14176))

## 1.3.0

### Minor Changes

- Add support for Bun through a vercel.json property ([#14130](https://github.com/vercel/vercel/pull/14130))

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
