# @vercel/oidc

## 3.0.1

### Patch Changes

- feat(oidc): export `getContext()` method ([#14004](https://github.com/vercel/vercel/pull/14004))

- feat(oidc): add conditional export for browsers ([#14005](https://github.com/vercel/vercel/pull/14005))

  Introduces a browser export with mock methods that don't require access to a file system or environment variables. This makes `@vercel/oidc` usable for universal libraries that are run in both frontend and backend.

- fix(oidc): remove `ms` dependency ([#14003](https://github.com/vercel/vercel/pull/14003))

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
