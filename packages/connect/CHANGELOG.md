# @vercel/connect

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
