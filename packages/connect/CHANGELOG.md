# @vercel/connect

## 0.1.2

### Patch Changes

- Updated dependencies [fddeb55]
  - @vercel/oidc@3.6.0

## 0.1.1

### Patch Changes

- 5baab3a: Add repository metadata for npm provenance validation.

## 0.1.0

### Minor Changes

- dddcc01: - Add `connect()` helper for Ash via the new `@vercel/connect/ash` subpath. Returned authorization definitions carry a `vercelConnect: { connector }` marker for downstream tooling (requires `experimental-ash >=0.8.2`).
  - Add authorization request device code and expiration fields for Ash authorization challenges.
  - Rename the authorization browser redirect option from `returnUrl` to `callbackUrl`.
  - Map new `/v1/connect/token/:connector` error codes to typed errors: `NoValidTokenError` (renamed from `no_valid_token`), `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`.
  - Add driver-specific metadata field to the token response.

### Patch Changes

- ce16ce7: Preserve Vercel Connect vendor error payloads on Connect errors.
