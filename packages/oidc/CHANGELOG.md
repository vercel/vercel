# @vercel/oidc

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
