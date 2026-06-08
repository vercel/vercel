---
'@vercel/connect': minor
---

Rename the `connector` identifier parameter to `connectorId` across the public API. This affects the positional argument of `getToken`, `getTokenResponse`, `startAuthorization`, `connectSlackCredentials` (`/eve`), `connectAuthProvider` (`/mcp`, `/ai-sdk`), and the `connect()` helper (`/eve`), as well as the `connector` option on the Auth.js and Better Auth providers and the `connector` field on `ConsentChallenge`, `ConsentRequiredError`, and the Eve `vercelConnect` metadata. The `connector` object on `ConnectTokenResponse` (the resolved connector entity) is unchanged. Update call sites to pass `connectorId`.
