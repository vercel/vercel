# @vercel/next

## 4.13.0

### Minor Changes

- Let global error handlers handle errors that next.js passes up to the function runtime rather than directly exiting the process ([#13981](https://github.com/vercel/vercel/pull/13981))

## 4.12.6

### Patch Changes

- Add diagnostics for .next/trace-turbopack and .next/trace-build ([#13961](https://github.com/vercel/vercel/pull/13961))

- Fix segment route suffix capture in dynamic routes to ensure .segments/.+\.segment\.rsc routes are properly rewritten ([#13927](https://github.com/vercel/vercel/pull/13927))

## 4.12.5

### Patch Changes

- Add support for .well-known directory in next API route ([#13923](https://github.com/vercel/vercel/pull/13923))

- Fix \_next/data middleware resolving without header ([#13924](https://github.com/vercel/vercel/pull/13924))

## 4.12.4

### Patch Changes

- Skip adding rewrite headers when the destination has no rewritten pathname or query (and when external origin is not allowed). This prevents generating an empty `rewrite.headers` object that fails schema validation and restores previous behavior for external or no-op rewrites. ([#13844](https://github.com/vercel/vercel/pull/13844))

## 4.12.3

### Patch Changes

- Add emitting supportsCancellation ([#13841](https://github.com/vercel/vercel/pull/13841))

## 4.12.2

### Patch Changes

- Optimize segment prerender with blank allowQuery for client parsing ([#13838](https://github.com/vercel/vercel/pull/13838))

  When client segment cache, parsing, and PPR are enabled, use empty allowQuery for segment prerenders since segments don't vary based on route parameters. This ensures both RSC and segment prerenders are in the same group and revalidated together, improving cache efficiency.

## 4.12.1

### Patch Changes

- [next][node][redwood][remix] bump `@vercel/nft@0.30.1` ([#13818](https://github.com/vercel/vercel/pull/13818))

## 4.12.0

### Minor Changes

- Add client param parsing support with experimental flag ([#13740](https://github.com/vercel/vercel/pull/13740))

### Patch Changes

- Add clientParamParsingOrigins configuration for secure external rewrite headers ([#13799](https://github.com/vercel/vercel/pull/13799))

## 4.11.3

### Patch Changes

- Handle building for app router without internal pages entries ([#13704](https://github.com/vercel/vercel/pull/13704))

- Add action metadata routes ([#13775](https://github.com/vercel/vercel/pull/13775))

## 4.11.2

### Patch Changes

- Return plain text 404 for `/_next/static/` paths instead of HTML to prevent SEO issues. ([#12906](https://github.com/vercel/vercel/pull/12906))

## 4.11.1

### Patch Changes

- Handle generated function config ([#13720](https://github.com/vercel/vercel/pull/13720))

## 4.11.0

### Minor Changes

- Improve fallback root params handling with hasFallbackRootParams flag ([#13653](https://github.com/vercel/vercel/pull/13653))

  - Add hasFallbackRootParams flag to RoutesManifestRoute type for simplified route regex generation
  - Update route handling logic to conditionally apply fallback root params processing
  - Enhance prerender manifest structure with fallback root params support

## 4.10.11

### Patch Changes

- fix routing issue when clientSegmentCache is enabled ([#13625](https://github.com/vercel/vercel/pull/13625))

## 4.10.10

### Patch Changes

- Ensure RSC headers have exact value '1' for proper routing and prefetch handling consistency ([#13644](https://github.com/vercel/vercel/pull/13644))

- fix erroneous source file warning when using dynamic not-found ([#13641](https://github.com/vercel/vercel/pull/13641))

## 4.10.9

### Patch Changes

- Only route prefetches to a static file if the prefetch header value is '1' ([#13547](https://github.com/vercel/vercel/pull/13547))

## 4.10.8

### Patch Changes

- Reduce segment routes ([#13602](https://github.com/vercel/vercel/pull/13602))

## 4.10.7

### Patch Changes

- Correct node middleware require path ([#13603](https://github.com/vercel/vercel/pull/13603))

## 4.10.6

### Patch Changes

- Fix applying sourcePage mapping for lambdas ([#13599](https://github.com/vercel/vercel/pull/13599))

## 4.10.5

### Patch Changes

- Add cacheComponents support for getRequestHandlerWithMetadata export ([#13595](https://github.com/vercel/vercel/pull/13595))

## 4.10.4

### Patch Changes

- Add support for experimental.cacheComponents in PPR detection ([#13585](https://github.com/vercel/vercel/pull/13585))

  Enables the experimental.cacheComponents configuration option to activate PPR (Partial Pre-Rendering) alongside existing ppr configuration options (true and 'incremental').

## 4.10.3

### Patch Changes

- Fix node middleware with hoisted distDir ([#13584](https://github.com/vercel/vercel/pull/13584))

- Fix case for \_next/data for i18n-basepath-middleware ([#13572](https://github.com/vercel/vercel/pull/13572))

## 4.10.2

### Patch Changes

- Added support for partial routes defining a source page by adding lambdas for these routes ([#13574](https://github.com/vercel/vercel/pull/13574))

## 4.10.1

### Patch Changes

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 4.10.0

### Minor Changes

- Adds support for user configured `preferredRegion` for Node.js Functions ([#13546](https://github.com/vercel/vercel/pull/13546))

## 4.9.5

### Patch Changes

- simplify experimental triggers ([#13527](https://github.com/vercel/vercel/pull/13527))

## 4.9.4

### Patch Changes

- Update more handling for experimentalTriggers ([#13517](https://github.com/vercel/vercel/pull/13517))

## 4.9.3

### Patch Changes

- Add CloudEventTrigger support for Lambda functions ([#13503](https://github.com/vercel/vercel/pull/13503))

## 4.9.2

### Patch Changes

- Added support for the Resume Data Cache (RDC) for React Server Component (RSC) requests ([#13459](https://github.com/vercel/vercel/pull/13459))

## 4.9.1

### Patch Changes

- Ensure we await node middleware import for top-level await ([#13479](https://github.com/vercel/vercel/pull/13479))

## 4.9.0

### Minor Changes

- make the output of collectTracedFiles deterministic ([#13410](https://github.com/vercel/vercel/pull/13410))

## 4.8.0

### Minor Changes

- Allow configuring functions `architecture` via the `vercel.json` configuration ([#13344](https://github.com/vercel/vercel/pull/13344))

### Patch Changes

- reinstate Vary header ([#13359](https://github.com/vercel/vercel/pull/13359))

## 4.7.11

### Patch Changes

- Bump @vercel/nft to latest ([#13312](https://github.com/vercel/vercel/pull/13312))

## 4.7.10

### Patch Changes

- Add .next/turbopack file into diagnostics output ([#13293](https://github.com/vercel/vercel/pull/13293))

## 4.7.9

### Patch Changes

- Support blocking static shells by not loading a fallback when none is present. Also updated the allowQuery logic to support this case. ([#13272](https://github.com/vercel/vercel/pull/13272))

- Fix segment prefetching for PPR-disabled static routes ([#13275](https://github.com/vercel/vercel/pull/13275))

## 4.7.8

### Patch Changes

- Added support for more specific route keys for prefetch segments ([#13262](https://github.com/vercel/vercel/pull/13262))

## 4.7.7

### Patch Changes

- Fix for rewrite headers that ensures that we don't check post-non rewrite operations (like adding headers). ([#13229](https://github.com/vercel/vercel/pull/13229))

- [next] ensure app router 404 page is still included in functions when using pages i18n ([#13222](https://github.com/vercel/vercel/pull/13222))

- [next] improve error message for "No Next.js version" ([#13239](https://github.com/vercel/vercel/pull/13239))

## 4.7.6

### Patch Changes

- Support fallback blocking routes to provide a fallback root params configuration ([#13215](https://github.com/vercel/vercel/pull/13215))

## 4.7.5

### Patch Changes

- Make prerender groups deterministic for client segment caches ([#13205](https://github.com/vercel/vercel/pull/13205))

## 4.7.4

### Patch Changes

- bug: do not emit vary header in next.js >=13.4.6 ([#13011](https://github.com/vercel/vercel/pull/13011))

## 4.7.3

### Patch Changes

- Add support for expire values in Next.js prerender manifest ([#13087](https://github.com/vercel/vercel/pull/13087))

- Add pnpm 10 detection to next metrics ([#13121](https://github.com/vercel/vercel/pull/13121))

## 4.7.2

### Patch Changes

- Ensure we lookup middleware function config properly ([#13107](https://github.com/vercel/vercel/pull/13107))

## 4.7.1

### Patch Changes

- Add node middleware handling ([#13028](https://github.com/vercel/vercel/pull/13028))

## 4.7.0

### Minor Changes

- Detect v9 pnpm lock files as pnpm 10 for new projects ([#13072](https://github.com/vercel/vercel/pull/13072))

## 4.6.2

### Patch Changes

- Handle patterns in rewrite destinations correctly ([#13052](https://github.com/vercel/vercel/pull/13052))

## 4.6.1

### Patch Changes

- Fix duplicate trace names generated from builders ([#13051](https://github.com/vercel/vercel/pull/13051))

## 4.6.0

### Minor Changes

- Support process tracing ([#12894](https://github.com/vercel/vercel/pull/12894))

### Patch Changes

- Fixed bug where rewrites would be applied twice in some cases ([#13040](https://github.com/vercel/vercel/pull/13040))

- pin fixtures and set up auto updates ([#12979](https://github.com/vercel/vercel/pull/12979))

## 4.5.2

### Patch Changes

- Added new prefetch segments feature for Next.js ([#12897](https://github.com/vercel/vercel/pull/12897))

## 4.5.1

### Patch Changes

- ensure non-locale prefixed route variants come after more specific ones ([#13003](https://github.com/vercel/vercel/pull/13003))

## 4.5.0

### Minor Changes

- Add .yarn/cache to build cache ([#12961](https://github.com/vercel/vercel/pull/12961))

## 4.4.5

### Patch Changes

- Add test case for locale false rewrite ([#12959](https://github.com/vercel/vercel/pull/12959))

## 4.4.4

### Patch Changes

- flag behavior to defer defaultLocale rewrite ([#12941](https://github.com/vercel/vercel/pull/12941))

## 4.4.3

### Patch Changes

- ensure defaultLocale rewrite doesn't conflict with user-defined redirects ([#12916](https://github.com/vercel/vercel/pull/12916))

- Added headers for user-supplied rewrites ([#12847](https://github.com/vercel/vercel/pull/12847))

## 4.4.2

### Patch Changes

- Upgrade @vercel/nft to 0.27.10 ([#12109](https://github.com/vercel/vercel/pull/12109))

- Revert build utils refactor ([#12818](https://github.com/vercel/vercel/pull/12818))

- Fix bug where when page doesn't postpone it still generates a correct fallback ([#12811](https://github.com/vercel/vercel/pull/12811))

## 4.4.1

### Patch Changes

- Added root params support for pages powered by partial prerendering ([#12813](https://github.com/vercel/vercel/pull/12813))

- Fix next data route replacing ([#12813](https://github.com/vercel/vercel/pull/12813))

- Refactor build-util usage to reuse detected lockfile ([#12813](https://github.com/vercel/vercel/pull/12813))

- add support for `images.qualities` ([#12813](https://github.com/vercel/vercel/pull/12813))

## 4.4.0

### Minor Changes

- Provide `waitUntil` via `@next/request-context` ([#12286](https://github.com/vercel/vercel/pull/12286))

## 4.3.21

### Patch Changes

- Revert "Fix edge cases with internal redirect sorting" ([#12615](https://github.com/vercel/vercel/pull/12615))

## 4.3.20

### Patch Changes

- Fix edge cases with internal redirect sorting ([#12599](https://github.com/vercel/vercel/pull/12599))

## 4.3.19

### Patch Changes

- Fix basePath root matching for error pages ([#12559](https://github.com/vercel/vercel/pull/12559))

- Stabilize Chained Prerenders ([#12507](https://github.com/vercel/vercel/pull/12507))

## 4.3.18

### Patch Changes

- Support allowHeader from Next.js for filtering request headers during revalidation ([#12420](https://github.com/vercel/vercel/pull/12420))

## 4.3.17

### Patch Changes

- Fix caching issue with prerenders while Partial Prerendering is enabled ([#12325](https://github.com/vercel/vercel/pull/12325))

- Revert disabling generation of route shells ([#12323](https://github.com/vercel/vercel/pull/12323))

## 4.3.16

### Patch Changes

- Partial Prerendering Fallback Shells now respect the revalidate config and now do not produce route shells on-demand. ([#12268](https://github.com/vercel/vercel/pull/12268))

- Ensure app-paths-manifest is filtered properly ([#12284](https://github.com/vercel/vercel/pull/12284))

## 4.3.15

### Patch Changes

- Fix corepack `packageManager` detection on monorepos ([#12258](https://github.com/vercel/vercel/pull/12258))

## 4.3.14

### Patch Changes

- Revert "[build-utils] Fix corepack `packageManager` detection on monorepos" ([#12242](https://github.com/vercel/vercel/pull/12242))

## 4.3.13

### Patch Changes

- Disable corepack when Turborepo does not support `COREPACK_HOME` ([#12211](https://github.com/vercel/vercel/pull/12211))

- Fix corepack `packageManager` detection on monorepos ([#12219](https://github.com/vercel/vercel/pull/12219))

## 4.3.12

### Patch Changes

- add support for `images.localPatterns` ([#12195](https://github.com/vercel/vercel/pull/12195))

## 4.3.11

### Patch Changes

- Introduce new chain configuration for Partial Prerendering ([#12117](https://github.com/vercel/vercel/pull/12117))

- fix defaultLocale redirect when using domains pattern ([#12166](https://github.com/vercel/vercel/pull/12166))

## 4.3.10

### Patch Changes

- Revert "Revert "Revert "Fix corepack `packageManager` detection on monorepos""" ([#12099](https://github.com/vercel/vercel/pull/12099))

## 4.3.9

### Patch Changes

- Revert "Revert "Fix corepack `packageManager` detection on monorepos"" ([#11871](https://github.com/vercel/vercel/pull/11871))

## 4.3.8

### Patch Changes

- Combine Partial Prerendering lambdas for revalidation and dynamic resumes. ([#12064](https://github.com/vercel/vercel/pull/12064))

- Added support for Partial Fallback Prerendering ([#12036](https://github.com/vercel/vercel/pull/12036))

## 4.3.7

### Patch Changes

- remove experimental .action output handling ([#11998](https://github.com/vercel/vercel/pull/11998))

## 4.3.6

### Patch Changes

- Revert "Fix corepack `packageManager` detection on monorepos" ([#11865](https://github.com/vercel/vercel/pull/11865))

## 4.3.5

### Patch Changes

- Make app route prerender filter dynamic route specific ([#11863](https://github.com/vercel/vercel/pull/11863))

## 4.3.4

### Patch Changes

- Fix missing app route with mixed SSR/SSG dynamic route ([#11862](https://github.com/vercel/vercel/pull/11862))

- Fix corepack `packageManager` detection on monorepos ([#11811](https://github.com/vercel/vercel/pull/11811))

## 4.3.3

### Patch Changes

- fix glob path for next.js diagnostics ([#11859](https://github.com/vercel/vercel/pull/11859))

- Upgrade to @vercel/nft 0.27.3 with a bug fix for browser mapping support ([#11841](https://github.com/vercel/vercel/pull/11841))

## 4.3.2

### Patch Changes

- Ensure we do not include ending slash in matched path ([#11830](https://github.com/vercel/vercel/pull/11830))

## 4.3.1

### Patch Changes

- Bump fs-extra ([#11809](https://github.com/vercel/vercel/pull/11809))

- don't skip creation of `.rsc` outputs for route handlers ([#11808](https://github.com/vercel/vercel/pull/11808))

- Fix re-tracing app router entries ([#11812](https://github.com/vercel/vercel/pull/11812))

- Add build callback handling ([#11807](https://github.com/vercel/vercel/pull/11807))

- Log when tracing in builder instead of next build ([#11810](https://github.com/vercel/vercel/pull/11810))

- Fix route handlers operation type ([#11800](https://github.com/vercel/vercel/pull/11800))

## 4.3.0

### Minor Changes

- Adds the ability for builders to define a `diagnostics` step that is called after the build operation is done. ([#11653](https://github.com/vercel/vercel/pull/11653))
  Implements the diagnostics step in the `next` builder.

## 4.2.18

### Patch Changes

- Allow app router prerender functions to use streaming ([#11745](https://github.com/vercel/vercel/pull/11745))

- Add experimental preload flag ([#11753](https://github.com/vercel/vercel/pull/11753))

## 4.2.17

### Patch Changes

- Ensure all prerenders have matching .action output ([#11719](https://github.com/vercel/vercel/pull/11719))

## 4.2.16

### Patch Changes

- prevent /index from being incorrectly normalized in rewrites ([#11707](https://github.com/vercel/vercel/pull/11707))

- Upgrade to @vercel/nft 0.27.2 with browser remapping support ([#11700](https://github.com/vercel/vercel/pull/11700))

- ensure unmatched rsc rewrites are routed to correct handler ([#11688](https://github.com/vercel/vercel/pull/11688))

## 4.2.15

### Patch Changes

- ensure unmatched action rewrites are routed to correct handler ([#11686](https://github.com/vercel/vercel/pull/11686))

- Adds a route for the `.rsc` pathname as well when app has ppr enabled but not all routes. ([#11681](https://github.com/vercel/vercel/pull/11681))

## 4.2.14

### Patch Changes

- Don't create streaming lambdas for pages router routes ([#11660](https://github.com/vercel/vercel/pull/11660))

- Ensure user rewrites still match to action outputs ([#11628](https://github.com/vercel/vercel/pull/11628))

## 4.2.13

### Patch Changes

- Fix static case for detecting when a page supports PPR ([#11635](https://github.com/vercel/vercel/pull/11635))

- Fix related to erroring when a prefetch route is not provided but the route is PPR enabled ([#11638](https://github.com/vercel/vercel/pull/11638))

## 4.2.12

### Patch Changes

- Support incremental PPR for large applications ([#11625](https://github.com/vercel/vercel/pull/11625))

## 4.2.11

### Patch Changes

- normalize source file locations for special metadata files ([#11579](https://github.com/vercel/vercel/pull/11579))

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
