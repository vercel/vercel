# @vercel/connect

## 0.1.3

### Patch Changes

- e65b418: Add the JWT bearer token subject type to the public Connect token params and
  allow the Ash helper to customize principal-to-subject mapping.
- 2e15337: Allow `connectSlackCredentials` to forward `ConnectTokenParams` (e.g. `installationId`, `scopes`, `validityBufferMs`) and `ConnectOptions` through to `getToken`. The `subject` field stays pinned to `{ type: 'app' }` so the helper still enforces app-scoped Slack bot tokens.
- 5398562: Add typed support for well-known Connect authorization details.

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
