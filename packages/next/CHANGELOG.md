# @vercel/next

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
