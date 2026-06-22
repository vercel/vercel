# @vercel/connect

## 0.2.6

### Patch Changes

- @vercel/oidc@3.6.2

## 0.2.5

### Patch Changes

- ed811f4: Update the optional AI SDK peer dependency range to accept the `ai@7.0.0` beta line.
- b1c1606: Add a context-aware `createSubject` hook to `connect()` from `@vercel/connect/eve`. The new `createSubject?: (principal, ctx) => ConnectTokenSubject` option receives both the framework-resolved principal and Eve's per-connection authorization context (currently the declared server `url`), unblocking jwt-bearer-style connectors whose subject/assertion needs more than the principal — custom claims, the connection URL, or an audience derived from it. The adapter now threads the `connection` context Eve already passes to `getToken` / `startAuthorization` / `completeAuthorization` (previously dropped) into subject resolution, and the context type is exported as `EveConnectionAuthorizationContext`. Precedence is `createSubject` > `principalToSubject` > default principal mapping; `principalToSubject` keeps working but is now deprecated in favor of `createSubject`.

## 0.2.4

### Patch Changes

- 5aa09b7: Update the Better Auth and Auth.js provider default scopes to request `openid`, `profile`, and `email`.

## 0.2.3

### Patch Changes

- 2f22f21: Add a targeted `deleteTokenCacheEntry(connector, params)` export that drops a single in-process token cache entry, and wire it into the Eve `connect()` adapter as an `evict()` hook. When Eve rejects a resolved bearer (a downstream `401` mapped to `requireAuth()`, or an MCP server rejecting the token) it now cascades invalidation from its own per-step cache down into the Connect adapter's cache, so the next `getToken` performs a genuine refresh instead of re-serving the revoked-but-unexpired token. The `evict()` hook also accepts an opt-in `revoke: true` to tear the grant down at Vercel Connect (refresh token included) for user-initiated disconnects; revocation is best-effort and falls back to a local cache drop on failure.

## 0.2.2

### Patch Changes

- 0afea93: Add an opt-in `validate` flag to the Eve `connect()` adapter (backed by a new `forceRefresh` option on `getToken`/`getTokenResponse`). When set, each `getToken` bypasses the in-process token cache and re-checks Vercel Connect, so a grant the user revoked server-side surfaces as an authorization-required prompt instead of being served as a stale, still-cached bearer.

## 0.2.1

### Patch Changes

- 2988097: Document `ConnectTokenParams.scopes` support for `["*"]` default scopes.
- 585bd2c: Add the `revokeToken` API for revoking Connect tokens by connector and subject.
- b151652: Use the published Eve 0.6 beta package for local type validation and add Connect-backed Eve GitHub and Linear channel credential helpers.

## 0.2.0

### Minor Changes

- 1701fc0: Add `@vercel/connect/ai-sdk` and `@vercel/connect/mcp` subpath entrypoints
  for native Vercel AI SDK and Model Context Protocol integration.

  `connectAuthProvider(connector, params)` returns an MCP-spec
  `OAuthClientProvider` that delegates token issuance to Vercel Connect and
  surfaces consent challenges as a typed `ConsentRequiredError` (or via an
  `onConsentRequired` callback). Works with `@ai-sdk/mcp@^1`, `@ai-sdk/mcp@^2`,
  and the official MCP TypeScript SDK.

  Both `ai` and `@ai-sdk/mcp` are optional peer dependencies — importing the
  adapter subpaths requires them, but the rest of `@vercel/connect` is
  unaffected.

- 0fd543a: Narrow the `@vercel/connect/eve` interactive-authorization contract to match Eve's narrowed `InteractiveAuthorizationDefinition`. `startAuthorization` now returns only `{ challenge }` (the journaled `state` is gone), so a Connect-backed session no longer carries OAuth secrets across a workflow step boundary. Runtime behavior is unchanged — Connect still re-polls `getTokenResponse(connector, principal)` in `completeAuthorization`.

  Breaking public-type change: the `ConnectAuthorizationState` type is removed and `connect()` no longer parameterizes `InteractiveAuthorizationDefinition`.

- c7da77b: Rename the Vercel Connect Ash adapter to Eve.

### Patch Changes

- Updated dependencies [01cf6c2]
  - @vercel/oidc@3.6.1

## 0.1.3

### Patch Changes

- e65b418: Add the JWT bearer token subject type to the public Connect token params and
  allow the Eve helper to customize principal-to-subject mapping.
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

- dddcc01: - Add `connect()` helper for Eve via the new `@vercel/connect/eve` subpath. Returned authorization definitions carry a `vercelConnect: { connector }` marker for downstream tooling (requires `eve >=0.8.2`).
  - Add authorization request device code and expiration fields for Eve authorization challenges.
  - Rename the authorization browser redirect option from `returnUrl` to `callbackUrl`.
  - Map new `/v1/connect/token/:connector` error codes to typed errors: `NoValidTokenError` (renamed from `no_valid_token`), `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`.
  - Add driver-specific metadata field to the token response.

### Patch Changes

- ce16ce7: Preserve Vercel Connect vendor error payloads on Connect errors.
