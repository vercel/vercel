# @vercel/oidc

## 3.4.0

### Minor Changes

- c56f851: Upgrade to TypeScript 5.9

## 3.3.1

### Patch Changes

- bf07448: Revert "auth: Make it possible to store CLI credentials in OS keychain (#16083)"

## 3.3.0

### Minor Changes

- 24686d0: Add configurable auth token storage with keyring-backed persistence and file fallback support.

### Patch Changes

- 56c9f89: add missing prettier dev dependency
- Updated dependencies [24686d0]
- Updated dependencies [d36ee35]
- Updated dependencies [56c9f89]
  - @vercel/cli-auth@0.1.0

## 3.2.1

### Patch Changes

- Pin `typedoc-plugin-markdown` to `3.15.2` and `typedoc-plugin-mdn-links` to `3.0.3` to match the version used by `@vercel/edge`. The previous `4.1.2` version requires `typedoc@0.26.x` as a peer dependency but was paired with `typedoc@0.24.6`, which caused CI failures whenever pnpm hoisted the 4.x plugin (the plugin calls `app.internationalization.addTranslations`, which does not exist in typedoc 0.24). The choice of which plugin version got hoisted was non-deterministic, which is why the failure appeared as flaky `Build @vercel/<pkg>` steps in CI. ([#16072](https://github.com/vercel/vercel/pull/16072))

## 3.2.0

### Minor Changes

- - Add optional `team` and `project` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json` ([#14864](https://github.com/vercel/vercel/pull/14864))
  - Add `expirationBufferMs` option to both `getVercelOidcToken()` and `getVercelToken()` to proactively refresh tokens before they expire (useful for avoiding auth errors mid-request)
  - Export `getVercelToken()` function with `GetVercelTokenOptions` interface to allow refreshing CLI tokens with configurable expiration buffer

## 3.1.0

### Minor Changes

- Allow vercel/oidc to refresh the vercel CLI auth token when running locally ([#14543](https://github.com/vercel/vercel/pull/14543))

### Patch Changes

- improve error messages for package consumers ([#14449](https://github.com/vercel/vercel/pull/14449))

## 3.0.5

### Patch Changes

- Fix OIDC token expiry check ([#14306](https://github.com/vercel/vercel/pull/14306))

## 3.0.4

### Patch Changes

- Fix directory permissions so that files can be created under the OIDC data directory in linux ([#14214](https://github.com/vercel/vercel/pull/14214))

## 3.0.3

### Patch Changes

- fix(oidc): add `"workflow"` as export condition ([#14103](https://github.com/vercel/vercel/pull/14103))

## 3.0.2

### Patch Changes

- fix(oidc): add `"react-native"` as export condition ([#14066](https://github.com/vercel/vercel/pull/14066))

## 3.0.1

### Patch Changes

- feat(oidc): export `getContext()` method ([#14027](https://github.com/vercel/vercel/pull/14027))

- feat(oidc): add conditional export for browsers ([#14027](https://github.com/vercel/vercel/pull/14027))

  Introduces a browser export with mock methods that don't require access to a file system or environment variables. This makes `@vercel/oidc` usable for universal libraries that are run in both frontend and backend.

- fix(oidc): remove `ms` dependency ([#14027](https://github.com/vercel/vercel/pull/14027))

## 3.0.0

### Major Changes

- Drop Node.js 18, bump minimum to Node.js 20 ([#13856](https://github.com/vercel/vercel/pull/13856))

## 2.0.2

### Patch Changes

- fix "Cannot find module" error caused by dynamically importing files without their extensions ([#13815](https://github.com/vercel/vercel/pull/13815))

## 2.0.1

### Patch Changes

- Fix package versions for oidc-aws-credentials-provider, vercel/functions, and publish the next version of vercel/oidc ([#13765](https://github.com/vercel/vercel/pull/13765))

## 2.1.0

### Minor Changes

- Add refresh token ability to @vercel/oidc ([#13608](https://github.com/vercel/vercel/pull/13608))

## 2.0.0

### Major Changes

- extract oidc and aws oidc credential helpers from @vercel/functions into @vercel/oidc and @vercel/oidc-aws-credentials-provider. @vercel/functions re-exports the new functions as deprecated to maintain backwards compatibility. ([#13548](https://github.com/vercel/vercel/pull/13548))

## 1.0.0

### Major Changes

- Initial release ([#13548](https://github.com/vercel/vercel/pull/13548))
