# @vercel/kms

## 0.3.7

### Patch Changes

- @vercel/oidc@4.0.4

## 0.3.6

### Patch Changes

- @vercel/oidc@4.0.3

## 0.3.5

### Patch Changes

- @vercel/oidc@4.0.2

## 0.3.4

### Patch Changes

- Updated dependencies [d032cfb]
  - @vercel/oidc@4.0.1

## 0.3.3

### Patch Changes

- Updated dependencies [baad6f5]
  - @vercel/oidc@5.0.0

## 0.3.2

### Patch Changes

- Updated dependencies [ec76b68]
  - @vercel/oidc@4.0.0

## 0.3.1

### Patch Changes

- @vercel/oidc@3.8.10

## 0.3.0

### Minor Changes

- 53fa954: Add `signJWT`, which returns `{ token, keyId, algorithm, fingerprint }`. Deprecate `signToken` in favor of `signJWT`. `signMessage` now also returns the signing key's `fingerprint`.

## 0.2.1

### Patch Changes

- @vercel/oidc@3.8.9

## 0.2.0

### Minor Changes

- b6ef92b: `signMessage` now returns `{ signature, keyId, algorithm }` instead of a Flattened JWS, with `signature` as a `Uint8Array`.

### Patch Changes

- @vercel/oidc@3.8.8

## 0.1.3

### Patch Changes

- @vercel/oidc@3.8.7

## 0.1.2

### Patch Changes

- @vercel/oidc@3.8.6

## 0.1.1

### Patch Changes

- @vercel/oidc@3.8.5

## 0.1.0

### Minor Changes

- 08ffe7d: Initial release of `@vercel/kms`: runtime helpers `signToken` and `signMessage` for signing JWTs and raw messages via the Vercel KMS API.
