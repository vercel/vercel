---
'@vercel/connect': patch
---

Surface the connector's human-readable name through authorization challenges. `startAuthorization` now exposes the optional `connectorName` field returned by `POST /v1/connect/authorize/:connector` (eg. `"Salesforce"`), and the Eve `connect()` adapter stamps it onto the `ConnectionAuthorizationChallenge` as `displayName` so channels can render "Sign in with Salesforce" instead of a title-cased file name. Connection authors can override the server-reported name via the new `displayName` option on `connect()`. No behavior change until the Vercel API starts returning `connectorName`.
