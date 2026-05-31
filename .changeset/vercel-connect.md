---
'@vercel/connect': minor
---

- Add `connect()` helper for Ash via the new `@vercel/connect/ash` subpath. Returned authorization definitions carry a `vercelConnect: { connector }` marker for downstream tooling (requires `experimental-ash >=0.8.2`).
- Rename the authorization browser redirect option from `returnUrl` to `callbackUrl`.
- Map new `/v1/connect/token/:connector` error codes to typed errors: `NoValidTokenError` (renamed from `no_valid_token`), `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`.
- Add driver-specific metadata field to the token response.
