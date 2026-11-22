# @vercel/connect

## 2.5.6

### Patch Changes

- @vercel/oidc@4.0.4

## 2.5.5

### Patch Changes

- 314fba0: eve channel credential helpers now only accept Connect-forwarded webhooks whose Vercel OIDC token matches the deployment's project and environment, and `createConnectWebhookVerifier()` now rejects audience-exchanged tokens.

## 2.5.4

### Patch Changes

- @vercel/oidc@4.0.3

## 2.5.3

### Patch Changes

- @vercel/oidc@4.0.2

## 2.5.2

### Patch Changes

- 99f8fae: Align experimental MCP subscription creation with Connect's required `ttlMs` duration or `null` for indefinite watches. This breaks the experimental `expiresAt` creation input in direct calls and the AI SDK/eve adapter; update callers to use `ttlMs` and matching AI SDK/eve releases. Subscription responses retain the server-calculated `expiresAt`.

## 2.5.1

### Patch Changes

- 0854ada: Document using a Passport identity from `requireIdentity` as the subject for `getToken`.

## 2.5.0

### Minor Changes

- 1e9cee9: Add an experimental Connect-managed events adapter for AI SDK, with resolved account scope and no event store dependency. The experimental helper now returns a synchronous `createAdapter({ transport })` factory instead of bound operations, matching AI SDK #22325. Pass an optional `mcpUrl` to override the transport endpoint; direct callers must call `createAdapter()` before using subscription operations.
- 7a77164: Add experimental MCP subscription management with nested ConnectTokenParams, ID-based lookup with optional ownership assertions, explicit monitoring lifetime, scoped inspection/cancellation, and bounded requests. Optional `mcpUrl` selects the authorized upstream endpoint for discovery and subscription creation.

### Patch Changes

- 4fa90e1: Align experimental event catalog discovery with the Connect backend and forward the selected MCP resource URL. Subscription listing now returns `pagination.next`; the AI SDK and eve adapters translate it to their existing `nextCursor` contract, including empty filtered pages.
- 4fa90e1: Expose an experimental events bridge on eve Connect authorization providers, reusing the authorized subject and token constraints for managed subscriptions and Connect delivery verification. Bind event operations to the connection URL through the AI SDK transport-context factory without requiring a second URL in eve configuration.
- d032cfb: Add experimental Connect event delivery authentication scoped to project, environment, registered path, preview branch and delivery purpose, with envelope schema validation. Distinguish OIDC identity failures from temporary signing-key outages.

  Preserve optional MCP event metadata and opaque cursors within the total delivery body limit.

- Updated dependencies [d032cfb]
  - @vercel/oidc@4.0.1

## 2.4.1

### Patch Changes

- 90f2ad7: Require patched Auth.js core (0.41.3 or newer) for the optional Auth.js adapter.

## 2.4.0

### Minor Changes

- edbf428: Allow token subjects to omit `type` and infer `type: 'token'` before sending Connect requests. Refine Passport identity types so verified identities have a string token.

### Patch Changes

- Updated dependencies [ec76b68]
  - @vercel/oidc@4.0.0

## 2.3.6

### Patch Changes

- @vercel/oidc@3.8.10

## 2.3.5

### Patch Changes

- 346f472: Add experimental identity provider support to user subjects.

## 2.3.4

### Patch Changes

- 55594c7: Include the OIDC project ID and environment alongside the team ID in Auth.js and Better Auth authorization URLs, preferring the custom environment ID when present.

## 2.3.3

### Patch Changes

- 77bac19: Expose complete external-resource requirement metadata from eve connection and Slack credential helpers while preserving connector-only metadata compatibility.
- dde48e0: Add an experimental manifest compiler API that converts eve external-resource snapshots into Connect manifests during builds.

## 2.3.2

### Patch Changes

- @vercel/oidc@3.8.9

## 2.3.1

### Patch Changes

- 71b55b4: Require eve 0.39.1 or newer for the optional eve integration, aligning the peer range with the supported minimum and the version used to build and test the adapter.

## 2.3.0

### Minor Changes

