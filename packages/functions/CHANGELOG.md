# @vercel/functions

## 2.2.13

### Patch Changes

- Updated dependencies [[`821e4b8e8eded000b3d4e864594730e8741ef522`](https://github.com/vercel/vercel/commit/821e4b8e8eded000b3d4e864594730e8741ef522)]:
  - @vercel/oidc@2.0.2

## 2.2.12

### Patch Changes

- Fix package versions for oidc-aws-credentials-provider, vercel/functions, and publish the next version of vercel/oidc ([#13765](https://github.com/vercel/vercel/pull/13765))

- Updated dependencies [[`2f5244647dc7d2c81bb688035952d4d45b6d707e`](https://github.com/vercel/vercel/commit/2f5244647dc7d2c81bb688035952d4d45b6d707e)]:
  - @vercel/oidc@2.0.1

## 2.2.11

### Patch Changes

- Fix dependency ([#13726](https://github.com/vercel/vercel/pull/13726))

## 2.2.10

### Patch Changes

- Update dependency ([#13722](https://github.com/vercel/vercel/pull/13722))

## 2.2.9

### Patch Changes

- Extract AWS dynamic import to async loader with error handling ([#13660](https://github.com/vercel/vercel/pull/13660))

- Updated dependencies [[`a133e534e7dfd785beeeb0dcafed8d2c991e9f11`](https://github.com/vercel/vercel/commit/a133e534e7dfd785beeeb0dcafed8d2c991e9f11)]:
  - @vercel/oidc@2.1.0

## 2.2.8

### Patch Changes

- Declare attachDatabasePool stable ([#13673](https://github.com/vercel/vercel/pull/13673))

## 2.2.7

### Patch Changes

- Make DB pool inert in local dev ([#13647](https://github.com/vercel/vercel/pull/13647))

## 2.2.6

### Patch Changes

- Introduce attachDatabasePool function ([#13632](https://github.com/vercel/vercel/pull/13632))

## 2.2.5

### Patch Changes

- extract oidc and aws oidc credential helpers from @vercel/functions into @vercel/oidc and @vercel/oidc-aws-credentials-provider. @vercel/functions re-exports the new functions as deprecated to maintain backwards compatibility. ([#13548](https://github.com/vercel/vercel/pull/13548))

- Updated dependencies [[`fa8d4c76ea50c4844031f56209b21845818212fc`](https://github.com/vercel/vercel/commit/fa8d4c76ea50c4844031f56209b21845818212fc)]:
  - @vercel/oidc@2.0.0

## 2.2.5

### Patch Changes

- Extract oidc behavior into separate packages ([#13548](https://github.com/vercel/vercel/pull/13548))

## 2.2.4

### Patch Changes

- Only warn runtime cache unavailable once ([#13560](https://github.com/vercel/vercel/pull/13560))

- Reverting support for `preferredRegion` ([#13566](https://github.com/vercel/vercel/pull/13566))

## 2.2.3

### Patch Changes

- Update runtime cache api to support usage during builds ([#13426](https://github.com/vercel/vercel/pull/13426))

## 2.2.2

### Patch Changes

- Add warning when calling getCache to indicate that in-memory cache is being used. ([#13455](https://github.com/vercel/vercel/pull/13455))

## 2.2.1

### Patch Changes

- Update runtime cache to always use the current cache instance to prevent holding a stale copy ([#13454](https://github.com/vercel/vercel/pull/13454))

## 2.2.0

### Minor Changes

- Introduce `getVercelOidcTokenSync` ([#13429](https://github.com/vercel/vercel/pull/13429))

## 2.1.0

### Minor Changes

- Change the load order of the OIDC token ([#13337](https://github.com/vercel/vercel/pull/13337))

### Patch Changes

- Rename getRuntimeCache to getCache ([#13325](https://github.com/vercel/vercel/pull/13325))

## 2.0.3

### Patch Changes

- Rename FunctionCache / getFunctionCache to RuntimeCache / getRuntimeCache ([#13296](https://github.com/vercel/vercel/pull/13296))

## 2.0.2

### Patch Changes

- Update in memory cache to use a singleton instance ([#13288](https://github.com/vercel/vercel/pull/13288))

## 2.0.1

### Patch Changes

- Add Vercel Function Cache api ([#13221](https://github.com/vercel/vercel/pull/13221))

## 2.0.0

### Major Changes

- [cli] Remove support for node@16 ([#12857](https://github.com/vercel/vercel/pull/12857))

## 1.6.0

### Minor Changes

- Add middleware-related helper functions ([#12938](https://github.com/vercel/vercel/pull/12938))

## 1.5.2

### Patch Changes

- [vercel/functions] add geolocation.postalCode ([#12753](https://github.com/vercel/vercel/pull/12753))

## 1.5.1

### Patch Changes

- [@vercel/functions] update headers doc ([#12649](https://github.com/vercel/vercel/pull/12649))

## 1.5.0

### Minor Changes

- ipAddress: accept headers as input ([#12429](https://github.com/vercel/vercel/pull/12429))

## 1.4.2

### Patch Changes

- [functions] decode city name ([#12234](https://github.com/vercel/vercel/pull/12234))

## 1.4.1

### Patch Changes

- Package files in the root folder ([#11982](https://github.com/vercel/vercel/pull/11982))

## 1.4.0

### Minor Changes

- Added OIDC Token utility functions ([#11701](https://github.com/vercel/vercel/pull/11701))

## 1.3.0

### Minor Changes

- [functions] add `getEnv` method. ([#11783](https://github.com/vercel/vercel/pull/11783))

## 1.2.0

### Minor Changes

- Add `geolocation` & `ipAdress` methods. ([#11802](https://github.com/vercel/vercel/pull/11802))

## 1.1.0

### Minor Changes

- Rewrite `@vercel/functions` to TypeScript ([#11791](https://github.com/vercel/vercel/pull/11791))

## 1.0.2

### Patch Changes

- Convert package to CommonJS ([#11569](https://github.com/vercel/vercel/pull/11569))

## 1.0.1

### Patch Changes

- Don't throw error if context is missing ([`0817527f9`](https://github.com/vercel/vercel/commit/0817527f9e9d0d5fceb73f21e695089349a96d3e))

## 1.0.0

### Major Changes

- Initial release ([#11553](https://github.com/vercel/vercel/pull/11553))
