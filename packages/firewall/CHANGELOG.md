# @vercel/firewall

## 1.1.3

### Patch Changes

- Pin `typedoc-plugin-markdown` to `3.15.2` and `typedoc-plugin-mdn-links` to `3.0.3` to match the version used by `@vercel/edge`. The previous `4.1.2` version requires `typedoc@0.26.x` as a peer dependency but was paired with `typedoc@0.24.6`, which caused CI failures whenever pnpm hoisted the 4.x plugin (the plugin calls `app.internationalization.addTranslations`, which does not exist in typedoc 0.24). The choice of which plugin version got hoisted was non-deterministic, which is why the failure appeared as flaky `Build @vercel/<pkg>` steps in CI. ([#16072](https://github.com/vercel/vercel/pull/16072))

## 1.1.2

### Patch Changes

- Add syncpack to enforce @types/node version consistency across the monorepo. ([#14665](https://github.com/vercel/vercel/pull/14665))

  Update @types/node to 20.11.0 and fix type compatibility issues.

## 1.1.1

### Patch Changes

- Allow users to set a path prefix to the Rate Limit request to support microfrontends. ([#14123](https://github.com/vercel/vercel/pull/14123))

## 1.1.0

### Minor Changes

- Automatically handle vercel auth and support magic header injection for all frameworks ([#13943](https://github.com/vercel/vercel/pull/13943))

## 1.0.1

### Patch Changes

- Fix headers being awaited for nextjs 15+ ([#13688](https://github.com/vercel/vercel/pull/13688))

## 1.0.0

### Major Changes

- Mark checkRateLimit as stable ([#13382](https://github.com/vercel/vercel/pull/13382))

### Patch Changes

- Updated description ([#13384](https://github.com/vercel/vercel/pull/13384))

## 0.1.7

### Patch Changes

- fix(readme): updated link to documentation about the SDK ([#13210](https://github.com/vercel/vercel/pull/13210))

## 0.1.6

### Patch Changes

- Bump next from 14.2.10 to 14.2.21 ([#12842](https://github.com/vercel/vercel/pull/12842))

## 0.1.5

### Patch Changes

- remove "next" in firewall to resolve vulnerability report ([#12813](https://github.com/vercel/vercel/pull/12813))

## 0.1.4

### Patch Changes

- Ensure firewall tests run ([#12551](https://github.com/vercel/vercel/pull/12551))

## 0.1.3

### Patch Changes

- Link to docs ([#12216](https://github.com/vercel/vercel/pull/12216))

## 0.1.1

### Patch Changes

- Added support for vercel deployment protection bypass ([#12019](https://github.com/vercel/vercel/pull/12019))

## 0.1.0

### Minor Changes

- Initial release ([#11992](https://github.com/vercel/vercel/pull/11992))
