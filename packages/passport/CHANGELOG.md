# @vercel/passport

## 1.2.0

### Minor Changes

- edbf428: Add `requireIdentity`, which calls `getIdentity` and throws `PassportIdentityError` if no identity token is available. Both `requireIdentity` and `verifyIdentity` return the new `PassportIdentityWithRequiredToken` interface, which extends `PassportIdentity` with a string token.

### Patch Changes

- edbf428: Allow token subjects to omit `type` and infer `type: 'token'` before sending Connect requests. Refine Passport identity types so verified identities have a string token.

## 1.1.0

### Minor Changes

- 6997eb4: Support reading Passport session tokens stored across multiple cookies while preserving support for existing single-cookie sessions.

## 1.0.1

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.

## 1.0.0

### Major Changes

- 96e1bb1: Promote `@vercel/passport` to a stable 1.0.0 release.

## 0.1.3

### Patch Changes

- 86d88dd: Add a `verifyIdentity` helper for verifying forwarded Passport identity tokens.

## 0.1.2

### Patch Changes

- fadffb5: Read the Passport cookie from Vercel request context headers.

## 0.1.1

### Patch Changes

- afdf72b: Restore the `@vercel/passport` package after it was temporarily removed.

## 0.1.0

### Minor Changes

- 73d85e5: Add `getIdentity` for reading Passport identity from Vercel Functions.
