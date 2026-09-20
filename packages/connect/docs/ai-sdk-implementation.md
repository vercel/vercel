# Native AI SDK integration for `@vercel/connect` — implementation plan

**Status:** proposal
**Scope:** SDK changes in `vercel/vercel/packages/connect` + the example app that smoke-tests them in `vercel/ai/examples/`.
**Companion doc:** [`ai-sdk-content.md`](./ai-sdk-content.md) plans the docs work that ships alongside this — the V0 docs-only path, the `vercel-docs` guides, and the `vercel/ai` cookbook recipe and reference cross-link.
**Target release:** `@vercel/connect@0.2` — primary subpath `@vercel/connect/ai-sdk` (the AI SDK audience is the headline), with `@vercel/connect/mcp` shipping alongside it in V1 as an accurate-to-scope home for non-AI-SDK MCP clients (Mastra, official MCP TS SDK, etc.). V2 extends `/ai-sdk` with HITL glue.
**Prerequisites:** `@ai-sdk/mcp` shipped with `OAuthClientProvider` (already in `vercel/ai`, see [`packages/mcp/src/tool/oauth.ts`](https://github.com/vercel/ai/blob/main/packages/mcp/src/tool/oauth.ts)); `streamText`/`generateText` `toolApproval` configuration (added in AI SDK v7, see [`packages/ai/src/generate-text/stream-text.ts`](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/stream-text.ts)); MCP-spec `OAuthClientProvider` interface (in [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/auth.ts), which the AI SDK borrows from).

### AI SDK version compatibility

| Phase | `ai` peer dep | `@ai-sdk/mcp` peer dep | Notes |
| ----- | ------------- | ---------------------- | ----- |
| V0 (docs)  | `^6 \|\| ^7` | `^1 \|\| ^2`           | Bearer-header pattern; just calls `getToken()` plus `createMCPClient({ transport: { headers } })`. Works on both v6 and v7. |
| V1 (`/ai-sdk` + `/mcp` adapter) | `^6 \|\| ^7` | `^1 \|\| ^2` | `connectAuthProvider` ships at both subpaths in V1. `/ai-sdk` is the primary surface for the AI SDK audience; `/mcp` re-exports the same function for non-AI-SDK MCP clients. The `OAuthClientProvider` interface is identical between `@ai-sdk/mcp@1.x` (paired with `ai@6`) and `@ai-sdk/mcp@2.x` (paired with `ai@7`) — see verification subsection — so a single implementation satisfies both. |
| V2 (`/ai-sdk` HITL) | `^7` only    | `^2` only              | `withConsentApproval` lands at `/ai-sdk` only — this layer is intentionally AI-SDK-specific. `toolApproval` is a **v7-only primitive**. v6's per-tool `needsApproval` was deprecated in v7's migration guide. We don't attempt to backport. |

**v7 release status as of 2026-06-03:** `latest: 6.0.196`, `beta: 7.0.0-beta.116`, `canary: 7.0.0-canary.162`. v7 is in active beta but has not promoted to `latest`. V2 implicitly waits on v7 stable. V0 and V1 can ship today against v6 `latest` and forward-compat with v7 betas.

## Background

Two viable shapes for a Connect + AI SDK integration:

1. **Docs-only**: `getToken` + `createMCPClient` with the token threaded through `headers`. Works today with zero new code.
2. **Adapter**: `connectAuthProvider` that plugs into `createMCPClient`'s `authProvider` slot and refreshes tokens transparently across the lifetime of the MCP client.

The open question on the adapter shape has been interactivity — can the integration support an interactive consent flow when a tool call requires a user grant that hasn't been issued yet? The AI SDK ships `toolApproval` configuration on `streamText`/`generateText` (already in tree), which gives us the HITL primitive we need; this doc plans the work in three releasable slices that take advantage of it.

## Scope: AI SDK first, MCP-spec compatibility for free

The headline integration is **AI SDK**. That's the audience we're chasing: Next.js + AI SDK developers building agents who today have to glue OAuth + token storage + token refresh + MCP plumbing together by hand. Every doc, recipe, example, and import path in this plan is shaped around making *their* experience one-line.

The lucky shape of the problem is that the AI SDK's `@ai-sdk/mcp` package authenticates MCP servers through an MCP-spec `OAuthClientProvider` interface — borrowed from [`modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/src/client/auth.ts) and shared with other MCP clients (Mastra's `MCPOAuthClientProvider`, the official MCP TS SDK's `Client.connect(transport)`, etc.). So the same adapter that powers the AI SDK integration **also** plugs into any other MCP client without a second implementation. That's a bonus, not the headline — but it's a real one, and we'd be silly to give up the naming that captures it.

### Subpath split

| Subpath                       | Audience                                          | Ships  | What's there                                                                                                |
| ----------------------------- | ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `@vercel/connect/ai-sdk`      | **AI SDK users (primary)**                        | V1     | `connectAuthProvider` + `ConsentRequiredError` + `ConsentChallenge` (re-exported from `/mcp`).               |
| `@vercel/connect/ai-sdk`      | **AI SDK users (primary)**                        | V2     | Adds `withConsentApproval` for `toolApproval`-based HITL + future `<ConnectConsentBoundary>` React glue.    |
| `@vercel/connect/mcp`         | Non-AI-SDK MCP clients (Mastra, official MCP SDK) | V1     | Canonical home for `connectAuthProvider`. Same function the `/ai-sdk` subpath re-exports.                    |

Every AI SDK doc, cookbook recipe, and example imports from `@vercel/connect/ai-sdk` — that's the only path AI SDK readers ever need to see. The `/mcp` subpath is a quiet second door for MCP-spec consumers; its existence is what lets "MCP is nice too" stay true without polluting the AI SDK surface.

The split is essentially free at implementation time (one extra one-line re-export) and locks in audience-aligned naming. Subpaths are forever; doing this now avoids a future "should we have called it `/ai-sdk`?" rename.

### Use-case → entry-point map

| Use case                                                                            | Entry point                                                       | When it ships |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| **AI SDK `createMCPClient` + `streamText`/`generateText`**                          | `connectAuthProvider` from `@vercel/connect/ai-sdk`               | V1            |
| **AI SDK `streamText`/`generateText` HITL tool approval**                           | `withConsentApproval` from `@vercel/connect/ai-sdk`               | V2            |
| AI SDK custom `tool({ execute })` that calls a provider API directly                | `getToken()` from `@vercel/connect` root — already there          | Today         |
| React consent-prompt UI in an AI SDK chat                                           | `<ConnectConsentBoundary>` from `@vercel/connect/ai-sdk`          | V3 (deferred) |
| Mastra / official MCP TS SDK / any other MCP client with an `OAuthClientProvider` slot | `connectAuthProvider` from `@vercel/connect/mcp` (same impl)   | V1            |
| Server cron, webhook, background job needing a provider bearer token                | `getToken()` from `@vercel/connect` root — already there          | Today         |
| Bearer-token `fetch` wrapper that auto-translates consent errors                    | *No subpath* — root `getToken()` is enough; revisit if signal     | Deferred      |

### Interface drift between AI SDK and official MCP SDK

The AI SDK's `OAuthClientProvider` and the official MCP TS SDK's `OAuthClientProvider` are ~95% identical. Two small drifts observed:

- AI SDK: `get redirectUrl(): string | URL` (required, non-undefined).
- Official MCP SDK: `get redirectUrl(): string | URL | undefined` (allows undefined for non-interactive flows like client_credentials / jwt-bearer).

The narrower AI SDK shape is a subtype of the official shape, so a single implementation returning a non-undefined `string | URL` satisfies both. The V1 implementer should write the adapter against the AI SDK's stricter shape (so the type-check is tight) and verify it satisfies the official MCP SDK's looser shape via a TypeScript compatibility test. If the interfaces diverge further over time, we can ship two facade entry points (`/mcp/ai-sdk` and `/mcp/official`) without breaking the existing one.

### Interface stability across `@ai-sdk/mcp@1.x` and `@ai-sdk/mcp@2.x` (verified)

Pulled and diffed both published tarballs on 2026-06-03:

```
$ diff @ai-sdk/mcp@1.0.46/dist/index.d.ts @ai-sdk/mcp@2.0.0-beta.37/dist/index.d.ts | wc -l
30
```

The 30-line delta touches **none** of `OAuthClientProvider`, `OAuthTokens`, `OAuthClientMetadata`, `OAuthClientInformation`, `AuthorizationServerMetadata`, `UnauthorizedError`, or the `auth()` function. The interface declarations (lines 146–188 in both files) are byte-for-byte identical. The actual deltas:

- `MCPTransport.protocolVersion?` field removed in v2
- `MCPTransportConfig.redirect` default changed `'follow'` → `'error'` in v2
- `resource_link` content block variant removed in v2
- Deprecated `clientName` shim removed in v2

**Conclusion: a single `connectAuthProvider` implementation satisfies both `@ai-sdk/mcp@1.x` (paired with `ai@6`) and `@ai-sdk/mcp@2.x` (paired with `ai@7`). The peer dep `^1 || ^2` is safe, no facade split needed.** Re-verify if a future v3 ships.

## Motivation

Today, a Next.js + AI SDK developer who wants an agent to call provider APIs has to do all of:

1. Set up an OAuth client per provider (Slack app, GitHub app, Linear OAuth client, …).
2. Persist per-user OAuth grants in their own database.
3. Refresh tokens themselves.
4. Wire MCP clients (or write `fetch` wrappers) separately.

Vercel Connect already solves 1–3 server-side. The gap is a one-line bridge to `@ai-sdk/mcp` so the AI SDK can inherit Connect's auth instead of asking developers to plumb tokens through manually.

The `@vercel/connect` package already ships parallel adapters for adjacent ecosystems (`@vercel/connect/ash`, `@vercel/connect/betterauth`, `@vercel/connect/authjs`). The AI SDK adapter is the fourth in that family.

## Two integration models (for reference)

The Better Auth and Auth.js adapters treat Connect as an **OAuth IdP** — users sign in *through* Connect, which acts as the upstream authorization server. That model lives at `@vercel/connect/betterauth` and `@vercel/connect/authjs`.

This document is about the second model: **Connect as a per-user token broker for MCP servers, shaped around the AI SDK**. The host app already knows who the user is (Clerk, NextAuth, custom), and the AI SDK needs a bearer token to put in the MCP `Authorization` header. That's what `@vercel/connect/ai-sdk` provides (with the canonical `OAuthClientProvider` impl living at `@vercel/connect/mcp` so non-AI-SDK MCP clients get it too). The V2 layer at `@vercel/connect/ai-sdk` adds AI-SDK-specific glue for `toolApproval` and React UI.

The two models compose — an app can use Better Auth to sign users in *and* this adapter to mint MCP bearer tokens for the same user.

## Non-goals

- Not a wrapper around `createMCPClient`. The adapter only provides the `authProvider`; consumers still call `createMCPClient` themselves so every MCP feature (resources, prompts, elicitation, schema definition) keeps working unchanged.
- Not a tool catalog. We don't curate or proxy tools; the MCP server is the source of truth (in contrast to Composio).
- Not a replacement for AI Gateway. `model: 'anthropic/claude-sonnet-4.6'` continues to flow through the Gateway as today; this adapter is orthogonal to model selection.
- Not a Workflow DevKit primitive. Long-lived multi-step agents that need durable resumption should keep using `DurableAgent`; this adapter is for in-process `streamText`/`generateText` calls.

## Shape inventory

### What Vercel Connect already has

- `getToken(connector, params, options?)` / `getTokenResponse(...)` — token exchange with server-side cache; throws `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`, `NoValidTokenError`.
- `startAuthorization(connector, params, options?)` — returns `{ url, request, verifier }`; `url` is the consent URL to redirect a user to.
- Typed error classes exported from `@vercel/connect`.

### What `@ai-sdk/mcp` already has

From [`packages/mcp/src/tool/oauth.ts:33-92`](https://github.com/vercel/ai/blob/main/packages/mcp/src/tool/oauth.ts):

```ts
export interface OAuthClientProvider {
  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined>;
  saveTokens(tokens: OAuthTokens): void | Promise<void>;
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
  saveCodeVerifier(codeVerifier: string): void | Promise<void>;
  codeVerifier(): string | Promise<string>;
  addClientAuthentication?(headers, params, url, metadata?): void | Promise<void>;
  invalidateCredentials?(scope: 'all' | 'client' | 'tokens' | 'verifier'): void | Promise<void>;
  get redirectUrl(): string | URL;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): OAuthClientInformation | undefined | Promise<OAuthClientInformation | undefined>;
  saveClientInformation?(clientInformation: OAuthClientInformation): void | Promise<void>;
  // ... optional state/storedState helpers
}
```

Both the HTTP and SSE transports use it the same way (`packages/mcp/src/tool/mcp-http-transport.ts:91-94`):

```ts
if (this.authProvider) {
  const tokens = await this.authProvider.tokens();
  if (tokens?.access_token) {
    headers['Authorization'] = `Bearer ${tokens.access_token}`;
  }
}
```

And on 401 (`mcp-http-transport.ts:183-185`), the transport calls the full `auth(authProvider, …)` orchestrator which can trigger `redirectToAuthorization`, dynamic client registration, etc.

### What `streamText`/`generateText` already has for HITL

From [`packages/ai/src/generate-text/stream-text.ts:410`](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/stream-text.ts):

```ts
toolApproval?: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>;
```

Per the existing tests, the shape is:

```ts
streamText({
  // ...
  tools: { searchIssues: tool({ ... }) },
  toolApproval: { searchIssues: 'user-approval' },
});
```

On a flagged tool call, the SDK emits a tool-approval chunk through the stream and waits for an approval/denial decision; denied calls produce an `execution-denied` tool result the model can react to.

### What needs to be built

Two new subpath exports, split by audience:

- **`@vercel/connect/ai-sdk`** (V1 primary surface, extended in V2): AI SDK developers' entry point. In V1, re-exports `connectAuthProvider` + `ConsentRequiredError` + `ConsentChallenge` so AI SDK users only need to know one import path. In V2, adds `withConsentApproval` (auto-wraps tools with `toolApproval: 'user-approval'` for the AI SDK's HITL flow) and eventually `<ConnectConsentBoundary>` (V3 React glue).
- **`@vercel/connect/mcp`** (V1): canonical home for `connectAuthProvider` — implements MCP-spec `OAuthClientProvider` by delegating to `getToken` and `startAuthorization`. Same function the `/ai-sdk` subpath re-exports; exists at this path so MCP-only consumers (Mastra, official MCP TS SDK, etc.) can import from a name that accurately reflects what the function is.

### `package.json` delta

Mirrors the existing pattern for `@vercel/connect/{ash,betterauth,authjs}` — each adapter declares its upstream as an **optional peer dependency** so installing `@vercel/connect` doesn't force unrelated downloads, and pins a dev dependency so the workspace can type-check and build:

```diff
 "exports": {
   ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
   "./ash":        { "types": "./dist/ash/index.d.ts",        "default": "./dist/ash/index.js" },
   "./betterauth": { "types": "./dist/betterauth/index.d.ts", "default": "./dist/betterauth/index.js" },
   "./authjs":     { "types": "./dist/authjs/index.d.ts",     "default": "./dist/authjs/index.js" },
+  "./mcp":        { "types": "./dist/mcp/index.d.ts",        "default": "./dist/mcp/index.js" },
+  "./ai-sdk":     { "types": "./dist/ai-sdk/index.d.ts",     "default": "./dist/ai-sdk/index.js" }
 },
 "peerDependencies": {
   "@auth/core": ">=0.37.0",
   "better-auth": ">=1.5.0",
-  "experimental-ash": ">=0.8.2"
+  "experimental-ash": ">=0.8.2",
+  "@ai-sdk/mcp": "^1 || ^2",
+  "ai": "^6 || ^7"
 },
 "peerDependenciesMeta": {
   "@auth/core":        { "optional": true },
   "better-auth":       { "optional": true },
-  "experimental-ash":  { "optional": true }
+  "experimental-ash":  { "optional": true },
+  "@ai-sdk/mcp":       { "optional": true },
+  "ai":                { "optional": true }
 },
 "devDependencies": {
   "@auth/core": "0.37.4",
   "better-auth": "1.5.5",
   "experimental-ash": "0.31.0",
+  "@ai-sdk/mcp": "2.0.0-beta.37",
+  "ai": "7.0.0-beta.116",
   "typescript": "^5"
 }
```

**Why optional:**

- Mastra users who only import `@vercel/connect/mcp` shouldn't be forced to install `ai`.
- AI SDK users who only import `@vercel/connect/ai-sdk` need both `@ai-sdk/mcp` (for the `OAuthClientProvider` interface and `createMCPClient`) and `ai` (for `streamText` / `toolApproval` types in V2).
- Service-to-service consumers who only use the root `@vercel/connect` for `getToken` need neither.

This matches the existing per-adapter optionality. Installing `@vercel/connect` is still zero extra dependencies for the root use case; each adapter adds its own peers only when imported.

**Why `ai: ^6 || ^7` not `^7` only:**

V1 supports both v6 and v7 (per the AI SDK version compatibility matrix). V2's `withConsentApproval` requires `ai@^7` for the `toolApproval` primitive, but enforcing that via the package-level peer dep would break v6 users who only use V1's `connectAuthProvider`. Instead, V2 enforces v7 at the type level: importing `withConsentApproval` against `ai@6` produces a clear TS error ("`toolApproval` is not a property of `streamText` options"). When `ai@6` is EOL'd we can tighten the peer dep to `^7` in a minor release.

**Dev-dep pins:** match the versions used by the verified interface stability diff (see "Interface stability" subsection) so the type-check CI run reflects the contract the plan commits to. Bump in Changesets when the AI SDK promotes new versions.

## V0 — there is no SDK work

V0 is a docs-only path that uses the existing `getToken` surface. It ships before this plan ever lands. Owned by [`ai-sdk-content.md`](./ai-sdk-content.md). Mentioned here only so the V1 → V2 → V3 numbering reads as a continuation.

V0's limitations are what motivate V1:

- Token is resolved once at client init; if it expires mid-conversation, the MCP client must be rebuilt.
- Consent gating runs upfront; a tool call cannot trigger consent mid-stream.
- The consumer writes the `try { … } catch (UserAuthorizationRequiredError)` boilerplate per integration.

## V1: `@vercel/connect/ai-sdk` (primary) + `@vercel/connect/mcp`

Two subpath exports backed by one implementation, mirroring the shape of the existing `@vercel/connect/ash`, `/betterauth`, and `/authjs` subpaths — same `exports` map convention, same **optional peer dependency** pattern via `peerDependenciesMeta` (see [§`package.json` delta](#packagejson-delta) below), same Changeset workflow for upstream version bumps. Nothing novel about the package shape; the AI SDK adapter slots into the established adapter family.

- **`@vercel/connect/ai-sdk`** is the only path AI SDK docs, recipes, and examples reference. It re-exports `connectAuthProvider`, `ConsentRequiredError`, and `ConsentChallenge` from `/mcp`.
- **`@vercel/connect/mcp`** owns the canonical implementation. Its existence as a separately-named subpath is what lets Mastra, the official `@modelcontextprotocol/typescript-sdk`, and any other MCP-spec client import from an accurate path. AI SDK users never need to know `/mcp` exists.

Same returned object in both cases — an `OAuthClientProvider` that works with any MCP client consuming the MCP-spec interface.

### Public API

```ts
// OAuthClientProvider is the MCP-spec interface; @ai-sdk/mcp re-exports it.
import type { OAuthClientProvider } from '@ai-sdk/mcp';
import type { ConnectTokenParams } from '@vercel/connect';

export interface ConnectAuthProviderOptions {
  /** Override the Vercel OIDC token fetcher (tests / non-Vercel runtimes). */
  readonly getVercelOidcToken?: () => Promise<string>;
  /**
   * Called when Vercel Connect reports that the user has not yet authorized
   * the connector. The caller decides how to surface the consent URL —
   * `redirect()`, throw a typed error, emit a custom UI chunk, etc.
   *
   * Defaults to throwing `ConsentRequiredError` so callers can handle it
   * with a single try/catch at the boundary.
   */
  readonly onConsentRequired?: (challenge: ConsentChallenge) => void | Promise<void>;
}

export interface ConsentChallenge {
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
  readonly redirectUrl: string;
  readonly request: string;
  readonly verifier: string;
}

export class ConsentRequiredError extends Error {
  readonly name: 'ConsentRequiredError';
  readonly redirectUrl: string;
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
}

export function connectAuthProvider(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthProviderOptions,
): OAuthClientProvider;
```

### Usage

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { connectAuthProvider, ConsentRequiredError } from '@vercel/connect/ai-sdk';
import { streamText, stepCountIs } from 'ai';
import { redirect } from 'next/navigation';

try {
  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: 'https://mcp.linear.app',
      authProvider: connectAuthProvider('oauth/linear', {
        subject: { type: 'user', id: userId },
        scopes: ['read'],
      }),
    },
  });

  const stream = await streamText({
    model: 'anthropic/claude-sonnet-4.6',
    prompt: 'Triage my Linear inbox',
    tools: await mcpClient.tools(),
    stopWhen: stepCountIs(10),
    onFinish: async () => { await mcpClient.close(); },
  });
} catch (err) {
  if (err instanceof ConsentRequiredError) {
    redirect(err.redirectUrl);
  }
  throw err;
}
```

### Method-by-method delegation

Most of the `OAuthClientProvider` surface is dead code in our adapter, because Vercel Connect owns client registration, PKCE, state, and the callback handshake server-side. The shim only needs to implement the methods the MCP transport actually exercises.

| `OAuthClientProvider` method     | Adapter implementation                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens()`                       | `await getToken(connector, params)`. Wrap in `{ access_token, token_type: 'Bearer' }`. On `UserAuthorizationRequiredError` return `undefined` so the transport triggers `authorizeOnce()` and lands in `redirectToAuthorization`. On `ConnectorInstallationRequiredError` re-throw (configuration problem, not a per-user issue).   |
| `redirectToAuthorization(_url)`  | Ignore the URL argument from the AI SDK's discovery flow (Connect has its own consent URL). Call `startAuthorization(connector, params)`, build a `ConsentChallenge`, then either invoke `onConsentRequired(challenge)` or throw `ConsentRequiredError`. Either way, the MCP transport's `auth()` orchestrator unwinds the stream. |
| `saveTokens(_tokens)`            | No-op. Connect owns token persistence server-side.                                                                                                                                                                                                                                                                                  |
| `saveCodeVerifier(_v)`           | No-op. Connect owns PKCE.                                                                                                                                                                                                                                                                                                           |
| `codeVerifier()`                 | Throw a typed `UnsupportedOperationError`. The MCP transport never reaches this when our `tokens()`/`redirectToAuthorization` are wired correctly.                                                                                                                                                                                  |
| `redirectUrl` (getter)           | Returns the connector's registered callback URL, or `''` if unknown. Optional; included for completeness only.                                                                                                                                                                                                                      |
| `clientMetadata` (getter)        | Returns a minimal `OAuthClientMetadata` with `redirect_uris: []`. The MCP transport reads this only during dynamic client registration, which we never trigger.                                                                                                                                                                     |
| `clientInformation()`            | Returns `{ client_id: connector }` (the Connect UID acts as the logical client id).                                                                                                                                                                                                                                                 |
| `invalidateCredentials(scope)`   | When called, invalidate the Connect SDK's LRU cache entry for `(connector, subject)` so the next `tokens()` call hits Connect fresh. No remote revocation — that is the user's responsibility via the dashboard or a separate CLI.                                                                                                  |
| `addClientAuthentication?`       | Not implemented. Connect handles client auth on its side.                                                                                                                                                                                                                                                                           |
| `saveClientInformation?`         | Not implemented.                                                                                                                                                                                                                                                                                                                    |
| `state`/`saveState`/`storedState`| Not implemented. Connect manages the OAuth state parameter.                                                                                                                                                                                                                                                                         |

**Implementation footprint:** ≈80–120 lines, mostly types. The hot path is `tokens()`; everything else is either a no-op, a small data return, or a typed error.

### Token refresh during long conversations

The MCP transport calls `tokens()` before each request, so a token that expires mid-conversation is transparently refreshed on the next call. Connect's existing LRU cache returns the cached token until shortly before expiry and refreshes server-side; the adapter inherits that behavior for free.

This already fixes one of V0's three limitations without any extra code.

### Function timeouts and where the HITL wait fits

The HITL flow uses chat-turn boundaries as the "pause" mechanism, not server-held connections. This matters for Vercel Functions pricing and timeout exposure:

| Activity                                                          | Counts against function timeout?                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Model token generation                                            | Yes — bounded by 300s default / 800s Fluid Compute paid     |
| Tool execution inside a step                                      | Yes — same bound                                            |
| Streaming the response body back to the client                    | Yes — response stream lives in the same invocation          |
| **User think-time between approval prompt and click**             | **No — HTTP response has closed, function instance freed**  |
| **User completing OAuth consent in a popup**                      | **No — Connect handles the callback server-to-server**      |

The trace from `stream-text.ts`: when `toolApproval` flags a call, the stream emits a `tool-approval-request` chunk followed by `finishReason: 'tool-calls'` and `finish-step` ([`stream-text.ts:1860`](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/stream-text.ts)). The HTTP response closes. The wait is whatever the user takes to click. When approval arrives as a `tool-approval-response` in a new tool-role message, a fresh `streamText` call runs `collectToolApprovals({ messages })` over the updated history ([`collect-tool-approvals.ts`](https://github.com/vercel/ai/blob/main/packages/ai/src/generate-text/collect-tool-approvals.ts)), executes approved tools, and continues.

The pattern that **does** exceed function timeouts is a single autonomous turn whose model + tool loop doesn't fit (e.g. a research agent that wants to call 50 sequential tools in one step). That is the case where the host app should escalate to `DurableAgent` from `@workflow/ai/agent` — each tool becomes a durable, retryable step that can outlive a single invocation. The Connect adapter works the same in either world because `connectAuthProvider` is just an `OAuthClientProvider`; it doesn't care whether `streamText` or `DurableAgent` is calling it.

Recommendation for the docs:
- **Default path**: `streamText` + HITL via `toolApproval`. Fits the vast majority of agent UX patterns. No durable infra needed.
- **Escalation**: `DurableAgent` when a single autonomous turn must exceed the function timeout or survive deploys.

## V2: Interactive consent + tool approval (HITL)

V2 extends `@vercel/connect/ai-sdk` with AI-SDK-specific glue. The canonical `connectAuthProvider` impl stays at `@vercel/connect/mcp` (and is still re-exported from `/ai-sdk`); `withConsentApproval` and the future React components land here because they're shaped around AI SDK's `toolApproval` configuration and chat UI primitives — they have no meaning for non-AI-SDK MCP clients.

The integration loses a lot of value if it can't gate sensitive actions interactively. AI SDK already ships the primitive — `toolApproval: { toolName: 'user-approval' }` on `streamText`/`generateText` — so the work here is just to integrate it ergonomically.

### Auto-approval for MCP tools

A second helper takes the result of `mcpClient.tools()` and tags every tool (or a subset) as `'user-approval'`:

```ts
import { withConsentApproval } from '@vercel/connect/ai-sdk';

const tools = withConsentApproval(await mcpClient.tools(), {
  // optional — defaults to gating every tool
  approve: ['linear_create_issue', 'linear_update_comment'],
});

const stream = await streamText({
  model: 'anthropic/claude-sonnet-4.6',
  prompt: '...',
  tools,
  toolApproval: tools.approvalConfig, // pre-built by the helper
});
```

`withConsentApproval` returns the tool map plus a sibling `approvalConfig` object pre-shaped for the AI SDK's `toolApproval` option. The shape compiles down to the existing `{ toolName: 'user-approval' }` form — nothing custom.

### Streaming consent chunks through `useChat`

When `redirectToAuthorization` fires mid-stream (e.g. a tool requires a freshly-revoked grant), we want the chunk to appear in `useChat`'s UI surface, not just throw. Two implementation options:

1. **Custom UI message part** — emit a `data-consent` part via the transport's data-part API. UI renders `{ url, connector }` as an "Authorize <Provider>" button.
2. **Throw a tool-result-with-error** — translates to a `tool-output-denied` chunk that the UI already renders.

Option 1 is cleaner and matches how AI SDK Elements renders other interrupts. We'll start with Option 2 (no new chunk type, ships with V1) and add Option 1 with `<ConnectConsentBoundary>` in a follow-up.

### Multi-connector composition

Because `tools` is just an object, the AI SDK already supports merging tools from multiple Connect-backed MCP clients in one `streamText` call. The helper takes a `prefix` option to avoid collisions:

```ts
const linear = withConsentApproval(await linearClient.tools(), { prefix: 'linear_' });
const github = withConsentApproval(await githubClient.tools(), { prefix: 'github_' });

const stream = await streamText({
  // ...
  tools: { ...linear, ...github },
  toolApproval: { ...linear.approvalConfig, ...github.approvalConfig },
});
```

### What this replaces

The V2 snippet above is five lines of glue. Three alternative paths to the same behavior, in order of decreasing pain:

#### Without Connect at all (you own the OAuth stack)

```ts
// Pre-work outside this file:
// - Register OAuth apps with Linear and GitHub in each provider's console
// - Store LINEAR_CLIENT_ID/SECRET, GITHUB_CLIENT_ID/SECRET as env vars
// - Run a migration:
//   CREATE TABLE oauth_tokens (
//     user_id TEXT, provider TEXT, access_token TEXT, refresh_token TEXT,
//     expires_at TIMESTAMP, scopes TEXT[],
//     PRIMARY KEY (user_id, provider)
//   );
// - Ship /api/oauth/linear/callback and /api/oauth/github/callback routes,
//   each handling code exchange, PKCE verification, state validation, token persistence

async function getProviderToken(userId: string, provider: 'linear' | 'github') {
  const row = await db.oauth_tokens.findUnique({
    where: { user_id_provider: { userId, provider } },
  });
  if (!row) throw new ConsentRequiredError(buildOAuthAuthorizeUrl(provider, userId));

  if (row.expires_at < new Date(Date.now() + 60_000)) {
    const refreshed = await fetch(`https://api.${provider}.com/oauth/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
        client_id: process.env[`${provider.toUpperCase()}_CLIENT_ID`]!,
        client_secret: process.env[`${provider.toUpperCase()}_CLIENT_SECRET`]!,
      }),
    }).then((r) => r.json());
    await db.oauth_tokens.update({
      where: { user_id_provider: { userId, provider } },
      data: {
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }
  return row.access_token;
}

// ... then the same buildClient / prefix / approvalConfig / streamText plumbing below,
// with getProviderToken() in place of @vercel/connect's getToken().
```

Plus security review of `client_secret` storage, on-call rotation when a provider forces a refresh-token reissue, and a migration every time you add a third provider.

#### Connect without the adapter (V0 pattern — Connect handles OAuth, you handle AI SDK glue)

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import {
  getToken,
  startAuthorization,
  UserAuthorizationRequiredError,
} from '@vercel/connect';
import { streamText } from 'ai';

async function buildClient(connector: string, mcpUrl: string) {
  try {
    const token = await getToken(connector, { subject: { type: 'user', id: userId } });
    return await createMCPClient({
      transport: { type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
    });
  } catch (err) {
    if (err instanceof UserAuthorizationRequiredError) {
      const { url } = await startAuthorization(connector, { subject: { type: 'user', id: userId } });
      throw new ConsentRequiredError(url);
    }
    throw err;
  }
}

const [linearClient, githubClient] = await Promise.all([
  buildClient('oauth/linear', 'https://mcp.linear.app'),
  buildClient('oauth/github', 'https://mcp.github.com'),
]);

const linearTools = await linearClient.tools();
const githubTools = await githubClient.tools();

const prefix = (tools: Record<string, unknown>, p: string) =>
  Object.fromEntries(Object.entries(tools).map(([k, v]) => [`${p}${k}`, v]));

const linear = prefix(linearTools, 'linear_');
const github = prefix(githubTools, 'github_');

const approvalConfig = Object.fromEntries(
  [...Object.keys(linear), ...Object.keys(github)].map((k) => [k, 'user-approval' as const]),
);

const stream = await streamText({
  model: 'anthropic/claude-sonnet-4.6',
  prompt: '...',
  tools: { ...linear, ...github },
  toolApproval: approvalConfig,
  onFinish: async () => {
    await Promise.all([linearClient.close(), githubClient.close()]);
  },
});
```

Plus: token expiry mid-conversation → rebuild the MCP client by hand. `invalidateCredentials` cache eviction → drop and re-fetch manually. Per-tool approval filtering (`approve: ['linear_create_issue']` instead of gating everything) → another `Object.entries` reduce.

#### Summary

| Stack | Per-provider glue | What you own |
|---|---|---|
| Raw OAuth (no Connect) | ~200 lines + DB schema + 2 callback routes | Client registration, DB, refresh, callback routes, security review |
| Connect SDK alone (V0)             | ~30 lines              | Per-provider `try`/`catch` + bearer header + tool prefix + approval config |
| Connect AI SDK adapter (V1 + V2)   | ~3 lines               | `withConsentApproval(...)` — the helper builds the rest                    |

## Example app (smoke-test gate for V1 release)

A runnable example app in `vercel/ai/examples/next-mcp-vercel-connect/` mirrors the cookbook recipe end-to-end. It exists primarily as the **release gate for V1**: a green build of the example against the latest `vercel/ai` `main` is the signal that the published `@vercel/connect@0.2` is safe to ship. Secondary uses (giving readers a clone-and-run reference, surfacing in the AI SDK examples index) are owned by the [content plan](./ai-sdk-content.md).

### Why this lives in `vercel/ai`, not `packages/connect/__tests__/`

Two reasons:

1. **Catches interface drift earliest.** The example resolves `@ai-sdk/mcp` and `ai` from the workspace, not from a pinned `package.json`. If a new AI SDK canary adds a required `OAuthClientProvider` method, the example app fails to build in `vercel/ai` CI before we publish a release that would silently break. A fixture pinned to a specific `@ai-sdk/mcp` version inside `packages/connect` wouldn't.
2. **Doubles as the recipe's executable spec.** The cookbook recipe (owned by the content plan) is generated *from* this example app's source. Drift between the recipe code and runnable code is impossible because they're the same file.

### Structure

```
examples/next-mcp-vercel-connect/
├── README.md                  — links to the cookbook recipe and the Connect concepts pages
├── package.json               — depends on ai@workspace:*, @ai-sdk/mcp@workspace:*, @vercel/connect
├── app/
│   ├── api/chat/route.ts      — connectAuthProvider + createMCPClient + streamText
│   └── page.tsx               — useChat with consent + approval UI
├── .env.example               — CONNECT_CONNECTOR, VERCEL_OIDC_TOKEN
└── tsconfig.json
```

This pattern is well-established in the repo (`examples/mcp/`, `examples/next-agent/`, `examples/next-workflow/`).

### Release gate

The V1 publish PR in `vercel/vercel` is blocked on a green CI run of the example app in `vercel/ai`:

1. Open a PR in `vercel/ai` adding `examples/next-mcp-vercel-connect/` pointed at the V1 RC tag of `@vercel/connect`.
2. CI builds and type-checks the example against `vercel/ai`'s workspace versions of `ai` and `@ai-sdk/mcp`.
3. If green: cut the `@vercel/connect@0.2` stable release.
4. If red: fix the SDK in `vercel/vercel`, rev the RC, re-run.

V2 adds an "approval flow" step to the same example; the V2 publish gate is the same example with that step exercised in CI.

## Open design questions

1. **Closure of the MCP client.** `onFinish: () => mcpClient.close()` is repetitive and easy to forget. Should `connectAuthProvider` expose a `wrap` helper that builds `{ client, tools, close }` and registers the close handler automatically? Or is the explicit form preferable for transparency? **Lean:** keep explicit in V1; revisit if the docs guide reveals it's a common foot-gun.
2. **Should `subject` have a default?** Today `ConnectTokenParams.subject` is required in the underlying SDK — every `getToken` call specifies one of `'app' | 'user' | 'jwt-bearer'` explicitly. **Lean:** mirror that exactly in the adapter and do NOT default to `{ type: 'user' }`. The three subject types have meaningfully different security semantics — `'app'` skips user consent (tenant-wide bot credential), `'user'` requires consent per identity, `'jwt-bearer'` is on-behalf-of with a custom assertion. Silently defaulting to `'user'` would surprise developers building service-account integrations whose tools would suddenly demand consent. If verbosity becomes a real pain point, ship typed sugar helpers in V2: `userSubject(id)` returns `{ type: 'user', id }`, `appSubject()` returns `{ type: 'app' }`. That keeps the API surface single-pathed (always `subject:`) while shaving characters.
3. **Where does Connect's callback URL live?** Today it's set when creating the connector or via `callbackUrl` on `startAuthorization`. For the adapter, do we accept `callbackUrl` as a top-level option, or rely on the connector default? **Lean:** top-level option that overrides connector default; defaults to the connector's registered redirect.
4. **JWT-bearer subject support.** `ConnectTokenParams['subject']` already supports `{ type: 'jwt-bearer', sub, iss?, aud?, additionalClaims? }`. The adapter passes through verbatim, but the consent flow doesn't apply — `tokens()` either succeeds or throws. Document this in the JSDoc; no API change needed.
5. **MCP server discovery vs schema definition.** `mcpClient.tools()` defaults to schema discovery (auto-syncs). For least-privilege agents we may want `mcpClient.tools({ schemas: { … } })` for explicit allowlisting. This is a pass-through; document the pattern in the guide.
6. **Connection pooling.** If a chat app opens 50 concurrent MCP clients per request, each over its own WebSocket/SSE, costs blow up. Is pooling the adapter's problem or the consumer's? **Lean:** out of scope for V1. Mention in the docs that production deployments should reuse `mcpClient` across requests when the auth subject is stable.
7. **`OAuthClientProvider` interface drift.** Resolved, no longer open. The interface is verified identical between `@ai-sdk/mcp@1.x` and `2.x` (see "Interface stability" subsection), so V1 supports both. The AI SDK vs official MCP TS SDK delta is ~5% — a single implementation satisfies both today. Drift mitigation already wired in via the [package.json delta](#packagejson-delta): both `@ai-sdk/mcp` and `ai` are declared as **optional peer dependencies** following the existing `@vercel/connect/{ash,betterauth,authjs}` pattern, with dev-dep pins matching the versions used by the verified diff. When the AI SDK ships a major bump, the workflow is: (1) re-run the type-defs diff against the new version, (2) update the dev-dep pin and the peer-dep range together in a Changeset, (3) if the interface meaningfully changed, ship a facade entry point (`/mcp/v6`, `/mcp/v7`) without breaking the existing one.

## Testing plan

Four tiers, each catching a different class of bug. The first two run in PR CI; the third runs nightly + before every publish; the fourth is the final human-eyes pass.

| Tier | Speed | Runs in PR CI | Catches |
| ---- | ----- | ------------- | ------- |
| Unit | <1s   | Yes           | Adapter logic in isolation (mocked Connect + mocked transport) |
| Integration | ~5s | Yes        | Adapter ↔ real `createMCPClient` ↔ mocked MCP server |
| E2E | ~30s | No (opt-in)    | Adapter ↔ real Connect API ↔ real MCP server. **V1 publish gate.** |
| Manual smoke | — | No           | Human eyes on the user-facing flow |

### Unit tests (in `packages/connect/src/mcp/__tests__/`)

Run against fully mocked dependencies. Cover:

- `tokens()` returns a valid `OAuthTokens` shape when `getToken` resolves.
- `tokens()` returns `undefined` on `UserAuthorizationRequiredError`.
- `tokens()` rethrows `ConnectorInstallationRequiredError`.
- `redirectToAuthorization` calls `startAuthorization` and either invokes the callback or throws `ConsentRequiredError`.
- `invalidateCredentials('tokens')` evicts the LRU cache entry.
- `withConsentApproval` produces the correct `approvalConfig` shape, including `prefix`/`approve` filtering.

### Integration tests (in `packages/connect/__tests__/integration/`)

Wire `connectAuthProvider` into a real `createMCPClient` instance against an in-process mock MCP server (using `@ai-sdk/mcp`'s test helpers). Assert:

- First request sets `Authorization: Bearer <token>` from `getToken`.
- 401 response triggers `authorizeOnce()` and lands in `redirectToAuthorization`.
- Token refresh on second request after expiry.
- Multi-client composition produces non-conflicting tool maps.
- Wire `withConsentApproval` into `streamText` against a mocked LLM, simulate a `tool-approval` chunk, deny it, assert the model receives `execution-denied`.

### E2E tests (in `packages/connect/__tests__/e2e/`) — V1 publish gate

These are the tests that actually prove the adapter works against the live Connect API, not just against our assumptions about it. They use `vercel link` + `vercel env pull` to authenticate as a real Vercel project with real connectors attached.

**Test project setup (one-time per dev machine):**

```bash
cd packages/connect/__tests__/e2e
vercel link --project vercel-internal-playground   # or ash-starter-template
vercel env pull .env.test                          # provisions VERCEL_OIDC_TOKEN
```

The test project must have these connectors attached (owned by the connect team — coordinate with @allenzhou for access):

| Connector UID                    | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `oauth/linear`                   | Happy-path `tokens()` returns valid bearer for real MCP  |
| `oauth/linear-unauthorized`      | Forces `UserAuthorizationRequiredError` → consent flow   |
| `slack/test-workspace`           | Alternate provider for multi-connector composition test  |
| `api-key/intentionally-broken`   | Forces `ConnectorInstallationRequiredError`              |

Tests are gracefully skipped (not failed) when `.env.test` is missing, with a clear message pointing at the setup steps. CI runs them as a separate job that injects a service-account OIDC token from a GitHub Actions secret.

**E2E assertions:**

- `tokens()` against `oauth/linear` returns a non-empty access token whose `Authorization: Bearer <token>` header is accepted by `https://mcp.linear.app` (assert 200 on `/mcp` handshake).
- `tokens()` against `oauth/linear-unauthorized` throws `UserAuthorizationRequiredError` and `startAuthorization` returns a `url` whose host is the connector's configured authorization server.
- `tokens()` against `api-key/intentionally-broken` throws `ConnectorInstallationRequiredError`.
- Full `createMCPClient` + `mcpClient.tools()` round-trip against the real Linear MCP server, asserting the tool list is non-empty and one of the expected tool names is present.
- `withConsentApproval` against the real Linear tools produces an `approvalConfig` keyed by the actual tool names returned by Linear's MCP server (catches drift when Linear renames tools).

**Cadence:**

- Manually before every `@vercel/connect` publish: `pnpm test:e2e` in `packages/connect`.
- Nightly via a GitHub Actions cron job with a service-account OIDC token, posting failures to the connect team channel.
- The `examples/next-mcp-vercel-connect/` smoke-test in `vercel/ai` (see §"Example app") is the cross-repo equivalent and runs in `vercel/ai` CI on every PR that touches `@ai-sdk/mcp` or `ai`.

### Manual smoke / acceptance (pre-publish, human-driven)

After all automated tiers pass, run the published-candidate package end-to-end with a real chat UI to catch UX issues no test will surface:

- Run the docs-page example against a real Linear MCP connector with a test workspace; confirm the consent redirect URL renders as expected and post-consent the chat actually returns Linear data.
- Run a two-provider example (Linear + GitHub) with overlapping tool names and `prefix:` to verify no collisions surface in the rendered chat output.
- Manually revoke a token in the Linear workspace and confirm the next chat turn surfaces `ConsentRequiredError` rather than a confusing 401.

### Test project ownership

The Vercel-internal test project(s) used by the E2E tier are owned by the connect team. The plan currently lists two candidates:

- **`vercel-internal-playground`** — generic Vercel internal sandbox; needs the four test connectors attached.
- **`ash-starter-template`** — Ash starter that already has Connect connectors wired; faster to bootstrap from but the connector UIDs may need renaming to match the table above.

@allenzhou to confirm which project we standardize on and ensure the four listed connectors are attached and current. The test suite reads the project name from `.env.test`'s `VERCEL_PROJECT_NAME` (set by `vercel env pull`) and the connector UIDs from a small `e2e-config.ts` so renames don't require code changes.

## SDK release sequence

Only the `vercel/vercel` SDK + the `vercel/ai` example app are listed here. The matching docs/recipe artifacts (and their cross-repo coordination) live in [`ai-sdk-content.md`](./ai-sdk-content.md).

### Phase V0 — no SDK work

V0 is docs-only and ships from the content plan. The implementation plan picks up at V1.

### Phase V1 — `@vercel/connect/ai-sdk` (primary) + `@vercel/connect/mcp` adapter

| Repo                  | Artifact                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vercel/vercel`       | `@vercel/connect/mcp` subpath export — canonical impl of `connectAuthProvider` + `ConsentRequiredError` + `ConsentChallenge` types                                       |
| `vercel/vercel`       | `@vercel/connect/ai-sdk` subpath export — re-exports `connectAuthProvider`, `ConsentRequiredError`, `ConsentChallenge` from `/mcp`. Primary surface for AI SDK consumers. |
| `vercel/vercel`       | Peer dependency on `@ai-sdk/mcp@^1 \|\| ^2` (covers AI SDK v6 + v7); Changeset; version bump to `@vercel/connect@0.2`                                                   |
| `vercel/vercel`       | TypeScript compatibility test verifying the adapter satisfies both AI SDK's and official MCP SDK's `OAuthClientProvider` shapes                                          |
| `vercel/vercel`       | Unit tests + integration tests (mock MCP server) — both run in PR CI                                                                                                     |
| `vercel/vercel`       | E2E tests against real Connect API via `vercel link` + `vercel env pull` to a Vercel-internal test project (`vercel-internal-playground` or `ash-starter-template`). **V1 publish gate.** See §"Testing plan" → "E2E tests". |
| `vercel/vercel`       | GitHub Actions nightly cron running the E2E suite with a service-account OIDC token; failures post to the connect team channel                                           |
| `vercel/ai`           | Example app `examples/next-mcp-vercel-connect/` (cross-repo smoke-test gate — see §"Example app" above). Cookbook recipe and reference cross-link are content plan deliverables. |

### Phase V2 — `withConsentApproval` + HITL polish

| Repo                  | Artifact                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vercel/vercel`       | Extend `@vercel/connect/ai-sdk` (already shipping in V1): add `withConsentApproval` helper with prefix/approve filtering + `approvalConfig` builder |
| `vercel/vercel`       | Unit + integration tests against `streamText({ toolApproval })` for approval and denial paths                                                     |
| `vercel/vercel`       | Extend E2E suite: assert `withConsentApproval` against the real Linear MCP server produces an `approvalConfig` keyed by the actual tool names (catches Linear-side tool renames) |
| `vercel/ai`           | Add an approval-gated step to `examples/next-mcp-vercel-connect/`; this becomes the V2 cross-repo publish gate                                    |

### Phase V3 — UI primitives (deferred until V2 has real usage)

| Repo                  | Artifact                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `vercel/vercel`       | `<ConnectConsentBoundary>` React component (catches `ConsentRequiredError`, emits a custom data part)                      |
| `vercel/ai`           | If adopted, possibly an AI Elements primitive for rendering the consent prompt                                              |

## Strategic angle (SDK)

The SDK value proposition: a Next.js + AI SDK developer building an agent today has to assemble OAuth + token storage + token refresh + MCP plumbing from four libraries. With this adapter, the entire stack collapses to:

```ts
import { connectAuthProvider } from '@vercel/connect/ai-sdk';

authProvider: connectAuthProvider('oauth/linear', { subject: { type: 'user', id: userId } });
```

That's the same "kill the boilerplate" win the AI SDK is known for, applied to OAuth.

V1 is the long-term ergonomic surface, shipped at `@vercel/connect/ai-sdk` so the import path reflects the headline use case. V2 closes the interactive-flow gap by leaning on the AI SDK's existing `toolApproval` primitive, so we don't have to invent a new HITL mechanism.

The MCP-spec compatibility (`@vercel/connect/mcp`) is a real bonus on top: the same one-line collapse works for Mastra users and anyone else on the MCP-spec interface, with zero extra implementation work. We claim that surface without distracting from the AI SDK headline.

Discoverability — making AI SDK developers find this in the first place — is the content plan's job. See [`ai-sdk-content.md`](./ai-sdk-content.md).
