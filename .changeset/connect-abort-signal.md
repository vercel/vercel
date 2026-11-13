---
'@vercel/connect': minor
---

Accept an optional `signal?: AbortSignal` on `ConnectOptions`, `ConnectAuthorizationOptions`, and `ConnectInstallationOptions`, forwarding it to the underlying `fetch` call in `getToken`, `getTokenResponse`, `revokeToken`, `startAuthorization`, `getConnectorMetadata`, and `experimental_startInstallation`. This lets callers bound or cancel these network calls instead of relying on `Promise.race`, which abandons the promise but leaves the request running. `getTokenResponse` still only writes to its in-process token cache on a successful response, so an aborted call leaves the cache untouched.