- 6be8817: Add `@vercel/connect/tanstack-ai`: `connectMCPTransport` builds a `@tanstack/ai-mcp` transport config with a Vercel Connect `authProvider`, raising the consent challenge eagerly on Streamable HTTP and via the MCP-spec 401 flow on SSE and refusing HTTP redirects by default, plus `getConsentChallenge` / `isConsentRequiredError` helpers for unwrapping `MCPConnectionError` (also exported from `/mcp` and `/ai-sdk`). The shared MCP adapter gains a `consent: 'transport' | 'eager'` option (default unchanged), returns a self-contained `ConnectOAuthClientProvider` type assignable to both `@ai-sdk/mcp` and `@modelcontextprotocol/sdk` (optional members of `@ai-sdk/mcp`'s interface are no longer part of the return type), reports a non-empty `redirectUrl` placeholder so the official SDK stays on the interactive consent path instead of its client-credentials branch, and implements the official SDK's `discoveryState` hook so a compromised MCP server cannot steer OAuth discovery fetches to private-network URLs.

## 2.2.0

### Minor Changes

- 793f162: Add `connectTeamsAdapter` for Chat SDK Microsoft Teams bots, with lazy app identity, Bot Framework and Microsoft Graph tokens, and Vercel OIDC verification for Connect-forwarded webhooks.

### Patch Changes

- @vercel/oidc@3.8.8

## 2.1.0

### Minor Changes

- a020e37: Add `connectTeamsCredentials` for Eve Microsoft Teams channels. The helper resolves the managed bot application ID and short-lived Bot Framework tokens through Vercel Connect, and verifies Connect-forwarded activities with Vercel OIDC.

## 2.0.4

### Patch Changes

- @vercel/oidc@3.8.7

## 2.0.3

### Patch Changes

- @vercel/oidc@3.8.6

## 2.0.2

### Patch Changes

- c028593: Update the Core SDK documentation to show how to start an authorization request.

## 2.0.1

### Patch Changes

- 2ecb357: `connectGitHubCredentials` now resolves the GitHub App slug from the connector's metadata and exposes it as `appSlug` on the returned credentials, so eve's `githubChannel` can derive its invocation token (`botName`) without extra configuration.

## 2.0.0

### Major Changes

- 42938f9: Make Eve connector provisioning opt-in with `autoProvision: true`. When enabled, try token and authorization requests before provisioning, then provision and retry once only when the connector is missing or not linked to the project.

## 1.1.0

### Minor Changes

- b9fab7c: Add Sendblue credential helpers for Eve-native channels and the Chat SDK adapter, including Connect trigger-forwarded webhook verification for Chat SDK users.

## 1.0.0

### Major Changes

- 9b55136: Default omitted scopes to `['*']` in token and authorization requests.

### Minor Changes

- 4199902: Send Vercel API requests to the region from `VERCEL_REGION`, with a `region` option to override it.

## 0.9.0

### Minor Changes

- 46a5aaa: Add Linq helpers for Eve and Chat SDK applications. `connectLinqCredentials` resolves an app-scoped Linq API key, and `connectLinqAdapter` adds trusted Connect OIDC verification for trigger-forwarded Linq webhooks while retaining the provider signing secret within Connect.

## 0.8.1

### Patch Changes

- @vercel/oidc@3.8.5

## 0.8.0

### Minor Changes

- 9476255: Add `connectNotionAdapter` for outbound Chat SDK Notion credentials while retaining native webhook verification.
- 52de67d: Add `connectTelegramAdapter` for outbound Chat SDK Telegram credentials while retaining native webhook verification or polling.

## 0.7.0

### Minor Changes

- fff606d: Add `connectDiscordAdapter` for Chat SDK Discord credentials and Connect-verified webhooks.

### Patch Changes

- 52b82cc: Allow authorization callers to pass an OAuth prompt to the connector's authorization server.
- Updated dependencies [2da7809]
  - @vercel/oidc@3.8.4

## 0.6.2

### Patch Changes

- @vercel/oidc@3.8.3

## 0.6.1

### Patch Changes

- 6d7fbfa: Bump all workspace packages to trigger a full publish from vercel-internal.
- Updated dependencies [6d7fbfa]
  - @vercel/oidc@3.8.2

## 0.6.0

### Minor Changes

- 8bd3687: Add `connectDiscordCredentials` to the eve integration, resolving Discord bot tokens and application IDs from app-scoped Connect credentials while verifying forwarded interactions with Vercel OIDC.

## 0.5.0

### Minor Changes

- 72d6d55: Add `connectPhotonCredentials` for resolving app-scoped Photon project credentials from a Vercel Connect connector.
- 9ac74f0: Adding `getConnectorMetadata()` to `@vercel/connect` SDK

## 0.4.3

### Patch Changes

- f999343: Add token exchange subjects to `ConnectTokenParams`.
- 726c7b4: Add `experimental_startInstallation` for creating Vercel Connect installation requests.
  - @vercel/oidc@3.8.1

## 0.4.2

### Patch Changes

- 0be0e28: Adding support for authorization mode override via env var.

## 0.4.1

### Patch Changes

- dad41da: Test Connect against a recent stable Eve and AI SDK 7 release.

## 0.4.0

### Minor Changes

- c636d67: Add optional `claims` field to `ConnectTokenResponse` for allow-listed upstream OAuth token claims

## 0.3.3

### Patch Changes

- 0cc0e8d: Expose and document the per-issuance `tokenId` on `ConnectTokenResponse` (returned by `getToken`/`getTokenResponse`). It's a stable identifier for the issued token — new on each issuance/refresh — for correlating a token with its usage in Vercel observability/billing data.

## 0.3.2

### Patch Changes

- 2f8d81f: Surface the connector's human-readable name through authorization challenges. `startAuthorization` now exposes the optional `connector` object returned by `POST /v1/connect/authorize/:connector` (matching the `connector` object on the token response), and the Eve `connect()` adapter stamps the service display name (`connector.serviceName`, eg. `"Salesforce"`, falling back to the connector's own `connector.name` for unknown services) onto the `ConnectionAuthorizationChallenge` as `displayName` so channels can render "Sign in with Salesforce" instead of a title-cased file name. Connection authors can override the server-reported name via the new `displayName` option on `connect()`. No behavior change until the Vercel API starts returning `connector`.

