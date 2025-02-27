# @vercel/remix-builder

## 5.4.2

### Patch Changes

- Fix build failure when using an index route with a pathless layout ([#13108](https://github.com/vercel/vercel/pull/13108))

## 5.4.1

### Patch Changes

- Use proper npm package name for React Router in Preset error message ([#13103](https://github.com/vercel/vercel/pull/13103))

## 5.4.0

### Minor Changes

- Detect v9 pnpm lock files as pnpm 10 for new projects ([#13072](https://github.com/vercel/vercel/pull/13072))

## 5.3.3

### Patch Changes

- Update `@remix-run/dev` fork to v2.15.3 ([#12967](https://github.com/vercel/vercel/pull/12967))

## 5.3.2

### Patch Changes

- Leverage project settings to determine framework ([#13056](https://github.com/vercel/vercel/pull/13056))

## 5.3.1

### Patch Changes

- [remix] unify render function creation logic between Remix and React Router ([#13023](https://github.com/vercel/vercel/pull/13023))

- [remix] Add link to documentation after vercelPreset() warning ([#12942](https://github.com/vercel/vercel/pull/12942))

## 5.3.0

### Minor Changes

- Add support for custom server entrypoint in React Router apps ([#13043](https://github.com/vercel/vercel/pull/13043))

## 5.2.4

### Patch Changes

- Support "build" script that produces Build Output API ([#13031](https://github.com/vercel/vercel/pull/13031))

## 5.2.3

### Patch Changes

- [remix] extract remaining framework specific settings to FrameworkSettings ([#12992](https://github.com/vercel/vercel/pull/12992))

## 5.2.2

### Patch Changes

- better path-to-regexp diff logging ([#12962](https://github.com/vercel/vercel/pull/12962))

## 5.2.1

### Patch Changes

- [remix] extract common logic for getting files from trace ([#12983](https://github.com/vercel/vercel/pull/12983))

- [remix] extract common handler logic into `determineHandler` function ([#12973](https://github.com/vercel/vercel/pull/12973))

## 5.2.0

### Minor Changes

- Add .yarn/cache to build cache ([#12961](https://github.com/vercel/vercel/pull/12961))

## 5.1.2

### Patch Changes

- [remix] extract common function options ([#12960](https://github.com/vercel/vercel/pull/12960))

- [remix] extract sourceSearchValue into FrameworkSettings ([#12969](https://github.com/vercel/vercel/pull/12969))

- [remix] extract common edge file tracing logic ([#12953](https://github.com/vercel/vercel/pull/12953))

- [remix] remove check based on never set remixRunVercelPkgJson ([#12971](https://github.com/vercel/vercel/pull/12971))

- [remix] refactor framework slug into FrameworkSettings ([#12958](https://github.com/vercel/vercel/pull/12958))

## 5.1.1

### Patch Changes

- log diff between current and updated versions of path-to-regexp ([#12926](https://github.com/vercel/vercel/pull/12926))

## 5.1.0

### Minor Changes

- Add support for React Router v7 ([#12904](https://github.com/vercel/vercel/pull/12904))

- Enable `nativeFetch` when `v3_singleFetch` future flag is enabled ([#12918](https://github.com/vercel/vercel/pull/12918))

### Patch Changes

- [remix] Create an interface for differences remix vs react-router ([#12925](https://github.com/vercel/vercel/pull/12925))

## 5.0.2

### Patch Changes

- Upgrade @vercel/nft to 0.27.10 ([#12109](https://github.com/vercel/vercel/pull/12109))

- Revert build utils refactor ([#12818](https://github.com/vercel/vercel/pull/12818))

- Update `@remix-run/dev` fork to v2.15.2 ([#12796](https://github.com/vercel/vercel/pull/12796))

## 5.0.1

### Patch Changes

- Refactor build-util usage to reuse detected lockfile ([#12813](https://github.com/vercel/vercel/pull/12813))

## 5.0.0

### Major Changes

- Remove `@remix-run/dev` dev dependency ([#12762](https://github.com/vercel/vercel/pull/12762))

## 4.0.0

### Major Changes

- [remix-builder][node][routing-utils] revert path-to-regexp updates ([#12746](https://github.com/vercel/vercel/pull/12746))

## 3.0.0

### Major Changes

- Bump path-to-regexp from 6.2.1 to 6.3.0 ([#12744](https://github.com/vercel/vercel/pull/12744))

## 2.2.14

### Patch Changes

- Updated dependencies [[`79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521`](https://github.com/vercel/vercel/commit/79fbf1c95f4fa9bfe6af17aa3e13cf18424fc521)]:
  - @vercel/error-utils@2.0.3

## 2.2.13

### Patch Changes

- Update `@remix-run/dev` fork to v2.13.1 ([#12334](https://github.com/vercel/vercel/pull/12334))

## 2.2.12

### Patch Changes

- Fix corepack `packageManager` detection on monorepos ([#12258](https://github.com/vercel/vercel/pull/12258))

## 2.2.11

### Patch Changes

- Revert "[build-utils] Fix corepack `packageManager` detection on monorepos" ([#12242](https://github.com/vercel/vercel/pull/12242))

## 2.2.10

### Patch Changes

- Disable corepack when Turborepo does not support `COREPACK_HOME` ([#12211](https://github.com/vercel/vercel/pull/12211))

- Fix corepack `packageManager` detection on monorepos ([#12219](https://github.com/vercel/vercel/pull/12219))

## 2.2.9

### Patch Changes

- Update `@remix-run/dev` fork to v2.12.0 ([#12124](https://github.com/vercel/vercel/pull/12124))

## 2.2.8

### Patch Changes

- Revert "Revert "Revert "Fix corepack `packageManager` detection on monorepos""" ([#12099](https://github.com/vercel/vercel/pull/12099))

## 2.2.7

### Patch Changes

- Revert "Revert "Fix corepack `packageManager` detection on monorepos"" ([#11871](https://github.com/vercel/vercel/pull/11871))

## 2.2.6

### Patch Changes

- Update `@remix-run/dev` fork to v2.11.2 ([#11968](https://github.com/vercel/vercel/pull/11968))

## 2.2.5

### Patch Changes

- [remix] remove contact note ([#11947](https://github.com/vercel/vercel/pull/11947))

## 2.2.4

### Patch Changes

- Update `@remix-run/dev` fork to v2.11.1 ([#11924](https://github.com/vercel/vercel/pull/11924))

## 2.2.3

### Patch Changes

- Update `@remix-run/dev` fork to v2.11.0 ([#11913](https://github.com/vercel/vercel/pull/11913))

## 2.2.2

### Patch Changes

- Fix POST requests when `unstable_singleFetch` is enabled ([#11904](https://github.com/vercel/vercel/pull/11904))

- Update `@remix-run/dev` fork to v2.10.3 ([#11893](https://github.com/vercel/vercel/pull/11893))

## 2.2.1

### Patch Changes

- Revert "Fix corepack `packageManager` detection on monorepos" ([#11865](https://github.com/vercel/vercel/pull/11865))

## 2.2.0

### Minor Changes

- Use `nativeFetch` mode when `unstable_singleFetch` is enabled ([#11844](https://github.com/vercel/vercel/pull/11844))

### Patch Changes

- Fix corepack `packageManager` detection on monorepos ([#11811](https://github.com/vercel/vercel/pull/11811))

## 2.1.11

### Patch Changes

- Upgrade to @vercel/nft 0.27.3 with a bug fix for browser mapping support ([#11841](https://github.com/vercel/vercel/pull/11841))

## 2.1.10

### Patch Changes

- Update `@remix-run/dev` fork to v2.10.2 ([#11837](https://github.com/vercel/vercel/pull/11837))

## 2.1.9

### Patch Changes

- Update `@remix-run/dev` fork to v2.10.0 ([#11771](https://github.com/vercel/vercel/pull/11771))

## 2.1.8

### Patch Changes

- Add opt-in env var to use native Fetch polyfills ([#11748](https://github.com/vercel/vercel/pull/11748))

## 2.1.7

### Patch Changes

- Upgrade to @vercel/nft 0.27.2 with browser remapping support ([#11700](https://github.com/vercel/vercel/pull/11700))

## 2.1.6

### Patch Changes

- Bump `@vercel/nft@0.27.0` ([#11580](https://github.com/vercel/vercel/pull/11580))

- Update `@remix-run/dev` fork to v2.9.2-patch.2 ([#11582](https://github.com/vercel/vercel/pull/11582))

## 2.1.5

### Patch Changes

- Add `mjs` and `mts` extensions to vite detection ([#11307](https://github.com/vercel/vercel/pull/11307))

## 2.1.4

### Patch Changes

- Disable `prepareCache()` npm install for Remix + Vite ([#11281](https://github.com/vercel/vercel/pull/11281))

## 2.1.3

### Patch Changes

- Improve hueristics for detecting Remix + Vite ([#11256](https://github.com/vercel/vercel/pull/11256))

## 2.1.2

### Patch Changes

- Update `@remix-run/dev` fork to v2.8.1 ([#11241](https://github.com/vercel/vercel/pull/11241))

## 2.1.1

### Patch Changes

- [build-utils] increase max memory limit ([#11209](https://github.com/vercel/vercel/pull/11209))

- Remove usage of `ensureResolvable()` in Vite builds ([#11213](https://github.com/vercel/vercel/pull/11213))

- Update `@remix-run/dev` fork to v2.8.0 ([#11206](https://github.com/vercel/vercel/pull/11206))

- Ensure the symlink directory exists in `ensureSymlink()` ([#11205](https://github.com/vercel/vercel/pull/11205))

## 2.1.0

### Minor Changes

- Remix Vite plugin support ([#11031](https://github.com/vercel/vercel/pull/11031))

## 2.0.20

### Patch Changes

- Don't install Remix fork when not using split configuration ([#11152](https://github.com/vercel/vercel/pull/11152))

- Add `serverBundles` post-build sanity check and fallback ([#11153](https://github.com/vercel/vercel/pull/11153))

- bump `@vercel/nft@0.26.4` ([#11155](https://github.com/vercel/vercel/pull/11155))

- Update `@remix-run/dev` fork to v2.6.0 ([#11162](https://github.com/vercel/vercel/pull/11162))

- Update `@remix-run/dev` fork to v2.7.0 ([#11180](https://github.com/vercel/vercel/pull/11180))

- Update `@remix-run/dev` fork to v2.7.2 ([#11186](https://github.com/vercel/vercel/pull/11186))

## 2.0.19

### Patch Changes

- [node][next][redwood][remix] bump `@vercel/nft@0.26.3` ([#11115](https://github.com/vercel/vercel/pull/11115))

## 2.0.18

### Patch Changes

- Fix functions without a output path edge case ([#11038](https://github.com/vercel/vercel/pull/11038))

- Update `@remix-run/dev` fork to v2.5.0 ([#11054](https://github.com/vercel/vercel/pull/11054))

- Update `@remix-run/dev` fork to v2.5.1 ([#11065](https://github.com/vercel/vercel/pull/11065))

## 2.0.17

### Patch Changes

- Deprecate `EdgeFunction#name` property ([#11010](https://github.com/vercel/vercel/pull/11010))

## 2.0.16

### Patch Changes

- [next][node][redwood][remix] Bump `@vercel/nft@0.26.1` ([#11009](https://github.com/vercel/vercel/pull/11009))

- Update `@remix-run/dev` fork to v2.4.1 ([#10992](https://github.com/vercel/vercel/pull/10992))

## 2.0.15

### Patch Changes

- Update `@remix-run/dev` fork to v2.4.0 ([#10943](https://github.com/vercel/vercel/pull/10943))

## 2.0.14

### Patch Changes

- Reinstall dependencies during `prepareCache()` ([#10922](https://github.com/vercel/vercel/pull/10922))

## 2.0.13

### Patch Changes

- Update `@remix-run/dev` fork to v2.3.1 ([#10908](https://github.com/vercel/vercel/pull/10908))

## 2.0.12

### Patch Changes

- Fix issue where `npm install` was not properly injecting forked compiler ([#10819](https://github.com/vercel/vercel/pull/10819))

- Simplify static directory resolution and apply `publicPath` to routes. ([#10685](https://github.com/vercel/vercel/pull/10685))

## 2.0.11

### Patch Changes

- Update `@remix-run/dev` fork to v2.2.0 ([#10788](https://github.com/vercel/vercel/pull/10788))

## 2.0.10

### Patch Changes

- Update `@remix-run/dev` fork to v2.1.0 ([#10732](https://github.com/vercel/vercel/pull/10732))

## 2.0.9

### Patch Changes

- Revert "[next][node][redwood][remix] Update @vercel/nft (#10540)" ([#10633](https://github.com/vercel/vercel/pull/10633))

- Update `@vercel/nft` to 0.24.2 ([#10644](https://github.com/vercel/vercel/pull/10644))

## 2.0.8

### Patch Changes

- Update `@remix-run/dev` fork to v2.0.1 ([#10566](https://github.com/vercel/vercel/pull/10566))

## 2.0.7

### Patch Changes

- Update `@vercel/nft` to v0.24.1. ([#10540](https://github.com/vercel/vercel/pull/10540))

## 2.0.6

### Patch Changes

- Fix ESM mode for Edge runtime ([#10530](https://github.com/vercel/vercel/pull/10530))

- Update `@remix-run/dev` fork to v2.0.0 ([#10526](https://github.com/vercel/vercel/pull/10526))

- Fixes for Remix v2 ([#10525](https://github.com/vercel/vercel/pull/10525))

## 2.0.5

### Patch Changes

- Fix usage with `bun install` ([#10489](https://github.com/vercel/vercel/pull/10489))

## 2.0.4

### Patch Changes

- Use `build-builder.mjs` script to bundle, and remove types and source maps ([#10479](https://github.com/vercel/vercel/pull/10479))

## 2.0.3

### Patch Changes

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

- Updated dependencies [[`5609a1187`](https://github.com/vercel/vercel/commit/5609a1187be9d6cf8d5f16825690c5ea72f17dc5), [`1b4de4a98`](https://github.com/vercel/vercel/commit/1b4de4a986f7a612aac834ebae3ec7bb9e9b8cf8)]:
  - @vercel/build-utils@7.1.1

## 2.0.2

### Patch Changes

- Updated dependencies [[`9e3827c78`](https://github.com/vercel/vercel/commit/9e3827c785e1bc45f2bed421132167381481770f)]:
  - @vercel/build-utils@7.1.0

## 2.0.1

### Patch Changes

- Update `@remix-run/dev` fork to v1.19.3 ([#10381](https://github.com/vercel/vercel/pull/10381))

## 2.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Patch Changes

- Only add workspace check flag for Yarn v1 ([#10364](https://github.com/vercel/vercel/pull/10364))

- Updated dependencies [[`37f5c6270`](https://github.com/vercel/vercel/commit/37f5c6270058336072ca733673ea72dd6c56bd6a)]:
  - @vercel/build-utils@7.0.0
  - @vercel/static-config@3.0.0

## 1.10.1

### Patch Changes

- Set default env vars for Hydrogen v2 deployments ([#10341](https://github.com/vercel/vercel/pull/10341))

## 1.10.0

### Minor Changes

- Add initial support for Hydrogen v2 ([#10305](https://github.com/vercel/vercel/pull/10305))

### Patch Changes

- Update `@remix-run/dev` fork to v1.19.2 ([#10299](https://github.com/vercel/vercel/pull/10299))

- Updated dependencies [[`a8ecf40d6`](https://github.com/vercel/vercel/commit/a8ecf40d6f50e2fc8b13b02c8ef50b3dcafad3a6)]:
  - @vercel/build-utils@6.8.3

## 1.9.1

### Patch Changes

- Disable root workspace check in pnpm and yarn when adding deps ([#10291](https://github.com/vercel/vercel/pull/10291))

## 1.9.0

### Minor Changes

- Install `@vercel/remix-run-dev` at build-time instead of using symlink ([#9784](https://github.com/vercel/vercel/pull/9784))

### Patch Changes

- Update `@remix-run/dev` fork to v1.19.1 ([#10246](https://github.com/vercel/vercel/pull/10246))

## 1.8.18

### Patch Changes

- Create ensured dependency symlink at the `start` directory, instead of root of repo ([#10224](https://github.com/vercel/vercel/pull/10224))

## 1.8.17

### Patch Changes

- Updated dependencies [[`0750517af`](https://github.com/vercel/vercel/commit/0750517af99aea41410d4f1f772ce427699554e7)]:
  - @vercel/build-utils@6.8.2

## 1.8.16

### Patch Changes

- Update `@remix-run/dev` fork to v1.18.1 ([#10180](https://github.com/vercel/vercel/pull/10180))

- Updated dependencies [[`7021279b2`](https://github.com/vercel/vercel/commit/7021279b284f314a4d1bdbb4306b4c22291efa08)]:
  - @vercel/build-utils@6.8.1

## 1.8.15

### Patch Changes

- Update `@remix-run/dev` fork to v1.18.0 ([#10146](https://github.com/vercel/vercel/pull/10146))

- Updated dependencies [[`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c)]:
  - @vercel/build-utils@6.8.0

## 1.8.14

### Patch Changes

- Link to `https://vercel.com/help` ([#10106](https://github.com/vercel/vercel/pull/10106))

## 1.8.13

### Patch Changes

- Update `@remix-run/dev` fork to v1.17.0 ([#10072](https://github.com/vercel/vercel/pull/10072))

## 1.8.12

### Patch Changes

- Updated dependencies [[`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb)]:
  - @vercel/build-utils@6.7.5

## 1.8.11

### Patch Changes

- Updated dependencies [[`c7bcea408`](https://github.com/vercel/vercel/commit/c7bcea408131df2d65338e50ce319a6d8e4a8a82)]:
  - @vercel/build-utils@6.7.4

## 1.8.10

### Patch Changes

- Updated dependencies [[`71b9f3a94`](https://github.com/vercel/vercel/commit/71b9f3a94b7922607f8f24bf7b2bd1742e62cc05)]:
  - @vercel/build-utils@6.7.3

## 1.8.9

### Patch Changes

- Upgrade `@remix-run/dev` fork to v1.16.1 ([#9971](https://github.com/vercel/vercel/pull/9971))

## 1.8.8

### Patch Changes

- Upgrade `@remix-run/dev` to v1.16.0-patch.1 to fix erroneous "not found in your node_modules" warning ([#9930](https://github.com/vercel/vercel/pull/9930))
