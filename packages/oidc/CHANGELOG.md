# @vercel/oidc

## 2.0.1

### Patch Changes

- Add refresh token behavior to getVercelOidcToken ([#13608](https://github.com/vercel/vercel/pull/13608))
- - Depends on vercel CLI being installed and linked to the project in question

## 2.0.0

### Major Changes

- extract oidc and aws oidc credential helpers from @vercel/functions into @vercel/oidc and @vercel/oidc-aws-credentials-provider. @vercel/functions re-exports the new functions as deprecated to maintain backwards compatibility. ([#13548](https://github.com/vercel/vercel/pull/13548))

## 1.0.0

### Major Changes

- Initial release ([#13548](https://github.com/vercel/vercel/pull/13548))