## 0.3.1

### Patch Changes

- Updated dependencies [d29a8f9]
  - @vercel/oidc@3.8.0

## 0.3.0

### Minor Changes

- aa64ac7: Add the `@vercel/connect/chat` subpath with adapter helpers for the Chat SDK (`chat`). `connectSlackAdapter`, `connectGitHubAdapter`, and `connectLinearAdapter` each return a config fragment you spread into the matching `create*Adapter` factory, wiring a Connect connector for both outbound app-scoped tokens (`getToken` with `subject: { type: 'app' }`) and inbound trigger-forwarded webhooks (Vercel OIDC verification via the exported `createConnectWebhookVerifier`). The subpath has no runtime dependency on `@chat-adapter/*` — it returns structural config types.

## 0.2.10

### Patch Changes

- 0a3bbd7: Pass eve authorization webhooks through to Vercel Connect so OAuth failures can resume the eve session.
- f2475bd: Add default-on first-use connector provisioning to `connect()` from `@vercel/connect/eve`. When the helper runs inside a Vercel deployment, it now posts the eve connection URL and connector UID to the managed OAuth create/link endpoint before token or consent calls, so Connect can create a missing connector or link an existing one to the OIDC project and eligible environments. Pass `autoProvision: false` to keep managing the connector link manually.
- Updated dependencies [fb93ff6]
  - @vercel/oidc@3.7.1

## 0.2.9

### Patch Changes

- dd77402: Bump the optional `eve` peer dependency for `@vercel/connect/eve` to the next eve patch release that accepts the `auth.evict` hook emitted by Vercel Connect helpers.

## 0.2.8

### Patch Changes

- 64e3219: Allow local Connect authorization callbacks to use `http://*.localhost` URLs.

## 0.2.7

### Patch Changes

- Updated dependencies [415fde0]
  - @vercel/oidc@3.7.0

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
