---
'@vercel/connect': patch
---

Surface the connector's human-readable name through authorization challenges. `startAuthorization` now exposes the optional `connector` object returned by `POST /v1/connect/authorize/:connector` (matching the `connector` object on the token response), and the Eve `connect()` adapter stamps the service display name (`connector.serviceName`, eg. `"Salesforce"`, falling back to the connector's own `connector.name` for unknown services) onto the `ConnectionAuthorizationChallenge` as `displayName` so channels can render "Sign in with Salesforce" instead of a title-cased file name. Connection authors can override the server-reported name via the new `displayName` option on `connect()`. No behavior change until the Vercel API starts returning `connector`.
