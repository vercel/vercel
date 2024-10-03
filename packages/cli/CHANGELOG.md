# vercel

## 37.6.1

### Patch Changes

- Add a command for enabling and disabling telemetry. Telemetry collection is not currently enabled and when it is, will be a major version bump for the CLI. ([#12207](https://github.com/vercel/vercel/pull/12207))

- [cli] Remove incorrect `--json` flag on `vercel alias` ([#12198](https://github.com/vercel/vercel/pull/12198))

- Standardize most error output through `output.error` ([#12012](https://github.com/vercel/vercel/pull/12012))

- Replace `psl` with `tldts` for domain parsing ([#12174](https://github.com/vercel/vercel/pull/12174))

- add support for `images.localPatterns` ([#12195](https://github.com/vercel/vercel/pull/12195))

- [cli] add telemetry tracking to `alias ls` ([#12194](https://github.com/vercel/vercel/pull/12194))

- Add support for tracking Continuous Integration vendors with telemetry ([#12180](https://github.com/vercel/vercel/pull/12180))

- Add session id to events ([#12179](https://github.com/vercel/vercel/pull/12179))

- Updated dependencies [[`5431ffd5de6a572f247e63f737576b4a04884f7b`](https://github.com/vercel/vercel/commit/5431ffd5de6a572f247e63f737576b4a04884f7b)]:
  - @vercel/build-utils@8.4.6
  - @vercel/next@4.3.12
  - @vercel/node@3.2.18
  - @vercel/static-build@2.5.28

## 37.6.0

### Minor Changes

- [cli] remove `textInput` in favor of `input.text` ([#12168](https://github.com/vercel/vercel/pull/12168))

- Add stub telemetry behavior in preparation for use tracking ([#12173](https://github.com/vercel/vercel/pull/12173))

### Patch Changes

- Introduce new chain configuration for Partial Prerendering ([#12117](https://github.com/vercel/vercel/pull/12117))

- [cli] correctly call to create new deployment when promoting preview deployment ([#12178](https://github.com/vercel/vercel/pull/12178))

- Updated dependencies [[`42ae831561365b8254e62cf57f41caca03af4c31`](https://github.com/vercel/vercel/commit/42ae831561365b8254e62cf57f41caca03af4c31), [`62f434a79fe25009e63fcaefda0abe283c590f58`](https://github.com/vercel/vercel/commit/62f434a79fe25009e63fcaefda0abe283c590f58), [`37ec6fa7f5ff313bfdb22570fb33f8b7eff280e6`](https://github.com/vercel/vercel/commit/37ec6fa7f5ff313bfdb22570fb33f8b7eff280e6)]:
  - @vercel/next@4.3.11
  - @vercel/build-utils@8.4.5
  - @vercel/node@3.2.17
  - @vercel/static-build@2.5.27

## 37.5.4

### Patch Changes

- Change error printing to use standard Output methods ([#12010](https://github.com/vercel/vercel/pull/12010))

- Updated dependencies [[`2dab096e952c25521bac2537039ed7ca15675095`](https://github.com/vercel/vercel/commit/2dab096e952c25521bac2537039ed7ca15675095)]:
  - @vercel/build-utils@8.4.4
  - @vercel/node@3.2.16
  - @vercel/static-build@2.5.26

## 37.5.3

### Patch Changes

- Updated dependencies [[`f1904566e5c24919425fc2b6c8c84f25f3478e74`](https://github.com/vercel/vercel/commit/f1904566e5c24919425fc2b6c8c84f25f3478e74)]:
  - @vercel/build-utils@8.4.3
  - @vercel/node@3.2.15
  - @vercel/static-build@2.5.25

## 37.5.2

### Patch Changes

- [cli] Add note about epipebomb ([#12144](https://github.com/vercel/vercel/pull/12144))

## 37.5.1

### Patch Changes

- Updated dependencies [[`f396f72b6bab0acf45522d25ee08c9899afdad40`](https://github.com/vercel/vercel/commit/f396f72b6bab0acf45522d25ee08c9899afdad40)]:
  - @vercel/go@3.1.3

## 37.5.0

### Minor Changes

- Support installing products from Vercel Marketplace via `vc install` ([#12127](https://github.com/vercel/vercel/pull/12127))

### Patch Changes

- [logs] tiny idomatic fixup ([#12094](https://github.com/vercel/vercel/pull/12094))

- [cli] refactor getSubcommand to return original user input ([#12137](https://github.com/vercel/vercel/pull/12137))

- Updated dependencies [[`67839368e71f27c93ca9aa664810ef64de4d4d9c`](https://github.com/vercel/vercel/commit/67839368e71f27c93ca9aa664810ef64de4d4d9c)]:
  - @vercel/remix-builder@2.2.9

## 37.4.2

### Patch Changes

- Updated dependencies [[`8e90f4156`](https://github.com/vercel/vercel/commit/8e90f415663226411ee6f294e30331a95806e53e)]:
  - @vercel/build-utils@8.4.2
  - @vercel/hydrogen@1.0.6
  - @vercel/next@4.3.10
  - @vercel/redwood@2.1.5
  - @vercel/remix-builder@2.2.8
  - @vercel/static-build@2.5.24
  - @vercel/node@3.2.14

## 37.4.1

### Patch Changes

- Fix gitBranch parameter for `vc env add` command ([#12085](https://github.com/vercel/vercel/pull/12085))

- Updated dependencies [[`04e15410f`](https://github.com/vercel/vercel/commit/04e15410f09453c528c133d1432fd8b183c5097c)]:
  - @vercel/build-utils@8.4.1
  - @vercel/hydrogen@1.0.5
  - @vercel/next@4.3.9
  - @vercel/redwood@2.1.4
  - @vercel/remix-builder@2.2.7
  - @vercel/static-build@2.5.23
  - @vercel/node@3.2.13

## 37.4.0

### Minor Changes

- introduce using level to highlight build logs ([#12044](https://github.com/vercel/vercel/pull/12044))

### Patch Changes

- Combine Partial Prerendering lambdas for revalidation and dynamic resumes. ([#12064](https://github.com/vercel/vercel/pull/12064))

- Added support for Partial Fallback Prerendering ([#12036](https://github.com/vercel/vercel/pull/12036))

- Updated dependencies [[`b3540096a`](https://github.com/vercel/vercel/commit/b3540096a39dd8b24b250aa5ad808c8445b5f484), [`49c95b77a`](https://github.com/vercel/vercel/commit/49c95b77a2cea23c6f98c5e084dbe35d081b40bc), [`e7016f9b0`](https://github.com/vercel/vercel/commit/e7016f9b033e88a33a89bf90ae655069f687c72f)]:
  - @vercel/next@4.3.8
  - @vercel/build-utils@8.4.0
  - @vercel/node@3.2.12
  - @vercel/static-build@2.5.22

## 37.3.0

### Minor Changes

- Support custom environments in `vc env rm` ([#12009](https://github.com/vercel/vercel/pull/12009))

### Patch Changes

- Add error for `vc deploy --env` with no value ([#12002](https://github.com/vercel/vercel/pull/12002))

- Updated dependencies [[`40b7ee0d2`](https://github.com/vercel/vercel/commit/40b7ee0d297c212961279639d9c73d4fed2312f8), [`5ab983009`](https://github.com/vercel/vercel/commit/5ab98300958538fac5e154034eacd9267a79dc26), [`78a3be23e`](https://github.com/vercel/vercel/commit/78a3be23edff1e59a09a75a8adc2013a5a53fb1d)]:
  - @vercel/build-utils@8.3.9
  - @vercel/go@3.1.2
  - @vercel/node@3.2.11
  - @vercel/static-build@2.5.21

## 37.2.1

### Patch Changes

- Fixes integration not found error when using `vercel install` ([#12035](https://github.com/vercel/vercel/pull/12035))

## 37.2.0

### Minor Changes

- Add `vc install` and `vc integration add` commands ([#12033](https://github.com/vercel/vercel/pull/12033))

### Patch Changes

- [cli] Remove existing metrics gathering behavior ([#12026](https://github.com/vercel/vercel/pull/12026))

- Remove redundant formatting on a few lines of output ([#12011](https://github.com/vercel/vercel/pull/12011))

- Updated dependencies [[`06337ed0b`](https://github.com/vercel/vercel/commit/06337ed0bb1ab4becd1554642c162c75bdcc91c2), [`2fc9e6d81`](https://github.com/vercel/vercel/commit/2fc9e6d8104a3d6308873ef8dafa27c32f0b97be)]:
  - @vercel/build-utils@8.3.8
  - @vercel/node@3.2.10
  - @vercel/static-build@2.5.20

## 37.1.2

### Patch Changes

- Fix incorrect type for certs challenge-only flag ([#12018](https://github.com/vercel/vercel/pull/12018))

- [vc help] add build command to help/--help ([#12016](https://github.com/vercel/vercel/pull/12016))

## 37.1.1

### Patch Changes

- Updated dependencies [[`c6d469595`](https://github.com/vercel/vercel/commit/c6d469595372d53398c3f2eb35b644a22c56e4f6), [`49aaea41f`](https://github.com/vercel/vercel/commit/49aaea41f1501dec6aa262f04368df5e0c1475b6)]:
  - @vercel/build-utils@8.3.7
  - @vercel/next@4.3.7
  - @vercel/node@3.2.9
  - @vercel/static-build@2.5.19

## 37.1.0

### Minor Changes

- Support Custom Environments in `vercel env add [target]` ([#11994](https://github.com/vercel/vercel/pull/11994))

## 37.0.0

### Major Changes

- Refactor / modernize the `vercel list` command ([#11956](https://github.com/vercel/vercel/pull/11956))

### Minor Changes

- Print the custom environment name in `vc list` ([#11965](https://github.com/vercel/vercel/pull/11965))

- Allow filtering in `vc env ls` with custom environment ([#11984](https://github.com/vercel/vercel/pull/11984))

- Display Deployment Retention Policies in vc ls [project] ([#11676](https://github.com/vercel/vercel/pull/11676))

### Patch Changes

- Prefactor middleware tests to make changes easier ([#11934](https://github.com/vercel/vercel/pull/11934))

- Updated dependencies [[`763db23a3`](https://github.com/vercel/vercel/commit/763db23a3acf1c290f0d45c2501a2c924cbd609d)]:
  - @vercel/remix-builder@2.2.6

## 36.0.0

### Major Changes

- Remove defunct `secrets` command ([#11659](https://github.com/vercel/vercel/pull/11659))

### Patch Changes

- Updated dependencies [[`5680ff988`](https://github.com/vercel/vercel/commit/5680ff98801dec47152f21534ddc15bab6d6ddd7)]:
  - @vercel/remix-builder@2.2.5

## 35.2.4

### Patch Changes

- Some subcommand flags now show correct short flag in help ([#11931](https://github.com/vercel/vercel/pull/11931))

- Display custom environments in `vc env ls` ([#11912](https://github.com/vercel/vercel/pull/11912))

- [cli] alias `dev` pnpm command as `vc` and `vercel` as well ([#11933](https://github.com/vercel/vercel/pull/11933))

- Updated dependencies [[`d77d0919b`](https://github.com/vercel/vercel/commit/d77d0919b45eb3e8d27a9b75c0994727c926ccb0)]:
  - @vercel/remix-builder@2.2.4

## 35.2.3

### Patch Changes

- Updated dependencies [[`bec80e76a`](https://github.com/vercel/vercel/commit/bec80e76afe546072d4138f3ed3d6eda56d3f370), [`680a3af28`](https://github.com/vercel/vercel/commit/680a3af28e5d6caf51aa56f80fe77ad1091cd542)]:
  - @vercel/build-utils@8.3.6
  - @vercel/remix-builder@2.2.3
  - @vercel/node@3.2.8
  - @vercel/static-build@2.5.18

## 35.2.2

### Patch Changes

- Fix issue where builder output was treating an api endpoint as a frontend route ([#11907](https://github.com/vercel/vercel/pull/11907))

- Updated dependencies [[`0efb4795c`](https://github.com/vercel/vercel/commit/0efb4795cb06edf2561b69d7e2512b8e0cf912ca), [`5d1965832`](https://github.com/vercel/vercel/commit/5d1965832f02595c91409b4e7d863725669e6ccb)]:
  - @vercel/remix-builder@2.2.2

## 35.2.1

### Patch Changes

- Allow custom environments in `vc pull --environment` ([#11897](https://github.com/vercel/vercel/pull/11897))

- `vc target` now prompts to link projects ([#11895](https://github.com/vercel/vercel/pull/11895))

- Updated dependencies [[`6c2398713`](https://github.com/vercel/vercel/commit/6c2398713cd7ea2f1511d56ce1c5120d9f8e3a98)]:
  - @vercel/python@4.3.1

## 35.2.0

### Minor Changes

- Apply framework "defaultRoutes" in `vc build` ([#11889](https://github.com/vercel/vercel/pull/11889))

### Patch Changes

- fix(cli): wrong log line colors for deploy and inspect commands ([#11891](https://github.com/vercel/vercel/pull/11891))

- Standardize target parsing between commands ([#11890](https://github.com/vercel/vercel/pull/11890))

## 35.1.0

### Minor Changes

- Add target flag to vc build ([#11858](https://github.com/vercel/vercel/pull/11858))

### Patch Changes

- Better error message when calling logs command without a deployment url ([#11877](https://github.com/vercel/vercel/pull/11877))

- Updated dependencies [[`9d9b2fee6`](https://github.com/vercel/vercel/commit/9d9b2fee64b5638a313366ccb3eb2e0b337b4750)]:
  - @vercel/build-utils@8.3.5
  - @vercel/node@3.2.7
  - @vercel/static-build@2.5.17

## 35.0.3

### Patch Changes

- Updated dependencies [[`ae2bdab65`](https://github.com/vercel/vercel/commit/ae2bdab6544d76687785b40eded0a40e3ea477ff)]:
  - @vercel/build-utils@8.3.4
  - @vercel/hydrogen@1.0.4
  - @vercel/next@4.3.6
  - @vercel/redwood@2.1.3
  - @vercel/remix-builder@2.2.1
  - @vercel/static-build@2.5.16
  - @vercel/node@3.2.6

## 35.0.2

### Patch Changes

- Updated dependencies [[`a95c4c43a`](https://github.com/vercel/vercel/commit/a95c4c43a660386e5fd4921851e952438fa84b0a)]:
  - @vercel/next@4.3.5

## 35.0.1

### Patch Changes

- Updated dependencies [[`cfaa83cc9`](https://github.com/vercel/vercel/commit/cfaa83cc9059c598ff3ff8e7f081b483a3ead715), [`db8452770`](https://github.com/vercel/vercel/commit/db8452770e81da216dfd66270473264160ea96d5), [`9290c57b8`](https://github.com/vercel/vercel/commit/9290c57b83cc45a428e4ce96dd4402f97ec7f821)]:
  - @vercel/next@4.3.4
  - @vercel/remix-builder@2.2.0
  - @vercel/static-build@2.5.15
  - @vercel/build-utils@8.3.3
  - @vercel/hydrogen@1.0.3
  - @vercel/redwood@2.1.2
  - @vercel/node@3.2.5

## 35.0.0

### Major Changes

- [breaking] `vc logs` now returns runtime logs. Use `vc inspect --logs` and `vc deploy --logs` to get build logs ([#11788](https://github.com/vercel/vercel/pull/11788))

### Patch Changes

- Add download of diagnostics ([#11859](https://github.com/vercel/vercel/pull/11859))

- Updated dependencies [[`4c892f040`](https://github.com/vercel/vercel/commit/4c892f04014cf7b7bc662740296cae93fa93a3df), [`11e22746a`](https://github.com/vercel/vercel/commit/11e22746a54a3a17d860bfe32b7a9e885bd8e925)]:
  - @vercel/next@4.3.3
  - @vercel/redwood@2.1.1
  - @vercel/remix-builder@2.1.11
  - @vercel/node@3.2.4

## 34.4.0

### Minor Changes

- Add target output to `vc inspect` ([#11821](https://github.com/vercel/vercel/pull/11821))

- Send `customEnvironmentSlugOrId` to the create deployment endpoint ([#11789](https://github.com/vercel/vercel/pull/11789))

- Add `vc target ls` command ([#11790](https://github.com/vercel/vercel/pull/11790))

### Patch Changes

- Various improvements to vc target ls ([#11840](https://github.com/vercel/vercel/pull/11840))

- Updated dependencies [[`3eb40c8c2`](https://github.com/vercel/vercel/commit/3eb40c8c2d205ff3c237774eb0b63135c9298d5d), [`d0fe663af`](https://github.com/vercel/vercel/commit/d0fe663afc9c1a699f4195f0e8c97982f47193cf), [`b1e4a4011`](https://github.com/vercel/vercel/commit/b1e4a401102c94742d3b347875313d387d9a57b9), [`55ab52512`](https://github.com/vercel/vercel/commit/55ab52512c1966369fcd9ac60114356c8dfc0271)]:
  - @vercel/build-utils@8.3.2
  - @vercel/static-build@2.5.14
  - @vercel/next@4.3.2
  - @vercel/remix-builder@2.1.10
  - @vercel/node@3.2.3

## 34.3.1

### Patch Changes

- Updated dependencies [[`07a12706e`](https://github.com/vercel/vercel/commit/07a12706ebb7fd0599884f62d89ef97e33c7232f), [`3c9876e3d`](https://github.com/vercel/vercel/commit/3c9876e3d92fdbc2ad403eef0cb3469070ce0ecf), [`c7e339397`](https://github.com/vercel/vercel/commit/c7e33939725a6c9c155956a24245121a1416ddb8), [`fc82c3dac`](https://github.com/vercel/vercel/commit/fc82c3dac762c38ee74d6586c9bfe2f402b3fe57), [`21bf60218`](https://github.com/vercel/vercel/commit/21bf60218eee553ce60e6239fdc116505e2add55), [`9c5362b3d`](https://github.com/vercel/vercel/commit/9c5362b3d4ad29dcd56f0e7b6c31d02bf6a3f6f3)]:
  - @vercel/next@4.3.1
  - @vercel/build-utils@8.3.1
  - @vercel/node@3.2.2
  - @vercel/static-build@2.5.13

## 34.3.0

### Minor Changes

- introduce --logs flag for deploy and inspect command to display build logs ([#11672](https://github.com/vercel/vercel/pull/11672))

- Adds the ability for builders to define a `diagnostics` step that is called after the build operation is done. ([#11653](https://github.com/vercel/vercel/pull/11653))
  Implements the diagnostics step in the `next` builder.

### Patch Changes

- Updated dependencies [[`394eddb2a`](https://github.com/vercel/vercel/commit/394eddb2a9f4d9096315fe53f8d27a5401900e5f), [`b9d18c583`](https://github.com/vercel/vercel/commit/b9d18c5835ff16316fafb854eb6447df9c841b98), [`77836e3c3`](https://github.com/vercel/vercel/commit/77836e3c33837a7c85957733cad5c433e86aa8a2), [`11d0a32d8`](https://github.com/vercel/vercel/commit/11d0a32d854948e2df24c48ab6afdf5255d50632)]:
  - @vercel/build-utils@8.3.0
  - @vercel/next@4.3.0
  - @vercel/remix-builder@2.1.9
  - @vercel/redwood@2.1.0
  - @vercel/node@3.2.1
  - @vercel/static-build@2.5.12

## 34.2.8

### Patch Changes

- Updated dependencies [[`fd069f184`](https://github.com/vercel/vercel/commit/fd069f184d94a41cfcc427e8249418e122a4bf71), [`8ae40d096`](https://github.com/vercel/vercel/commit/8ae40d096eac5667a9d6b75fbb3f34565c841f90), [`f0d6acaa0`](https://github.com/vercel/vercel/commit/f0d6acaa03f20b47dbaf9ff501d009e02901db86), [`e33756494`](https://github.com/vercel/vercel/commit/e337564941a13ea9d2b3a1646e9f5a570ab0c7c5), [`dcb7fa5f9`](https://github.com/vercel/vercel/commit/dcb7fa5f9ca7f2acc913f5cc2c775425f2d7a580)]:
  - @vercel/node@3.2.0
  - @vercel/next@4.2.18
  - @vercel/remix-builder@2.1.8

## 34.2.7

### Patch Changes

- Updated dependencies [[`84b744541`](https://github.com/vercel/vercel/commit/84b744541b58524bd91e3b3f0628b675e772660f)]:
  - @vercel/next@4.2.17

## 34.2.6

### Patch Changes

- [built-utils] Handle case of not having lockfile when corepack is enabled ([#11697](https://github.com/vercel/vercel/pull/11697))

- Updated dependencies [[`5c12ed695`](https://github.com/vercel/vercel/commit/5c12ed69500ceff6a9dc544eab0acd7af64c044a), [`21444a38e`](https://github.com/vercel/vercel/commit/21444a38e50ed680c91b0e3955f15e378eeda64b), [`fa9789a93`](https://github.com/vercel/vercel/commit/fa9789a93ebe64c4246f441590cb695d296af336), [`c925dc4a1`](https://github.com/vercel/vercel/commit/c925dc4a1bf3a47b684b5f7fd788ddd24ba1ed1e), [`06d2d860e`](https://github.com/vercel/vercel/commit/06d2d860e47aed792247bf929805b180ed6e2dab), [`b735f37fd`](https://github.com/vercel/vercel/commit/b735f37fd92c707040e72084b0fdb4f8fd01dd51)]:
  - @vercel/build-utils@8.2.2
  - @vercel/next@4.2.16
  - @vercel/redwood@2.0.10
  - @vercel/remix-builder@2.1.7
  - @vercel/node@3.1.7
  - @vercel/static-build@2.5.11

## 34.2.5

### Patch Changes

- Adds a route for the `.rsc` pathname as well when app has ppr enabled but not all routes. ([#11681](https://github.com/vercel/vercel/pull/11681))

- Updated dependencies [[`7457767a7`](https://github.com/vercel/vercel/commit/7457767a77b03662c103a658273a46cf78359068), [`4337ea065`](https://github.com/vercel/vercel/commit/4337ea0654c4ee2c91c4464540f879d43da6696f)]:
  - @vercel/next@4.2.15

## 34.2.4

### Patch Changes

- Updated dependencies [[`3eb9d8c89`](https://github.com/vercel/vercel/commit/3eb9d8c8929592960d88e0395e2a2443f7304d6b), [`83741a0eb`](https://github.com/vercel/vercel/commit/83741a0eb9e44457b083e8790a11eb89984e6357)]:
  - @vercel/python@4.3.0
  - @vercel/build-utils@8.2.1
  - @vercel/node@3.1.6
  - @vercel/static-build@2.5.10

## 34.2.3

### Patch Changes

- Don't create streaming lambdas for pages router routes ([#11660](https://github.com/vercel/vercel/pull/11660))

- Updated dependencies [[`c9d53d4e3`](https://github.com/vercel/vercel/commit/c9d53d4e3e4591b9b6bde86100564c9ee4c6d1d4), [`5f561f8cf`](https://github.com/vercel/vercel/commit/5f561f8cfa4720801a5cf4598f193ab34539abb9)]:
  - @vercel/next@4.2.14

## 34.2.2

### Patch Changes

- Fix related to erroring when a prefetch route is not provided but the route is PPR enabled ([#11638](https://github.com/vercel/vercel/pull/11638))

- Updated dependencies [[`8e44ef5b9`](https://github.com/vercel/vercel/commit/8e44ef5b9d2cdbe743c7f1e3534f182465fed9bf), [`61e6af374`](https://github.com/vercel/vercel/commit/61e6af3740296c11015d0c3da84ee205020b0ea6)]:
  - @vercel/next@4.2.13

## 34.2.1

### Patch Changes

- Support incremental PPR for large applications ([#11625](https://github.com/vercel/vercel/pull/11625))

- Updated dependencies [[`73e558913`](https://github.com/vercel/vercel/commit/73e558913ab30ba097d7536a12fa8a7c967479f0)]:
  - @vercel/next@4.2.12

## 34.2.0

### Minor Changes

- Stop sending system environment variables in dev ([#11526](https://github.com/vercel/vercel/pull/11526))

### Patch Changes

- Updated dependencies [[`d3c1267e2`](https://github.com/vercel/vercel/commit/d3c1267e24082789ea6382cf6af81dd40df288ff), [`ccd7eb1fb`](https://github.com/vercel/vercel/commit/ccd7eb1fb78f7ac9effdbe1935de3bda82c97fe3)]:
  - @vercel/build-utils@8.2.0
  - @vercel/node@3.1.5
  - @vercel/static-build@2.5.9

## 34.1.14

### Patch Changes

- Updated dependencies [[`ad6945435`](https://github.com/vercel/vercel/commit/ad69454352b519b2b0ed326f245c779530554bf2)]:
  - @vercel/build-utils@8.1.3
  - @vercel/node@3.1.4
  - @vercel/static-build@2.5.8

## 34.1.13

### Patch Changes

- Updated dependencies [[`1682ad43d`](https://github.com/vercel/vercel/commit/1682ad43d0064b22b1248a7e946746b838f00076)]:
  - @vercel/build-utils@8.1.2
  - @vercel/node@3.1.3
  - @vercel/static-build@2.5.7

## 34.1.12

### Patch Changes

- Updated dependencies [[`67afc2608`](https://github.com/vercel/vercel/commit/67afc26085e2ebdaa33a8cbce112afec4cb1c4f5), [`2f7a6ed5f`](https://github.com/vercel/vercel/commit/2f7a6ed5f92d454000f92247d3b6548e2064f4e6)]:
  - @vercel/next@4.2.11
  - @vercel/build-utils@8.1.1
  - @vercel/node@3.1.2
  - @vercel/static-build@2.5.6

## 34.1.11

### Patch Changes

- Updated dependencies [[`5014b1e82`](https://github.com/vercel/vercel/commit/5014b1e82a46181baeb727ffe6d14000b6a4b1d7), [`18d1703d5`](https://github.com/vercel/vercel/commit/18d1703d5b4f2adc61fd56011f874c393fa57d0d), [`e87d4c14d`](https://github.com/vercel/vercel/commit/e87d4c14d0e718281f9ba91c9ec1cc6e142d383d), [`bc5fd4115`](https://github.com/vercel/vercel/commit/bc5fd41158ec9f36e5db1fe749589adcbaec6950)]:
  - @vercel/build-utils@8.1.0
  - @vercel/next@4.2.10
  - @vercel/redwood@2.0.9
  - @vercel/remix-builder@2.1.6
  - @vercel/node@3.1.1
  - @vercel/static-build@2.5.5

## 34.1.10

### Patch Changes

- Updated dependencies [[`119f80e96`](https://github.com/vercel/vercel/commit/119f80e9611a7a5a755aa689502dcdab323194aa), [`11584b0e9`](https://github.com/vercel/vercel/commit/11584b0e9b55f312f34d0d6467ab498e472ac9df), [`3023122d4`](https://github.com/vercel/vercel/commit/3023122d4e0dd292340d9e9e61ef232baf6e610d), [`0e774b6be`](https://github.com/vercel/vercel/commit/0e774b6be0c832213a64124e1f4fc6d150e87d9f)]:
  - @vercel/next@4.2.9
  - @vercel/static-build@2.5.4

## 34.1.9

### Patch Changes

- Updated dependencies [[`5a532a5b9`](https://github.com/vercel/vercel/commit/5a532a5b948994ba04783ac560357eed9f94a3f3), [`50fc27ba5`](https://github.com/vercel/vercel/commit/50fc27ba5773870956300bbbaffbe387d549bc12), [`c1d852295`](https://github.com/vercel/vercel/commit/c1d85229509dd319a1f11beb940a759113564d33), [`a5ea04154`](https://github.com/vercel/vercel/commit/a5ea04154ba26ee4e635d8953aa4f0d9d82d3a96)]:
  - @vercel/next@4.2.8
  - @vercel/node@3.1.0

## 34.1.8

### Patch Changes

- Updated dependencies [[`52e435aa5`](https://github.com/vercel/vercel/commit/52e435aa5d7b4014d19477969ad5cbfbe94aa76f), [`124846a3e`](https://github.com/vercel/vercel/commit/124846a3e65a3bf1ae82327fd4ba2b132674fb39), [`dc974b679`](https://github.com/vercel/vercel/commit/dc974b6797de0b6e90373c92e1f2bbdafcfc6687), [`58c6755e0`](https://github.com/vercel/vercel/commit/58c6755e0c12cae2ce55978b7bf8722133151196)]:
  - @vercel/next@4.2.7
  - @vercel/static-build@2.5.3

## 34.1.7

### Patch Changes

- Updated dependencies [[`3420ba015`](https://github.com/vercel/vercel/commit/3420ba0153dcabffef7114ba2361fb0f3c43a7b3)]:
  - @vercel/next@4.2.6

## 34.1.6

### Patch Changes

- Updated dependencies [[`b1adaf76e`](https://github.com/vercel/vercel/commit/b1adaf76ec17d1bbfe30a2bf65405bd886fa9bcf), [`3fb97d1d2`](https://github.com/vercel/vercel/commit/3fb97d1d270e835ce34a687bd234ea53dfe446a2)]:
  - @vercel/next@4.2.5
  - @vercel/static-build@2.5.2

## 34.1.5

### Patch Changes

- Updated dependencies [[`763a6d107`](https://github.com/vercel/vercel/commit/763a6d10709ca40405634d41863c2e524917ebe1), [`15475c8a2`](https://github.com/vercel/vercel/commit/15475c8a2c303a1dd189ba24044fac750280dd2e), [`21f5e7375`](https://github.com/vercel/vercel/commit/21f5e7375e4cb4ceed98ab56486d09a85fa3894d)]:
  - @vercel/ruby@2.1.0
  - @vercel/build-utils@8.0.0
  - @vercel/node@3.0.28
  - @vercel/static-build@2.5.1

## 34.1.4

### Patch Changes

- Updated dependencies [[`5b7960337`](https://github.com/vercel/vercel/commit/5b79603378a50fd04d5be1c3a3e5cd605b61478f)]:
  - @vercel/next@4.2.4

## 34.1.3

### Patch Changes

- Updated dependencies [[`5758838d0`](https://github.com/vercel/vercel/commit/5758838d090b9789ca6821e1122781352021109f)]:
  - @vercel/next@4.2.3

## 34.1.2

### Patch Changes

- Updated dependencies [[`64bd6dd05`](https://github.com/vercel/vercel/commit/64bd6dd0578d82f210b942b88baaa0673218d8b0), [`532885148`](https://github.com/vercel/vercel/commit/532885148b583700df5a120350c620af6ad34cd7), [`adcfc365a`](https://github.com/vercel/vercel/commit/adcfc365a7d375d7a70d434669e4472031693489)]:
  - @vercel/next@4.2.2
  - @vercel/python@4.2.0

## 34.1.1

### Patch Changes

- Updated dependencies [[`f4c181a2c`](https://github.com/vercel/vercel/commit/f4c181a2c26b11afadf78e68baf1246a27240755), [`2826563ff`](https://github.com/vercel/vercel/commit/2826563ffab7ab01d3c85def2cad8c4041cd88b1)]:
  - @vercel/static-build@2.5.0
  - @vercel/build-utils@7.12.0
  - @vercel/node@3.0.27

## 34.1.0

### Minor Changes

- Don't propagate legacy env VERCEL_ANALYTICS_ID if @vercel/speed-insights package is detected ([#11305](https://github.com/vercel/vercel/pull/11305))

### Patch Changes

- Replace console.log that communicates to user with client.output methods ([#11353](https://github.com/vercel/vercel/pull/11353))

- [cli] Do not pipe git stderr to user during successful `vc dev` run ([#11450](https://github.com/vercel/vercel/pull/11450))

- fix: Sort default team to the top of the selection list ([#11451](https://github.com/vercel/vercel/pull/11451))

- Updated dependencies [[`993a60ef7`](https://github.com/vercel/vercel/commit/993a60ef71d137955052255066bfc096e53630a1), [`949d84ad1`](https://github.com/vercel/vercel/commit/949d84ad1cdcd4f9ea44f8a165a193a488cb1a31), [`5bb96ea07`](https://github.com/vercel/vercel/commit/5bb96ea07289e7db66d28d08b372cf949f3d7e88), [`fd8031874`](https://github.com/vercel/vercel/commit/fd8031874300552b877329ec3f0798ec6706b630)]:
  - @vercel/next@4.2.1

## 34.0.0

### Major Changes

- Disables promotion of preview deployments ([#11411](https://github.com/vercel/vercel/pull/11411))

### Patch Changes

- Always set `projectSettings.nodeVersion` in `vc deploy` ([#11351](https://github.com/vercel/vercel/pull/11351))

- [cli] optional override of existing environment variables with --force ([#11348](https://github.com/vercel/vercel/pull/11348))

## 33.7.1

### Patch Changes

- fix flickering during interactive UI rerendering ([#11392](https://github.com/vercel/vercel/pull/11392))

- fix `vc ls` message to be `vc projects ls` ([#11400](https://github.com/vercel/vercel/pull/11400))

- Updated dependencies [[`2461b571a`](https://github.com/vercel/vercel/commit/2461b571af037fbfdf92299a272010a5a8f4898b)]:
  - @vercel/next@4.2.0

## 33.7.0

### Minor Changes

- improve UX for text input validation ([#11388](https://github.com/vercel/vercel/pull/11388))

- Replace the implementation of the yes/no prompt in several areas to be consistent with the rest of the CLI. ([#11279](https://github.com/vercel/vercel/pull/11279))

### Patch Changes

- [cli] Fix how we determine the GIT_CONFIG_PATH to support git worktrees and git submodules ([#11283](https://github.com/vercel/vercel/pull/11283))

- avoid printing errors when user does ctrl+c ([#11377](https://github.com/vercel/vercel/pull/11377))

- Warn that promoting preview deploys is deprecated ([#11376](https://github.com/vercel/vercel/pull/11376))

- Updated dependencies [[`a3fb7e6ab`](https://github.com/vercel/vercel/commit/a3fb7e6abe9bb619a653850decd739728b1af225)]:
  - @vercel/go@3.1.1

## 33.6.3

### Patch Changes

- Handle `--repo` linked in `vc deploy --prebuilt` ([#11309](https://github.com/vercel/vercel/pull/11309))

- Revert "[cli] extract `isZeroConfigBuild` into utility function (#11316)" ([#11350](https://github.com/vercel/vercel/pull/11350))

- Replace `inquirer` with `@inquirer/prompts` ([#11321](https://github.com/vercel/vercel/pull/11321))

- Updated dependencies [[`73b112b1f`](https://github.com/vercel/vercel/commit/73b112b1f74480e1bb941e1b754105fc7dace401), [`346e665bb`](https://github.com/vercel/vercel/commit/346e665bb021e6034bc70c82ef336485622595fe), [`73b112b1f`](https://github.com/vercel/vercel/commit/73b112b1f74480e1bb941e1b754105fc7dace401), [`548afd371`](https://github.com/vercel/vercel/commit/548afd371aa7a9dd3a7f4c60f7f94a7084d8023e)]:
  - @vercel/go@3.1.0
  - @vercel/node@3.0.26
  - @vercel/build-utils@7.11.0
  - @vercel/static-build@2.4.6

## 33.6.2

### Patch Changes

- Added sunset warning to secrets command. ([#11333](https://github.com/vercel/vercel/pull/11333))

- Swap jest for vitest in CLI unit tests ([#11302](https://github.com/vercel/vercel/pull/11302))

- Updated dependencies [[`988f7b75a`](https://github.com/vercel/vercel/commit/988f7b75a27387e84fce541b844f984d2c151980), [`1825b58df`](https://github.com/vercel/vercel/commit/1825b58df8d783e79f0addf262618f422246f4b3)]:
  - @vercel/remix-builder@2.1.5
  - @vercel/build-utils@7.10.0
  - @vercel/node@3.0.25
  - @vercel/static-build@2.4.5

## 33.6.1

### Patch Changes

- Don't send `projectSettings.nodeVersion` for unsupported versions ([#11277](https://github.com/vercel/vercel/pull/11277))

- Updated dependencies [[`4bca0c6d0`](https://github.com/vercel/vercel/commit/4bca0c6d0bc25052b95bd02b12a0b891c86c4b49), [`a67ad4b5a`](https://github.com/vercel/vercel/commit/a67ad4b5a130bf0e56e18111b3f9ddad69cec0e1), [`11218a179`](https://github.com/vercel/vercel/commit/11218a179870a5420c5a6ff720cd4aec4f7e1c5e), [`64b97bf4b`](https://github.com/vercel/vercel/commit/64b97bf4b5203ecf9a95f63ce26a5c3360208966)]:
  - @vercel/next@4.1.6
  - @vercel/remix-builder@2.1.4
  - @vercel/build-utils@7.9.1
  - @vercel/static-build@2.4.4
  - @vercel/node@3.0.24

## 33.6.0

### Minor Changes

- Set `projectSettings.nodeVersion` in `vc deploy` based on "engines.node" field ([#11261](https://github.com/vercel/vercel/pull/11261))

### Patch Changes

- Stops warning about legacy Speed Insights for Next.js apps ([#11268](https://github.com/vercel/vercel/pull/11268))

- Fix framework version detection in monorepos ([#11212](https://github.com/vercel/vercel/pull/11212))

- Updated dependencies [[`8ea93839c`](https://github.com/vercel/vercel/commit/8ea93839ccc70816f3ece9d7cfdb857aa7a4b015), [`58ef91bfe`](https://github.com/vercel/vercel/commit/58ef91bfe8c2e7176e8783cc4eb91ee8580c70dc)]:
  - @vercel/build-utils@7.9.0
  - @vercel/remix-builder@2.1.3
  - @vercel/node@3.0.23
  - @vercel/static-build@2.4.3

## 33.5.5

### Patch Changes

- Rename variants to flags and remove legacy flags ([#11121](https://github.com/vercel/vercel/pull/11121))

- fix vc with root dir issues ([#11243](https://github.com/vercel/vercel/pull/11243))

- Updated dependencies [[`908e7837d`](https://github.com/vercel/vercel/commit/908e7837d55bc02e708f402c700e00208415e954), [`5e3656ec1`](https://github.com/vercel/vercel/commit/5e3656ec1b3f0561091636582715ba09ddd8cb2d), [`a53d1b0d3`](https://github.com/vercel/vercel/commit/a53d1b0d38efa9637f8b8f81a70898add87530e3)]:
  - @vercel/build-utils@7.8.0
  - @vercel/next@4.1.5
  - @vercel/remix-builder@2.1.2
  - @vercel/node@3.0.22
  - @vercel/static-build@2.4.2

## 33.5.4

### Patch Changes

- [build-utils] increase max memory limit ([#11209](https://github.com/vercel/vercel/pull/11209))

- Updated dependencies [[`b1d8b83ab`](https://github.com/vercel/vercel/commit/b1d8b83abbf23a3485aedb490992d0a3bf44573f), [`37b193c84`](https://github.com/vercel/vercel/commit/37b193c845d8b63d93bb0017fbc1a6a35306ef1f), [`20237d4f7`](https://github.com/vercel/vercel/commit/20237d4f7b55b0697b57db15636c11204cb0dc39), [`f8fab639b`](https://github.com/vercel/vercel/commit/f8fab639bf49a60389b8d0b7b265a737c17b4ae1), [`6ed0fe6fb`](https://github.com/vercel/vercel/commit/6ed0fe6fb1e487545a790ff5b9fc691cf625f005)]:
  - @vercel/next@4.1.4
  - @vercel/build-utils@7.7.1
  - @vercel/remix-builder@2.1.1
  - @vercel/static-build@2.4.1
  - @vercel/node@3.0.21

## 33.5.3

### Patch Changes

- Updated dependencies [[`c2d99855e`](https://github.com/vercel/vercel/commit/c2d99855ea6132380434ed29643120680f95fad7), [`1333071a3`](https://github.com/vercel/vercel/commit/1333071a3a2d324679327bfdd4e872f8fd3521c6)]:
  - @vercel/next@4.1.3
  - @vercel/remix-builder@2.1.0

## 33.5.2

### Patch Changes

- Updated dependencies [[`e109e3325`](https://github.com/vercel/vercel/commit/e109e3325ab5299da0903034175fabe72d486a4e), [`d17abf463`](https://github.com/vercel/vercel/commit/d17abf463acabf9e1e43b91200f18efd34e91f62), [`644721a90`](https://github.com/vercel/vercel/commit/644721a90da8cf98414d272be9da0a821a2ce217), [`ea0e9aeae`](https://github.com/vercel/vercel/commit/ea0e9aeaec8ddddb5a726be0d252df9cdbd84808), [`e318a0eea`](https://github.com/vercel/vercel/commit/e318a0eea55c9b8536b0874f66cfd03aca6f0adf), [`1fee87e76`](https://github.com/vercel/vercel/commit/1fee87e76f18d2f5e5524247cfce615fa1832e49), [`bfc01fd98`](https://github.com/vercel/vercel/commit/bfc01fd98f760a008d0d2e6c52b5216503b44b75), [`7910f2f30`](https://github.com/vercel/vercel/commit/7910f2f3070ff69742e845e795d4db77d598c181), [`440ef3ba9`](https://github.com/vercel/vercel/commit/440ef3ba98af8f05e7714c86c67c36dbda11e85c)]:
  - @vercel/remix-builder@2.0.20
  - @vercel/next@4.1.2
  - @vercel/node@3.0.20
  - @vercel/redwood@2.0.8

## 33.5.1

### Patch Changes

- build: upgrade edge-runtime ([#11148](https://github.com/vercel/vercel/pull/11148))

- Updated dependencies [[`24c3dd282`](https://github.com/vercel/vercel/commit/24c3dd282d7714cd63d2b94fb94745c45fdc79ab), [`10e200e0b`](https://github.com/vercel/vercel/commit/10e200e0bf8f692b6740e098e0572b4e7de83850), [`678ebbe52`](https://github.com/vercel/vercel/commit/678ebbe5255766656bf2dddc574e86b2999f11c8)]:
  - @vercel/build-utils@7.7.0
  - @vercel/static-build@2.4.0
  - @vercel/node@3.0.19

## 33.5.0

### Minor Changes

- Mark `flags` as deprecated and replace them with `variants` ([#11098](https://github.com/vercel/vercel/pull/11098))

### Patch Changes

- Updated dependencies [[`c32a909af`](https://github.com/vercel/vercel/commit/c32a909afcedf0ee55777d5dcaecc0c8383dd8c8), [`b6ed28b9b`](https://github.com/vercel/vercel/commit/b6ed28b9b1712f882c93fe053b70d3eb1df21819), [`d21bb9f87`](https://github.com/vercel/vercel/commit/d21bb9f87e1d837666fe8104d4e199b2590725d6), [`4027a1833`](https://github.com/vercel/vercel/commit/4027a1833718a92be74b2b3c5a4df23745d19a36), [`8ba0ce932`](https://github.com/vercel/vercel/commit/8ba0ce932434c6295fedb5307bee59a804b7e6a8), [`0d034b682`](https://github.com/vercel/vercel/commit/0d034b6820c0f3252949c0ffc483048c5aac7f04), [`abaa700ce`](https://github.com/vercel/vercel/commit/abaa700cea44c723cfc851baa2dfe9e1ae2e8a5c), [`3bad73401`](https://github.com/vercel/vercel/commit/3bad73401b4ec1f61e515965732cde8dcc052b17)]:
  - @vercel/next@4.1.1
  - @vercel/node@3.0.18
  - @vercel/redwood@2.0.7
  - @vercel/remix-builder@2.0.19
  - @vercel/build-utils@7.6.0
  - @vercel/static-build@2.3.0

## 33.4.1

### Patch Changes

- Updated dependencies [[`d05e41eea`](https://github.com/vercel/vercel/commit/d05e41eeaf97a024157d2bd843782c95c39389be), [`de63e3562`](https://github.com/vercel/vercel/commit/de63e356223467447cda539ddc435a892303afc7)]:
  - @vercel/static-build@2.2.0

## 33.4.0

### Minor Changes

- Added a new option to add a sensitive environment variable ([#11033](https://github.com/vercel/vercel/pull/11033))

## 33.3.0

### Minor Changes

- Emit "filePathMap" in `vc-config.json` for `FileFsRef` instances ([#11060](https://github.com/vercel/vercel/pull/11060))

### Patch Changes

- Update `vc dev` to support `Lambda` instances without `zipBuffer` ([#11080](https://github.com/vercel/vercel/pull/11080))

- Updated dependencies [[`322c88536`](https://github.com/vercel/vercel/commit/322c88536dfa0ba3892eb580858ee54f6b04ed3f), [`62ca2efa7`](https://github.com/vercel/vercel/commit/62ca2efa731c4df46d586b94078b2dcb1c0bb934)]:
  - @vercel/ruby@2.0.5
  - @vercel/python@4.1.1

## 33.2.0

### Minor Changes

- chore: deprecate next/nuxt/gastby Speed Insights injection in favor of @vercel/speed-insights ([#11048](https://github.com/vercel/vercel/pull/11048))

### Patch Changes

- fix error when @vercel/analytics is a transitive dependency of the deployed application ([#10892](https://github.com/vercel/vercel/pull/10892))

- [cli] Add documentation string for `skip-domain` option ([#11051](https://github.com/vercel/vercel/pull/11051))

- Updated dependencies [[`260125784`](https://github.com/vercel/vercel/commit/2601257846fa201fc9efde021a906c706f6191aa), [`cdddb33ad`](https://github.com/vercel/vercel/commit/cdddb33ad49f6080c49f4fff3767e6111acd0bbe), [`72d8604c9`](https://github.com/vercel/vercel/commit/72d8604c9dba108ccca41d6288b765a7ba727295), [`90d0455e1`](https://github.com/vercel/vercel/commit/90d0455e1ff7b5892ff4960226535f57f704ef6f), [`0716130e5`](https://github.com/vercel/vercel/commit/0716130e580a920d92d249d029ed37f92f2ca847), [`b6b151f39`](https://github.com/vercel/vercel/commit/b6b151f3917c5cb47226951446b9dbb96c7d872b), [`b185a7e20`](https://github.com/vercel/vercel/commit/b185a7e207b153c378bd3db2618eece3a3b6a93e)]:
  - @vercel/static-build@2.1.0
  - @vercel/build-utils@7.5.1
  - @vercel/next@4.1.0
  - @vercel/remix-builder@2.0.18
  - @vercel/node@3.0.17

## 33.1.0

### Minor Changes

- Serialize duplicate `EdgeFunction` references as symlinks in `vc build` ([#11027](https://github.com/vercel/vercel/pull/11027))

### Patch Changes

- Handle rate limit response when fetching /teams ([#11013](https://github.com/vercel/vercel/pull/11013))

- Display actual deployment's 'target' ([#11025](https://github.com/vercel/vercel/pull/11025))

- Updated dependencies [[`98040ec24`](https://github.com/vercel/vercel/commit/98040ec24e1ee585865d11eb216b6525d39d209e)]:
  - @vercel/build-utils@7.5.0
  - @vercel/static-build@2.0.17
  - @vercel/hydrogen@1.0.2
  - @vercel/remix-builder@2.0.17
  - @vercel/node@3.0.16

## 33.0.2

### Patch Changes

- Log extension execution failures ([#10937](https://github.com/vercel/vercel/pull/10937))

- Updated dependencies [[`fbe08fe57`](https://github.com/vercel/vercel/commit/fbe08fe57eededc0bcd2409692b23d185c70069d), [`77585013d`](https://github.com/vercel/vercel/commit/77585013dec5fc406b8b7ea00918e49fdb8f10ec), [`c536a74bc`](https://github.com/vercel/vercel/commit/c536a74bc9e7188a87b292615fa88d6fc506b105), [`91f8763ed`](https://github.com/vercel/vercel/commit/91f8763edce672a3c05b6096db6084f1e6741384), [`7f8f5f865`](https://github.com/vercel/vercel/commit/7f8f5f86516934acb0c4b936ea601433c8d30c5c)]:
  - @vercel/next@4.0.17
  - @vercel/go@3.0.5
  - @vercel/node@3.0.15
  - @vercel/redwood@2.0.6
  - @vercel/remix-builder@2.0.16

## 33.0.1

### Patch Changes

- Updated dependencies [[`67fa2f3dd`](https://github.com/vercel/vercel/commit/67fa2f3dd6a6d5a3504b7f9081e56deff7b36eab), [`7b0adf371`](https://github.com/vercel/vercel/commit/7b0adf371bae64d33ed0a1b966fc50b1f7c9639b)]:
  - @vercel/build-utils@7.4.1
  - @vercel/next@4.0.16
  - @vercel/static-build@2.0.16
  - @vercel/node@3.0.14

## 33.0.0

### Major Changes

- [cli] replace `--deprecated` with `--update-required` in `vc project ls` ([#10965](https://github.com/vercel/vercel/pull/10965))

### Patch Changes

- Fix `vercel bisect` selecting too many deployments ([#10956](https://github.com/vercel/vercel/pull/10956))

- Updated dependencies [[`6a9002f22`](https://github.com/vercel/vercel/commit/6a9002f2296c5ccce4522c0fa9a8938c3d7a4849), [`4d63d9e95`](https://github.com/vercel/vercel/commit/4d63d9e954549d811063d259250d1865b7de2ba1)]:
  - @vercel/remix-builder@2.0.15
  - @vercel/build-utils@7.4.0
  - @vercel/static-build@2.0.15
  - @vercel/node@3.0.13

## 32.7.2

### Patch Changes

- [cli] Use new `deprecated` query param in projects api for `vc project ls --deprecated` ([#10938](https://github.com/vercel/vercel/pull/10938))

## 32.7.1

### Patch Changes

- [cli] double page limit for vc project ls --deprecated ([#10932](https://github.com/vercel/vercel/pull/10932))

- Updated dependencies [[`d09dd1794`](https://github.com/vercel/vercel/commit/d09dd1794b5ffa28c15d3ad2880b90db2f4c06f0)]:
  - @vercel/remix-builder@2.0.14

## 32.7.0

### Minor Changes

- [cli] add `--deprecated` option to `vc project ls` command ([#10919](https://github.com/vercel/vercel/pull/10919))

### Patch Changes

- Remove some debug statements and make log into warning ([#10926](https://github.com/vercel/vercel/pull/10926))

- Updated dependencies [[`3cede43ca`](https://github.com/vercel/vercel/commit/3cede43ca7ea3aec3ff33864b7d33da57891ddb2), [`dfe47f6e6`](https://github.com/vercel/vercel/commit/dfe47f6e6c1d395ae24d802f4b7c98e39b9f90f4), [`1dbb22bb6`](https://github.com/vercel/vercel/commit/1dbb22bb6d33657faa78376f527fe350188c5257), [`204c3592c`](https://github.com/vercel/vercel/commit/204c3592c78fc544e62f0210b0e7e1e4cd382a0c)]:
  - @vercel/ruby@2.0.4
  - @vercel/build-utils@7.3.0
  - @vercel/remix-builder@2.0.13
  - @vercel/node@3.0.12
  - @vercel/static-build@2.0.14

## 32.6.1

### Patch Changes

- Revert "forbids globally installed @vercel/speed-insights and @vercel/analytics (#10848)" ([#10895](https://github.com/vercel/vercel/pull/10895))

## 32.6.0

### Minor Changes

- forbids globally installed @vercel/speed-insights and @vercel/analytics ([#10848](https://github.com/vercel/vercel/pull/10848))

### Patch Changes

- [cli] Fix behavior for combination of northstar user + team scope provided to cli as an argument. ([#10884](https://github.com/vercel/vercel/pull/10884))

- Updated dependencies [[`4edfcd74b`](https://github.com/vercel/vercel/commit/4edfcd74b6dfd8e9cbc05a71d47578051a2a7d63), [`0e9bb30fd`](https://github.com/vercel/vercel/commit/0e9bb30fd285492beadc365bece2ab1df67b387b), [`ca2cbf06f`](https://github.com/vercel/vercel/commit/ca2cbf06fbf252e23aff6e007d0df5ffc243b56e), [`c52bdf775`](https://github.com/vercel/vercel/commit/c52bdf77585dfa41b25cabe2f9403827d0964169)]:
  - @vercel/remix-builder@2.0.12
  - @vercel/static-build@2.0.13
  - @vercel/go@3.0.4

## 32.5.6

### Patch Changes

- Updated dependencies [[`ffd2f34c6`](https://github.com/vercel/vercel/commit/ffd2f34c6c3d53bbb673aa3241845abc50e67c5e), [`4636ae54c`](https://github.com/vercel/vercel/commit/4636ae54c6c17709c1a058169cdca19c3df73ddb)]:
  - @vercel/next@4.0.15
  - @vercel/ruby@2.0.3

## 32.5.5

### Patch Changes

- Updated dependencies [[`88da7463c`](https://github.com/vercel/vercel/commit/88da7463ce12df91d49fbde85cb617030d55f558)]:
  - @vercel/build-utils@7.2.5
  - @vercel/node@3.0.11
  - @vercel/static-build@2.0.12

## 32.5.4

### Patch Changes

- Updated dependencies [[`65dec5b7e`](https://github.com/vercel/vercel/commit/65dec5b7e752f4da8fe0ffdb25215170453f6f8b)]:
  - @vercel/build-utils@7.2.4
  - @vercel/node@3.0.10
  - @vercel/static-build@2.0.11

## 32.5.3

### Patch Changes

- Handle `TooManyProjects` error in places where projects are created ([#10807](https://github.com/vercel/vercel/pull/10807))

- Updated dependencies [[`89c1e0323`](https://github.com/vercel/vercel/commit/89c1e032335d9ec0fcfc84fe499cf004fe73fafc), [`fd29b966d`](https://github.com/vercel/vercel/commit/fd29b966d39776318b0e11a53909edb43d1fc5f2)]:
  - @vercel/node@3.0.9
  - @vercel/next@4.0.14

## 32.5.2

### Patch Changes

- Updated dependencies [[`c94a082f6`](https://github.com/vercel/vercel/commit/c94a082f6bb1b84eaf420ac47ea83640dc83668e)]:
  - @vercel/next@4.0.13

## 32.5.1

### Patch Changes

- Debug log load user exceptions ([#10773](https://github.com/vercel/vercel/pull/10773))

- bump: edge-runtime ([#10712](https://github.com/vercel/vercel/pull/10712))

- Updated dependencies [[`fc90a3dc0`](https://github.com/vercel/vercel/commit/fc90a3dc0bd998453f6527c03d211c35bb0d5770), [`644b8a52c`](https://github.com/vercel/vercel/commit/644b8a52cb2cc8f05e215e2230f95f902cdf8ae8), [`0861dc8fb`](https://github.com/vercel/vercel/commit/0861dc8fbcea1037626b00664a4b6c22f1b0a7ed), [`33cc8e0ac`](https://github.com/vercel/vercel/commit/33cc8e0acf1b3466d50d45b2e5bbe66b89a87c14), [`f5296c3c0`](https://github.com/vercel/vercel/commit/f5296c3c06e620a39c5f88287ac94e58703bdaac), [`d9065c210`](https://github.com/vercel/vercel/commit/d9065c2102223e9cdb5b22df14db41c363cf7828)]:
  - @vercel/next@4.0.12
  - @vercel/node@3.0.8
  - @vercel/build-utils@7.2.3
  - @vercel/remix-builder@2.0.11
  - @vercel/static-build@2.0.10

## 32.5.0

### Minor Changes

- Indicates whether @vercel/speed-insights or @vercel/analytics are used ([#10623](https://github.com/vercel/vercel/pull/10623))

- [cli] update env var validation rule to allow name start with underscore ([#10697](https://github.com/vercel/vercel/pull/10697))

### Patch Changes

- Updated dependencies [[`da300030c`](https://github.com/vercel/vercel/commit/da300030c999b3555c608a321c9d0a4d36923a5a), [`de84743e1`](https://github.com/vercel/vercel/commit/de84743e10d4c9701d409355c0fe057f35e6e435), [`913608de4`](https://github.com/vercel/vercel/commit/913608de4dd4e37557533d732ca8449a5737d4a6), [`7fa08088e`](https://github.com/vercel/vercel/commit/7fa08088ea0d5df6955ea4af7f08513cf4027bb3)]:
  - @vercel/next@4.0.11
  - @vercel/python@4.1.0
  - @vercel/remix-builder@2.0.10
  - @vercel/redwood@2.0.5
  - @vercel/static-build@2.0.9

## 32.4.1

### Patch Changes

- Updated dependencies [[`c523a755f`](https://github.com/vercel/vercel/commit/c523a755f8e4bc41f7c353ebc0b939c21703df00), [`58215906f`](https://github.com/vercel/vercel/commit/58215906f9ee28da3a7f2f3f4aeb862ab53bf55e)]:
  - @vercel/next@4.0.10

## 32.4.0

### Minor Changes

- Restore unsetting teamId for non-team accounts ([#10612](https://github.com/vercel/vercel/pull/10612))

### Patch Changes

- remove unused source map pkg ([#10577](https://github.com/vercel/vercel/pull/10577))

- disable source map for prod build ([#10575](https://github.com/vercel/vercel/pull/10575))

- Better rendering upon authentication error in `vc cert ls` ([#10551](https://github.com/vercel/vercel/pull/10551))

- Updated dependencies [[`e9026c7a6`](https://github.com/vercel/vercel/commit/e9026c7a692937122e60e73b91100cf7009e022d), [`ea5bc8806`](https://github.com/vercel/vercel/commit/ea5bc8806276abf5ba14bdb4a966267497e5d14d), [`a4996e1c5`](https://github.com/vercel/vercel/commit/a4996e1c5a7e6986d5410b662014dc584c0f7c54), [`a18ed98f2`](https://github.com/vercel/vercel/commit/a18ed98f2df78fe1256410ea8676686564ed9b35), [`2f5b0aeeb`](https://github.com/vercel/vercel/commit/2f5b0aeeb183ed3ea8cbc68cb3bc3c949c486ada), [`09f1bbfa4`](https://github.com/vercel/vercel/commit/09f1bbfa41a87cf0063a3fb3022b7531d03862b5), [`ce7e82fa7`](https://github.com/vercel/vercel/commit/ce7e82fa7aa6cec5f5d7b4953353b297b7ad1694)]:
  - @vercel/next@4.0.9
  - @vercel/go@3.0.3
  - @vercel/build-utils@7.2.2
  - @vercel/node@3.0.7
  - @vercel/redwood@2.0.4
  - @vercel/remix-builder@2.0.9
  - @vercel/static-build@2.0.8

## 32.3.1

### Patch Changes

- Use "esbuild" to build CLI ([#10555](https://github.com/vercel/vercel/pull/10555))

- Updated dependencies [[`9f63ca60a`](https://github.com/vercel/vercel/commit/9f63ca60ad914af0f7ba18c9bbe1656eeea68a0a), [`e3f9faf51`](https://github.com/vercel/vercel/commit/e3f9faf513bd97900d8966f2f1116fc3ca07221b)]:
  - @vercel/next@4.0.8
  - @vercel/remix-builder@2.0.8

## 32.3.0

### Minor Changes

- [cli] Support northstar users ([#10535](https://github.com/vercel/vercel/pull/10535))

### Patch Changes

- Internal variants ([#10549](https://github.com/vercel/vercel/pull/10549))

- [speed insights] Prepare for migration to new speed insights package ([#10500](https://github.com/vercel/vercel/pull/10500))

- Updated dependencies [[`b0898a665`](https://github.com/vercel/vercel/commit/b0898a66591d5296dc38ffcf0e8345c9338b72f3), [`10d4e51ac`](https://github.com/vercel/vercel/commit/10d4e51ac57b76f05ddc0bf3adf220e2490244fc), [`decdf27fb`](https://github.com/vercel/vercel/commit/decdf27fb5ca914fe50a9320c4fd50ef79d2fbb3), [`f5ca497b7`](https://github.com/vercel/vercel/commit/f5ca497b7522a2dad637cef238da9716ac133057), [`ab329f0fe`](https://github.com/vercel/vercel/commit/ab329f0fe88e9cb72607d0cba41f5e168d77e077), [`d0d052011`](https://github.com/vercel/vercel/commit/d0d0520111264434d57d5920de0f622f6a2588dc), [`9bb3067de`](https://github.com/vercel/vercel/commit/9bb3067de28be77f3ce268a31a7aa6184836dfb1)]:
  - @vercel/static-build@2.0.7
  - @vercel/node@3.0.6
  - @vercel/build-utils@7.2.1
  - @vercel/next@4.0.7
  - @vercel/python@4.0.2
  - @vercel/redwood@2.0.3
  - @vercel/remix-builder@2.0.7
  - @vercel/go@3.0.2

## 32.2.5

### Patch Changes

- Updated dependencies [[`849eedf0f`](https://github.com/vercel/vercel/commit/849eedf0f2841211e4175d374f1cf01330bf9611), [`f6f16b034`](https://github.com/vercel/vercel/commit/f6f16b0347bac9f5c33c79ccb1fb9fd9d254cae5), [`3035e18fb`](https://github.com/vercel/vercel/commit/3035e18fb67dfe7031e235a74136a41948f86d5a), [`cb784aeb9`](https://github.com/vercel/vercel/commit/cb784aeb9c9e4eddf1c65b61849a87edb1117af1)]:
  - @vercel/next@4.0.6
  - @vercel/remix-builder@2.0.6

## 32.2.4

### Patch Changes

- Add support for bun detection in monorepo ([#10511](https://github.com/vercel/vercel/pull/10511))

- Updated dependencies [[`1b6f3a0f6`](https://github.com/vercel/vercel/commit/1b6f3a0f6534f71c7486a4e33ac199f1da330626)]:
  - @vercel/static-build@2.0.6

## 32.2.3

### Patch Changes

- Updated dependencies [[`083aad448`](https://github.com/vercel/vercel/commit/083aad448e45edae296da3201eec9f890a01d22d)]:
  - @vercel/next@4.0.5

## 32.2.2

### Patch Changes

- Updated dependencies [[`7a0fed970`](https://github.com/vercel/vercel/commit/7a0fed970c39cb8f4df70544ded3284d3538b06a), [`2f461a8b0`](https://github.com/vercel/vercel/commit/2f461a8b0bcbdd05da0516395c2905c2d0242682), [`1bab21026`](https://github.com/vercel/vercel/commit/1bab21026ec0bb8a4a8fbeac3d6e4a197f1030fd)]:
  - @vercel/next@4.0.4
  - @vercel/remix-builder@2.0.5

## 32.2.1

### Patch Changes

- Update @vercel/fun@1.1.0 ([#10477](https://github.com/vercel/vercel/pull/10477))

- [node] upgrade edge-runtime ([#10451](https://github.com/vercel/vercel/pull/10451))

- Updated dependencies [[`6784e7751`](https://github.com/vercel/vercel/commit/6784e77516ba180a691e3c48323b32bb4506d7b6), [`a8ad17626`](https://github.com/vercel/vercel/commit/a8ad176262ef822860ce338927e6f959961d2d32), [`0ee089a50`](https://github.com/vercel/vercel/commit/0ee089a501ebb78901c4afe1658e794917998f8f), [`f15cba614`](https://github.com/vercel/vercel/commit/f15cba6148a0cdb6975db7724775c35ab7d929b2), [`b265e13d4`](https://github.com/vercel/vercel/commit/b265e13d40d541b77148fa79ac60b4c4dd10974c), [`50e04dd85`](https://github.com/vercel/vercel/commit/50e04dd8584664c842a86c15d92d654f4ea8dcbb), [`45b73c7e8`](https://github.com/vercel/vercel/commit/45b73c7e86458564dc0bab007f6f6365c4c4ab5d), [`a732d30c8`](https://github.com/vercel/vercel/commit/a732d30c8409f96f59ea5406e974a6c4186cc130), [`9d64312aa`](https://github.com/vercel/vercel/commit/9d64312aaaa875a4e193b7602c50e5dc68979aad), [`6baefc825`](https://github.com/vercel/vercel/commit/6baefc825ad7cfc3a5edce31cb4244721452f753), [`989f0d813`](https://github.com/vercel/vercel/commit/989f0d813910d8d67ed355de93018f1dcd91b6ba), [`d8bc570f6`](https://github.com/vercel/vercel/commit/d8bc570f604950d97156d4f33c8accecf3b3b28f)]:
  - @vercel/go@3.0.1
  - @vercel/redwood@2.0.2
  - @vercel/remix-builder@2.0.4
  - @vercel/hydrogen@1.0.1
  - @vercel/static-build@2.0.5
  - @vercel/build-utils@7.2.0
  - @vercel/next@4.0.3
  - @vercel/node@3.0.5
  - @vercel/python@4.0.1
  - @vercel/ruby@2.0.2

## 32.2.0

### Minor Changes

- show instant preview url on deploy ([#10458](https://github.com/vercel/vercel/pull/10458))

### Patch Changes

- N, not n. ([#10460](https://github.com/vercel/vercel/pull/10460))

- Fix team URL on `vercel help switch` ([#10466](https://github.com/vercel/vercel/pull/10466))

- Migrates the vc env command to the command data structure for use in the help output. ([#10429](https://github.com/vercel/vercel/pull/10429))

- Update domains command to new structure ([#10427](https://github.com/vercel/vercel/pull/10427))

- Updated semver dependency ([#10411](https://github.com/vercel/vercel/pull/10411))

- migrate `rollback` command structure for help output ([#10426](https://github.com/vercel/vercel/pull/10426))

- migrate `inti` command structure for help output ([#10428](https://github.com/vercel/vercel/pull/10428))

- Remove mri workaround ([#10452](https://github.com/vercel/vercel/pull/10452))

- migrate dev command structure for help output ([#10433](https://github.com/vercel/vercel/pull/10433))

- Update secrets to more recent structure ([#10461](https://github.com/vercel/vercel/pull/10461))

- Migrate `vc secrets` to new help command structure ([#10435](https://github.com/vercel/vercel/pull/10435))

- migrate `promote` command structure for help output ([#10425](https://github.com/vercel/vercel/pull/10425))

- migrate `git` command structure for help output ([#10431](https://github.com/vercel/vercel/pull/10431))

- Update project command to new data structure ([#10432](https://github.com/vercel/vercel/pull/10432))

- migrate teams command ([#10434](https://github.com/vercel/vercel/pull/10434))

- Updated dependencies [[`5609a1187`](https://github.com/vercel/vercel/commit/5609a1187be9d6cf8d5f16825690c5ea72f17dc5), [`caaba0d68`](https://github.com/vercel/vercel/commit/caaba0d6855eff4350b6a04acc3ea502025bff8f), [`1b4de4a98`](https://github.com/vercel/vercel/commit/1b4de4a986f7a612aac834ebae3ec7bb9e9b8cf8), [`c3c54d6e6`](https://github.com/vercel/vercel/commit/c3c54d6e695ec078777c4b1f4f23acbeee3c3b09), [`6aa0aa4e6`](https://github.com/vercel/vercel/commit/6aa0aa4e65b81903f4fce677a198dcfaebee744b), [`e43191b18`](https://github.com/vercel/vercel/commit/e43191b1866da70a3dab3815a3f2176942240ef3), [`fc1e13c09`](https://github.com/vercel/vercel/commit/fc1e13c09928c654410b373fc1775c2b63c6ef4a)]:
  - @vercel/build-utils@7.1.1
  - @vercel/next@4.0.2
  - @vercel/static-build@2.0.4
  - @vercel/redwood@2.0.1
  - @vercel/remix-builder@2.0.3
  - @vercel/ruby@2.0.1
  - @vercel/node@3.0.4

## 32.1.0

### Minor Changes

- Improve error messages for JSON parse failures ([#10396](https://github.com/vercel/vercel/pull/10396))

### Patch Changes

- Updated dependencies [[`9e3827c78`](https://github.com/vercel/vercel/commit/9e3827c785e1bc45f2bed421132167381481770f)]:
  - @vercel/build-utils@7.1.0
  - @vercel/node@3.0.3
  - @vercel/remix-builder@2.0.2
  - @vercel/static-build@2.0.3

## 32.0.2

### Patch Changes

- Remove use of mri preferring use of arg package ([#10389](https://github.com/vercel/vercel/pull/10389))

- upgrade edge-runtime ([#10385](https://github.com/vercel/vercel/pull/10385))

- Update dns commands to new structure ([#10379](https://github.com/vercel/vercel/pull/10379))

- Updated dependencies [[`09446a8fe`](https://github.com/vercel/vercel/commit/09446a8fe8b8201dbe3ead3ca645ef0aa1833b6b), [`597a8a817`](https://github.com/vercel/vercel/commit/597a8a81764c39e70c65b98e78bf4c3827a779a7), [`442232686`](https://github.com/vercel/vercel/commit/44223268651f1bbd5c6f2b0b315239685dd5716e), [`3f6d99470`](https://github.com/vercel/vercel/commit/3f6d99470db86681e006d66507f32afcea086b41), [`37e93a91a`](https://github.com/vercel/vercel/commit/37e93a91a8659934eac7f5cd441b310511bf5646)]:
  - @vercel/next@4.0.1
  - @vercel/node@3.0.2
  - @vercel/remix-builder@2.0.1
  - @vercel/static-build@2.0.2

## 32.0.1

### Patch Changes

- Add `--git-branch` to pull command help output ([#10382](https://github.com/vercel/vercel/pull/10382))

- Update new help structure to support subcommands ([#10372](https://github.com/vercel/vercel/pull/10372))

- Migrate certs command to new structure ([#10377](https://github.com/vercel/vercel/pull/10377))

- Updated dependencies []:
  - @vercel/static-build@2.0.1
  - @vercel/node@3.0.1

## 32.0.0

### Major Changes

- BREAKING CHANGE: Drop Node.js 14, bump minimum to Node.js 16 ([#10369](https://github.com/vercel/vercel/pull/10369))

### Patch Changes

- text wrap help output description ([#10370](https://github.com/vercel/vercel/pull/10370))

- Updated dependencies [[`37f5c6270`](https://github.com/vercel/vercel/commit/37f5c6270058336072ca733673ea72dd6c56bd6a), [`09174df6c`](https://github.com/vercel/vercel/commit/09174df6cfbe697ea13e75468b9cd3c6ec7ad01c)]:
  - @vercel/build-utils@7.0.0
  - @vercel/go@3.0.0
  - @vercel/hydrogen@1.0.0
  - @vercel/next@4.0.0
  - @vercel/node@3.0.0
  - @vercel/python@4.0.0
  - @vercel/redwood@2.0.0
  - @vercel/remix-builder@2.0.0
  - @vercel/ruby@2.0.0
  - @vercel/static-build@2.0.0

## 31.4.0

### Minor Changes

- Force-publish ([#10358](https://github.com/vercel/vercel/pull/10358))

### Patch Changes

- Updated dependencies [[`6e44757ff`](https://github.com/vercel/vercel/commit/6e44757ff5d7d80ba6db2ab5ea65213392ecf1cd)]:
  - @vercel/static-build@1.4.0

## 31.3.1

### Patch Changes

- Updated dependencies [[`844fb6e88`](https://github.com/vercel/vercel/commit/844fb6e880a980f26945f15a7437b4d67bcb5394)]:
  - @vercel/remix-builder@1.10.1

## 31.3.0

### Minor Changes

- Update help output to use cli-table3 ([#10333](https://github.com/vercel/vercel/pull/10333))

### Patch Changes

- Sanitize argv in log during `vc build`. ([#10311](https://github.com/vercel/vercel/pull/10311))

- Respect `--yes` flag for all prompts during `vc link --repo` ([#10337](https://github.com/vercel/vercel/pull/10337))

- Updated dependencies [[`8cb9385fd`](https://github.com/vercel/vercel/commit/8cb9385fd306d0c2b8771d7bb063e6948ed15729), [`94c93dfb5`](https://github.com/vercel/vercel/commit/94c93dfb5b29aa58317f9d0854273d4880d91a62)]:
  - @vercel/node@2.15.10
  - @vercel/static-build@1.3.46

## 31.2.3

### Patch Changes

- Be looser in tests with mock server urls ([#10300](https://github.com/vercel/vercel/pull/10300))

- Handle calls for deployment aliases when mocking deployments ([#10303](https://github.com/vercel/vercel/pull/10303))

- Remove unused code ([#10309](https://github.com/vercel/vercel/pull/10309))

- Updated dependencies [[`5bf1fe4c7`](https://github.com/vercel/vercel/commit/5bf1fe4c743f6be3f7d5a24447ea5b083a68dc67), [`a8ecf40d6`](https://github.com/vercel/vercel/commit/a8ecf40d6f50e2fc8b13b02c8ef50b3dcafad3a6), [`08da4b9c9`](https://github.com/vercel/vercel/commit/08da4b9c923501d9d28eb6e3f26f4605fee83042), [`0945d24cb`](https://github.com/vercel/vercel/commit/0945d24cbe901ca3f0eedd011251ad499c72d472)]:
  - @vercel/next@3.9.4
  - @vercel/build-utils@6.8.3
  - @vercel/remix-builder@1.10.0
  - @vercel/node@2.15.9
  - @vercel/static-build@1.3.45

## 31.2.2

### Patch Changes

- Migrate list command to new structure ([#10284](https://github.com/vercel/vercel/pull/10284))

- Migrate whoami command to new structure ([#10266](https://github.com/vercel/vercel/pull/10266))

- Migrate logs command to new structure ([#10281](https://github.com/vercel/vercel/pull/10281))

- Migrate login command to new structure ([#10283](https://github.com/vercel/vercel/pull/10283))

- Migrate pull command to new structure ([#10280](https://github.com/vercel/vercel/pull/10280))

- Migrate logout command to new structure ([#10282](https://github.com/vercel/vercel/pull/10282))

- Migrate build command to new structure ([#10286](https://github.com/vercel/vercel/pull/10286))

- Migrate inspect command to new structure ([#10277](https://github.com/vercel/vercel/pull/10277))

- Migrate redeploy command to new structure ([#10279](https://github.com/vercel/vercel/pull/10279))

- Migrate link command to new structure ([#10285](https://github.com/vercel/vercel/pull/10285))

- Update spacing of --help output for CLI ([#10287](https://github.com/vercel/vercel/pull/10287))

- Updated dependencies [[`4af242af8`](https://github.com/vercel/vercel/commit/4af242af8633e58b6a9bf920564416da3ef22ad4), [`0cbdae141`](https://github.com/vercel/vercel/commit/0cbdae1411aa7936ff7dfe551919ca5e56cd6e98), [`85dd66778`](https://github.com/vercel/vercel/commit/85dd667781693539d753d587566e53964bbe189d)]:
  - @vercel/node@2.15.8
  - @vercel/remix-builder@1.9.1
  - @vercel/static-build@1.3.44

## 31.2.1

### Patch Changes

- Migrate bisect command to new structure ([#10276](https://github.com/vercel/vercel/pull/10276))

- Migrate remove command to new structure ([#10268](https://github.com/vercel/vercel/pull/10268))

- Updated dependencies [[`fc413707d`](https://github.com/vercel/vercel/commit/fc413707d017e234d5013b761d885f65f9b981bc)]:
  - @vercel/node@2.15.7
  - @vercel/static-build@1.3.43

## 31.2.0

### Minor Changes

- Add a "Global Options" section to help output ([#10250](https://github.com/vercel/vercel/pull/10250))

### Patch Changes

- Updated dependencies [[`d1b0dbe3a`](https://github.com/vercel/vercel/commit/d1b0dbe3a7d8754286aa2b7ba0c8b55d3adafdea), [`4a8622a10`](https://github.com/vercel/vercel/commit/4a8622a10d52260cb629a1c4a6f797ade05ea154), [`6469ef1b8`](https://github.com/vercel/vercel/commit/6469ef1b8ce37e93f50ab4a108aa0953d7631fe8)]:
  - @vercel/remix-builder@1.9.0
  - @vercel/next@3.9.3

## 31.1.1

### Patch Changes

- Updated dependencies [[`7c30b13cc`](https://github.com/vercel/vercel/commit/7c30b13ccb79bdf0ac240282bba4c084f1d0d122)]:
  - @vercel/next@3.9.2

## 31.1.0

### Minor Changes

- Add 'Environment' column to 'vc list' with new '--environment' filter and pipe URLs to stdout ([#10239](https://github.com/vercel/vercel/pull/10239))

### Patch Changes

- Update `proxy-agent` to v6.3.0 ([#10226](https://github.com/vercel/vercel/pull/10226))

- Use `getNodeBinPaths()` in `vc dev` ([#10225](https://github.com/vercel/vercel/pull/10225))

- Updated dependencies [[`b1c14cde0`](https://github.com/vercel/vercel/commit/b1c14cde03f94b2c15ba12c9be9d19c72df2fdbb), [`ce4633fe4`](https://github.com/vercel/vercel/commit/ce4633fe4d00cb5c251cdabbfab08f39ec3f3b5f)]:
  - @vercel/next@3.9.1
  - @vercel/static-build@1.3.42

## 31.0.4

### Patch Changes

- Detect multiple frameworks within the same root directory during `vc link --repo` ([#10203](https://github.com/vercel/vercel/pull/10203))

- Updated dependencies [[`b56639b62`](https://github.com/vercel/vercel/commit/b56639b624e9ad1df048a4c85083e26888696060), [`cae60155f`](https://github.com/vercel/vercel/commit/cae60155f34883f08a5e4f51b547e2a1a5fee694), [`c670e5171`](https://github.com/vercel/vercel/commit/c670e51712022193e078bd68b055f7e61013015d), [`5439d7c0c`](https://github.com/vercel/vercel/commit/5439d7c0c9b79e7161bf4fa84ffdb357365f9e7e)]:
  - @vercel/node@2.15.6
  - @vercel/next@3.9.0
  - @vercel/remix-builder@1.8.18
  - @vercel/static-build@1.3.41

## 31.0.3

### Patch Changes

- Fix redeploy target to be undefined when null ([#10201](https://github.com/vercel/vercel/pull/10201))

- Respect forbidden API responses ([#10178](https://github.com/vercel/vercel/pull/10178))

- Update `supports-hyperlinks` to v3 ([#10208](https://github.com/vercel/vercel/pull/10208))

- Updated dependencies [[`0750517af`](https://github.com/vercel/vercel/commit/0750517af99aea41410d4f1f772ce427699554e7)]:
  - @vercel/build-utils@6.8.2
  - @vercel/static-build@1.3.40
  - @vercel/node@2.15.5
  - @vercel/remix-builder@1.8.17

## 31.0.2

### Patch Changes

- Allow additional project settings in `createProject()` ([#10172](https://github.com/vercel/vercel/pull/10172))

- Run local Project detection during `vc link --repo`. ([#10094](https://github.com/vercel/vercel/pull/10094))
  This allows for creation of new Projects that do not yet exist under the selected scope.

- Redeploy command no longer redeploys preview deployments to production ([#10186](https://github.com/vercel/vercel/pull/10186))

- Added trailing new line at end of help output ([#10170](https://github.com/vercel/vercel/pull/10170))

- Create new help output and arg parsing for deploy command ([#10090](https://github.com/vercel/vercel/pull/10090))

- [cli] Remove `preinstall` script ([#10157](https://github.com/vercel/vercel/pull/10157))

- Updated dependencies [[`7021279b2`](https://github.com/vercel/vercel/commit/7021279b284f314a4d1bdbb4306b4c22291efa08), [`5e5332fbc`](https://github.com/vercel/vercel/commit/5e5332fbc9317a8f3cc4ed0b72ec1a2c76020891), [`027bce00b`](https://github.com/vercel/vercel/commit/027bce00b3821d9b4a8f7ec320cd1c43ab9f4215)]:
  - @vercel/build-utils@6.8.1
  - @vercel/node@2.15.4
  - @vercel/remix-builder@1.8.16
  - @vercel/static-build@1.3.39

## 31.0.1

### Patch Changes

- Updated dependencies [[`aa734efc6`](https://github.com/vercel/vercel/commit/aa734efc6c42badd4aa9bf64487904aa64e9bd49)]:
  - @vercel/next@3.8.8

## 31.0.0

### Major Changes

- Update `vc dev` redirect response to match production behavior ([#10143](https://github.com/vercel/vercel/pull/10143))

### Patch Changes

- require `--yes` to promote preview deployment ([#10135](https://github.com/vercel/vercel/pull/10135))

- [cli] Optimize write build result for vc build ([#10154](https://github.com/vercel/vercel/pull/10154))

- Only show relevant Project matches in Project selector ([#10114](https://github.com/vercel/vercel/pull/10114))

- [cli] Fix error message when token is invalid ([#10131](https://github.com/vercel/vercel/pull/10131))

- Updated dependencies [[`e4895d979`](https://github.com/vercel/vercel/commit/e4895d979b57e369e0618481c5974243887d72cc), [`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c), [`346892210`](https://github.com/vercel/vercel/commit/3468922108f411482a72acd0331f0f2ee52a6d4c), [`a6de052ed`](https://github.com/vercel/vercel/commit/a6de052ed2f09cc80bf4c2d0f06bedd267a63cdc)]:
  - @vercel/next@3.8.7
  - @vercel/static-build@1.3.38
  - @vercel/build-utils@6.8.0
  - @vercel/remix-builder@1.8.15
  - @vercel/node@2.15.3

## 30.2.3

### Patch Changes

- [cli] do not force auto-assign value on deployments ([#10110](https://github.com/vercel/vercel/pull/10110))

- Updated dependencies [[`91406abdb`](https://github.com/vercel/vercel/commit/91406abdb0c332152fc6c7c1e4bd3a872b084434), [`2230ea6cc`](https://github.com/vercel/vercel/commit/2230ea6cc1b84c1f03227a4e197b7684635b5955), [`8b3a4146a`](https://github.com/vercel/vercel/commit/8b3a4146af68d2b7288c80a5b919d832dba929b5)]:
  - @vercel/node@2.15.2
  - @vercel/remix-builder@1.8.14
  - @vercel/static-build@1.3.37

## 30.2.2

### Patch Changes

- [cli] vc env pull should add `.env*.local` to `.gitignore` ([#10085](https://github.com/vercel/vercel/pull/10085))

- [cli] Fix team validation bug where you are apart of a team ([#10092](https://github.com/vercel/vercel/pull/10092))

- Add support for `vc dev` command with repo link ([#10082](https://github.com/vercel/vercel/pull/10082))

- Add support for `vc deploy --prebuilt` command with repo link ([#10083](https://github.com/vercel/vercel/pull/10083))

- Move readme copy logic to a helper function for `vc link` ([#10084](https://github.com/vercel/vercel/pull/10084))

- Add support for `vc pull` command with repo link ([#10078](https://github.com/vercel/vercel/pull/10078))

- Add support for `vc build` command with repo link ([#10075](https://github.com/vercel/vercel/pull/10075))

## 30.2.1

### Patch Changes

- Updated dependencies [[`a04bf557f`](https://github.com/vercel/vercel/commit/a04bf557fc6e1080a117428977d0993dec78b004)]:
  - @vercel/node@2.15.1
  - @vercel/static-build@1.3.36

## 30.2.0

### Minor Changes

- [node] Add isomorphic functions ([#9947](https://github.com/vercel/vercel/pull/9947))

### Patch Changes

- Add `client.fetchPaginated()` helper function ([#10054](https://github.com/vercel/vercel/pull/10054))

- Updated dependencies [[`bc5afe24c`](https://github.com/vercel/vercel/commit/bc5afe24c4547dbf798b939199e8212c4b34038e), [`49c717856`](https://github.com/vercel/vercel/commit/49c7178567ec5bcebe633b598c8c9c0e1aa40fbb), [`0039c8b5c`](https://github.com/vercel/vercel/commit/0039c8b5cea975316a62c4f6aaca5d66d731cc0d)]:
  - @vercel/node@2.15.0
  - @vercel/remix-builder@1.8.13
  - @vercel/static-build@1.3.35

## 30.1.2

### Patch Changes

- Publish missing build-utils ([`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb))

- Updated dependencies [[`cd35071f6`](https://github.com/vercel/vercel/commit/cd35071f609d615d47bc04634c123b33768436cb)]:
  - @vercel/build-utils@6.7.5
  - @vercel/node@2.14.5
  - @vercel/remix-builder@1.8.12
  - @vercel/static-build@1.3.34

## 30.1.1

### Patch Changes

- [cli] vc build ignore '.env\*' & ignore files for '@vercel/static' ([#10056](https://github.com/vercel/vercel/pull/10056))

- [cli] Ensure .npmrc does not contain use-node-version ([#10049](https://github.com/vercel/vercel/pull/10049))

## 30.1.0

### Minor Changes

- New `vc promote` command ([#9984](https://github.com/vercel/vercel/pull/9984))

### Patch Changes

- Support `deploy` subcommand in "repo linked" mode ([#10013](https://github.com/vercel/vercel/pull/10013))

- [cli] Update `vc rollback` to use `lastRequestAlias` instead of `lastRollbackTarget` ([#10019](https://github.com/vercel/vercel/pull/10019))

- Fix `--cwd` flag with a relative path for `env`, `link`, `promote`, and `rollback` subcommands ([#10031](https://github.com/vercel/vercel/pull/10031))

- Updated dependencies [[`c6c19354e`](https://github.com/vercel/vercel/commit/c6c19354e852cfc1338b223058c4b07fdc71c723), [`b56ac2717`](https://github.com/vercel/vercel/commit/b56ac2717d6769eb400f9746f0a05431929b4501), [`c63679ea0`](https://github.com/vercel/vercel/commit/c63679ea0a6bc48c0759ccf3c0c0a8106bd324f0), [`c7bcea408`](https://github.com/vercel/vercel/commit/c7bcea408131df2d65338e50ce319a6d8e4a8a82)]:
  - @vercel/next@3.8.6
  - @vercel/build-utils@6.7.4
  - @vercel/node@2.14.4
  - @vercel/remix-builder@1.8.11
  - @vercel/static-build@1.3.33

## 30.0.0

### Major Changes

- Change `vc env pull` default output file to `.env.local` ([#9892](https://github.com/vercel/vercel/pull/9892))

- Remove `--platform-version` global common arg ([#9807](https://github.com/vercel/vercel/pull/9807))

### Minor Changes

- [cli] implement `vc deploy --prod --skip-build` ([#9836](https://github.com/vercel/vercel/pull/9836))

- New `vc redeploy` command ([#9956](https://github.com/vercel/vercel/pull/9956))

### Patch Changes

- Fix `vercel git connect` command when passing a URL parameter ([#9967](https://github.com/vercel/vercel/pull/9967))

## 29.4.0

### Minor Changes

- Add `vercel link --repo` flag to link to repository (multiple projects), rather than an individual project (alpha) ([#8931](https://github.com/vercel/vercel/pull/8931))

## 29.3.6

### Patch Changes

- Updated dependencies []:
  - @vercel/static-build@1.3.32

## 29.3.5

### Patch Changes

- Updated dependencies [[`2c950d47a`](https://github.com/vercel/vercel/commit/2c950d47aeb22a3de16f983259ea6f37a4555189), [`71b9f3a94`](https://github.com/vercel/vercel/commit/71b9f3a94b7922607f8f24bf7b2bd1742e62cc05), [`f00b08a82`](https://github.com/vercel/vercel/commit/f00b08a82085c3a63059f34f67f10ced92f2979c)]:
  - @vercel/static-build@1.3.31
  - @vercel/build-utils@6.7.3
  - @vercel/next@3.8.5
  - @vercel/node@2.14.3
  - @vercel/remix-builder@1.8.10

## 29.3.4

### Patch Changes

- Updated dependencies [[`67e556bc8`](https://github.com/vercel/vercel/commit/67e556bc80c821c233120a2ec1611adb8e195baa), [`ba10fb4dd`](https://github.com/vercel/vercel/commit/ba10fb4dd4155a75df79b98a0c43a6c42eac7b62)]:
  - @vercel/remix-builder@1.8.9
  - @vercel/next@3.8.4

## 29.3.3

### Patch Changes

- Updated dependencies [[`6c6f3ce9d`](https://github.com/vercel/vercel/commit/6c6f3ce9d228b1e038641e4bafb38c3487e7dff7)]:
  - @vercel/next@3.8.3

## 29.3.2

### Patch Changes

- [vc dev] Fix serverless function size limit condition ([#9961](https://github.com/vercel/vercel/pull/9961))

## 29.3.1

### Patch Changes

- Sort environment variables alphabetically in `vercel env pull` ([#9949](https://github.com/vercel/vercel/pull/9949))
- Skip 50MB zip size limit for Python ([#9944](https://github.com/vercel/vercel/pull/9944))

## 29.3.0

### Minor Changes

- [cli] remove `vc rollback` beta label ([#9928](https://github.com/vercel/vercel/pull/9928))

## 29.2.1

### Patch Changes

- Updated dependencies [[`6d5983eaa`](https://github.com/vercel/vercel/commit/6d5983eaaefe3fd2204f49c3228718ac64a452e3)]:
  - @vercel/remix-builder@1.8.8
