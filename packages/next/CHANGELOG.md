# @vercel/next

## 4.2.10

### Patch Changes

- skip action rewrites for RSC requests ([#11576](https://github.com/vercel/vercel/pull/11576))

- Bump `@vercel/nft@0.27.0` ([#11580](https://github.com/vercel/vercel/pull/11580))

## 4.2.9

### Patch Changes

- Support incremental partial prerendering ([#11560](https://github.com/vercel/vercel/pull/11560))

- ensure `.action` outputs are created for edge functions ([#11568](https://github.com/vercel/vercel/pull/11568))

- ([#11566](https://github.com/vercel/vercel/pull/11566))

## 4.2.8

### Patch Changes

- Fix missing initial RSC headers ([#11552](https://github.com/vercel/vercel/pull/11552))

- Remove .prefetch.rsc rewrites for non-PPR ([#11540](https://github.com/vercel/vercel/pull/11540))

- [next] rename middleware manifest env ([#11549](https://github.com/vercel/vercel/pull/11549))

## 4.2.7

### Patch Changes

- Fix missing .rsc outputs for pages prerenders ([#11503](https://github.com/vercel/vercel/pull/11503))

- Fix base path app index RSC handling ([#11528](https://github.com/vercel/vercel/pull/11528))

- Fix interception routes PPR route handling ([#11527](https://github.com/vercel/vercel/pull/11527))

## 4.2.6

### Patch Changes

- [next] Update test fixture version ([#11514](https://github.com/vercel/vercel/pull/11514))

## 4.2.5

### Patch Changes

- Only rewrite next-action requests to `.action` handlers ([#11504](https://github.com/vercel/vercel/pull/11504))

## 4.2.4

### Patch Changes

- [next]: Revert .action handling for dynamic routes ([#11509](https://github.com/vercel/vercel/pull/11509))

## 4.2.3

### Patch Changes

- [next] Reland add .action handling for dynamic routes ([#11487](https://github.com/vercel/vercel/pull/11487))

## 4.2.2

### Patch Changes

- [next] revert .action rewrites ([#11470](https://github.com/vercel/vercel/pull/11470))

- Next.js builds: support sectioned source maps ([#11453](https://github.com/vercel/vercel/pull/11453))

## 4.2.1

### Patch Changes

- [next] add streaming prerender group for actions ([#11454](https://github.com/vercel/vercel/pull/11454))

- [next] Ensure \_not-found is included properly in app router functions ([#11441](https://github.com/vercel/vercel/pull/11441))

- [next] add .action handling for dynamic routes ([#11461](https://github.com/vercel/vercel/pull/11461))

- [next] Remove un-necessary compressed function size calc/constraint ([#11442](https://github.com/vercel/vercel/pull/11442))

## 4.2.0

### Minor Changes

- Add support for edge function environment variables ([#11390](https://github.com/vercel/vercel/pull/11390))

## 4.1.6

### Patch Changes

- Ensure that static PPR pages have static streaming lambda paths. ([#11259](https://github.com/vercel/vercel/pull/11259))

## 4.1.5

### Patch Changes

- Rename variants to flags and remove legacy flags ([#11121](https://github.com/vercel/vercel/pull/11121))

## 4.1.4

### Patch Changes

- Enable partial prerendering support for pre-generated pages ([#11183](https://github.com/vercel/vercel/pull/11183))

## 4.1.3

### Patch Changes

- Fix manifest with experimental flag ([#11192](https://github.com/vercel/vercel/pull/11192))

## 4.1.2

### Patch Changes

- Update experimental bundle flag ([#11187](https://github.com/vercel/vercel/pull/11187))

- [next] Add flag for experimental grouping ([#11177](https://github.com/vercel/vercel/pull/11177))

- bump `@vercel/nft@0.26.4` ([#11155](https://github.com/vercel/vercel/pull/11155))

- fix: missing experimental field ([#11184](https://github.com/vercel/vercel/pull/11184))

## 4.1.1

### Patch Changes

- [node][next][redwood][remix] bump `@vercel/nft@0.26.3` ([#11115](https://github.com/vercel/vercel/pull/11115))

- Load common chunks on module initialization ([#11126](https://github.com/vercel/vercel/pull/11126))

- Fix index normalizing for app outputs ([#11099](https://github.com/vercel/vercel/pull/11099))

- Mark `flags` as deprecated and replace them with `variants` ([#11098](https://github.com/vercel/vercel/pull/11098))

- Fix rewrite RSC handling with trailingSlash ([#11107](https://github.com/vercel/vercel/pull/11107))

## 4.1.0

### Minor Changes

- fix error when @vercel/analytics is a transitive dependency of the deployed application ([#10892](https://github.com/vercel/vercel/pull/10892))

### Patch Changes

- Use `worker.name` instead of edge function name to fix type error in `@vercel/next` ([#11050](https://github.com/vercel/vercel/pull/11050))

## 4.0.17

### Patch Changes

- Ensure rewrites handle RSC requests ([#11005](https://github.com/vercel/vercel/pull/11005))

- [next][node][redwood][remix] Bump `@vercel/nft@0.26.1` ([#11009](https://github.com/vercel/vercel/pull/11009))

## 4.0.16

### Patch Changes

- Entries in the `prerender-manifest.json` without a `dataRoute` but with a `prefetchDataRoute` will be treated as an App Page. App Route's that do not have ([#10978](https://github.com/vercel/vercel/pull/10978))
  a body will not cause a build error.

## 4.0.15

### Patch Changes

- ensure function configs work for paths inside of route groups ([#10855](https://github.com/vercel/vercel/pull/10855))

## 4.0.14

### Patch Changes

- Fixed headers for static routes when PPR is enabled ([#10808](https://github.com/vercel/vercel/pull/10808))

## 4.0.13

### Patch Changes

- Added `getRequestHandlerWithMetadata` export ([#10753](https://github.com/vercel/vercel/pull/10753))

## 4.0.12

### Patch Changes

- fix re-mapping logic for index prefetches ([#10750](https://github.com/vercel/vercel/pull/10750))

- Fixes a case where using `basePath` along with static generation would output a lambda that conflicts with the root route. ([#10738](https://github.com/vercel/vercel/pull/10738))

- Rework prefetch route handling ([#10779](https://github.com/vercel/vercel/pull/10779))

## 4.0.11

### Patch Changes

- fix `build` in appDir on Windows ([#10708](https://github.com/vercel/vercel/pull/10708))

- Fix RSC prefetch for index route with catch-all ([#10734](https://github.com/vercel/vercel/pull/10734))

## 4.0.10

### Patch Changes

- Revert "[next] Correct output file tracing and limit calculation (#10631)" ([#10651](https://github.com/vercel/vercel/pull/10651))

- next: bump minimal version for bundled server usage ([#10646](https://github.com/vercel/vercel/pull/10646))

## 4.0.9

### Patch Changes

- Correct output file tracing and limit calculation ([#10631](https://github.com/vercel/vercel/pull/10631))

- Fix the instrumentation hook on Next.js Edge Functions ([#10608](https://github.com/vercel/vercel/pull/10608))

- [next] fix lambda creation for i18n edge pages ([#10630](https://github.com/vercel/vercel/pull/10630))

- Revert "[next][node][redwood][remix] Update @vercel/nft (#10540)" ([#10633](https://github.com/vercel/vercel/pull/10633))

- Update `@vercel/nft` to 0.24.2 ([#10644](https://github.com/vercel/vercel/pull/10644))

## 4.0.8

### Patch Changes

- Fix edge case for setting `__NEXT_PRIVATE_PREBUNDLED_REACT` ([#10568](https://github.com/vercel/vercel/pull/10568))

## 4.0.7

### Patch Changes

- Internal variants ([#10549](https://github.com/vercel/vercel/pull/10549))

- Update `@vercel/nft` to v0.24.1. ([#10540](https://github.com/vercel/vercel/pull/10540))

- Build package using "esbuild" ([#10482](https://github.com/vercel/vercel/pull/10482))

## 4.0.6

### Patch Changes

- Fix feature flag detection ([#10531](https://github.com/vercel/vercel/pull/10531))

## 4.0.5

### Patch Changes

- missed a prerender for experimentalBypassFor ([#10504](https://github.com/vercel/vercel/pull/10504))

## 4.0.4

### Patch Changes

- provide `experimentalBypassFor` to Prerender from manifest ([#10497](https://github.com/vercel/vercel/pull/10497))

- next.js: move app route handlers in their own lambda grouping, add flag to use bundled runtime ([#10485](https://github.com/vercel/vercel/pull/10485))

## 4.0.3

### Patch Changes

- fix content-type for RSC prefetches ([#10487](https://github.com/vercel/vercel/pull/10487))

## 4.0.2

### Patch Changes

- Fix Next.js with `basePath` + Edge runtime + App Router on a top level `page.jsx` ([#10465](https://github.com/vercel/vercel/pull/10465))

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

- Fix RSC rewrite behavior ([#10415](https://github.com/vercel/vercel/pull/10415))

- fix ENOENT on /404.html when `fallback: false` w/ `basePath` ([#10473](https://github.com/vercel/vercel/pull/10473))

- fix 404 enoent for i18n ([#10416](https://github.com/vercel/vercel/pull/10416))

## 4.0.1

### Patch Changes

- fix RSC matching behavior & 404 status code on `fallback: false` ([#10388](https://github.com/vercel/vercel/pull/10388))

- Add handling to leverage RSC prefetch outputs ([#10390](https://github.com/vercel/vercel/pull/10390))

## 4.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

## 3.9.4

### Patch Changes

- Preserve sourceMappingURL comments in template literals ([#10275](https://github.com/vercel/vercel/pull/10275))

## 3.9.3

### Patch Changes

- fix dynamic not found pages ([#10262](https://github.com/vercel/vercel/pull/10262))

## 3.9.2

### Patch Changes

- Fix pages/404 gsp + i18n case ([#10258](https://github.com/vercel/vercel/pull/10258))

## 3.9.1

### Patch Changes

- Fix pages and app router i18n handling ([#10243](https://github.com/vercel/vercel/pull/10243))

## 3.9.0

### Minor Changes

- Support maxDuration in Next.js deployments ([#10069](https://github.com/vercel/vercel/pull/10069))

### Patch Changes

- Fix 404 page in edge runtime ([#10223](https://github.com/vercel/vercel/pull/10223))

## 3.8.8

### Patch Changes

- [next] Ensure RSC paths handle basePath ([#10155](https://github.com/vercel/vercel/pull/10155))

## 3.8.7

### Patch Changes

- [next] Update payload flag ([#10147](https://github.com/vercel/vercel/pull/10147))

- Use `getNodeBinPaths()` function to improve monorepo support ([#10150](https://github.com/vercel/vercel/pull/10150))

## 3.8.6

### Patch Changes

- [next] Fix `functions` config with App Router ([#9889](https://github.com/vercel/vercel/pull/9889))

- [next] Pass `pageExtensions` data to `apiLambdaGroups` ([#10015](https://github.com/vercel/vercel/pull/10015))

- Revert "[next] Update rsc content-type test fixtures" ([#10040](https://github.com/vercel/vercel/pull/10040))

- Remove usage of `env` from Edge Functions and Middleware ([#10018](https://github.com/vercel/vercel/pull/10018))

## 3.8.5

### Patch Changes

- [next] Ensure app functions are detected/separated properly ([#9989](https://github.com/vercel/vercel/pull/9989))

## 3.8.4

### Patch Changes

- Update handling for react prebundled flag ([#9974](https://github.com/vercel/vercel/pull/9974))

## 3.8.3

### Patch Changes

- Ensure un-necessary rsc routes are not added ([#9963](https://github.com/vercel/vercel/pull/9963))
