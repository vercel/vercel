# `@vercel/connect` × AI SDK / MCP integration

> Status: draft for review. Companion to PR #16527 (the planning doc) and
> PR #16529 (the implementation). This file explains, from zero context,
> what we are building, why, how the AI SDK's MCP tool-calling and OAuth
> machinery actually works, and what is still open.

---

## 1. TL;DR

We are adding two optional subpath exports to `@vercel/connect`:

- **`@vercel/connect/mcp`** — `connectAuthProvider(...)`, which adapts Vercel
  Connect's token service to the MCP-spec `OAuthClientProvider` interface. This
  lets any MCP client (the AI SDK's `@ai-sdk/mcp`, the official MCP TypeScript
  SDK, Mastra, etc.) obtain provider access tokens (Linear, GitHub, …) through
  Connect, with no hand-rolled OAuth.
- **`@vercel/connect/ai-sdk`** — re-exports `connectAuthProvider` (and its
  consent types) so AI SDK users have a single import.

The **`connectAuthProvider` adapter is the real deliverable** — it is the only
piece that contains Connect-specific logic and that cannot live anywhere else.
Tool-call approval (Human-in-the-Loop) is deliberately **out of scope**: it has
no Connect dependency and is already covered by the AI SDK's own `toolApproval`
primitive (and `wrapMcpTools` in `@ai-sdk/policy-opa`). See
[§7](#7-tool-calling-hitl-and-the-two-consents).

---

## 2. The three systems involved

### Vercel Connect (`@vercel/connect`)

Connect is a hosted Vercel service that brokers OAuth to third-party providers
on behalf of your users. Your server code calls:

```ts
import { getToken } from '@vercel/connect';

const token = await getToken('oauth/linear', {
  subject: { type: 'user', id: userId },
});
```

and Connect returns a fresh provider access token **if** that subject has
already granted access. Connect owns the hard parts server-side: OAuth client
registration, the `client_secret`, PKCE, token storage, and refresh. The
developer never sees any of it.

Key building blocks already in this package (pre-existing, not new):

- `getTokenResponse(connector, params, options?)` → `{ token, expiresAt, … }`
  (`src/token.ts`). Throws `UserAuthorizationRequiredError` when the subject has
  no grant yet, and `ConnectorInstallationRequiredError` when the connector is
  not installed.
- `startAuthorization(connector, params, options?)` → `{ url, request, verifier, deviceCode? }`
  (`src/authorization.ts`). `url` is the Connect-hosted consent page to send the
  user to.

### MCP (Model Context Protocol)

MCP is an open standard for exposing **tools** (functions an LLM can call) over
a transport (usually HTTP). Providers like Linear and GitHub run MCP servers at
URLs such as `https://mcp.linear.app`. To call them, the client must:

1. authenticate (OAuth bearer token), and
2. list the tools the server exposes, then forward tool calls.

The MCP spec defines an `OAuthClientProvider` interface that an MCP client calls
to obtain and persist credentials. **This is the seam we plug into.**

### AI SDK (`ai`, `@ai-sdk/mcp`)

The AI SDK is Vercel's LLM framework (`streamText`, `generateText`, agents).
`@ai-sdk/mcp` provides `createMCPClient(...)`, which connects to an MCP server,
discovers its tools, and returns them as AI SDK tools you pass straight into
`streamText({ tools })`. The MCP client accepts an `authProvider` that
implements exactly the `OAuthClientProvider` interface above.

So the chain is:

```
streamText({ tools })  ←  mcpClient.tools()  ←  createMCPClient({ authProvider })  ←  connectAuthProvider(...)  ←  Vercel Connect
```

---

## 3. How AI SDK tool calling works (quick primer)

A "tool" is a named function with an input schema. When you pass tools to
`streamText`, the model can decide to call one. The loop is:

1. Model emits a **tool call** (`name` + JSON args).
2. The SDK runs the tool's `execute` (for MCP tools, this performs an
   authenticated request to the MCP server).
3. The tool **result** is fed back to the model, which continues.

MCP tools are just AI SDK tools whose `execute` proxies to the MCP server over
the transport. Everything auth-related happens inside that transport — which is
where our adapter lives.

---

## 4. How the AI SDK MCP OAuth flow actually works

This is the part most people get wrong, so it's worth being precise. Two entry
points on the transport touch the `OAuthClientProvider` (see
`@ai-sdk/mcp` `src/tool/mcp-http-transport.ts` and `src/tool/oauth.ts`):

### 4a. Attaching a token to every request

Before each request the HTTP transport calls `provider.tokens()` and, if it
returns a token, sets the header:

```ts
// mcp-http-transport.ts (paraphrased)
const tokens = await this.authProvider.tokens();
if (tokens?.access_token) {
  headers['Authorization'] = `Bearer ${tokens.access_token}`;
}
```

This is the **happy path**: `tokens()` returns a valid token, the request is
authorized, no further OAuth machinery runs.

### 4b. The `auth()` orchestrator (runs on a 401)

If a request comes back `401`, the transport calls `auth(provider, { serverUrl })`
(in `oauth.ts`). Simplified, `authInternal` does:

1. Discover the server's protected-resource + authorization-server metadata
   (`/.well-known/...`).
2. `provider.clientInformation()` — if `undefined`, attempt dynamic client
   registration.
3. `const tokens = await provider.tokens()`.
   - If `tokens.refresh_token` exists → refresh and `saveTokens`, return
     `AUTHORIZED`.
   - Otherwise → build a PKCE authorization URL via `startAuthorization`, call
     `provider.saveCodeVerifier(...)`, then `provider.redirectToAuthorization(authorizationUrl)`,
     and return `REDIRECT`.

The full standard interface the orchestrator can touch:

```ts
interface OAuthClientProvider {
  tokens(): OAuthTokens | undefined | Promise<…>;
  saveTokens(tokens): void | Promise<void>;
  redirectToAuthorization(authorizationUrl: URL): void | Promise<void>;
  saveCodeVerifier(codeVerifier: string): void | Promise<void>;
  codeVerifier(): string | Promise<string>;
  get redirectUrl(): string | URL;
  get clientMetadata(): OAuthClientMetadata;
  clientInformation(): OAuthClientInformation | undefined | Promise<…>;
  // …plus optional saveClientInformation, state, invalidateCredentials, etc.
}
```

The crucial design realization: **a standard provider stores tokens the client
fetches; our provider mints them on demand from Connect.** Connect already owns
registration, PKCE, state, refresh and storage, so most of this interface is a
no-op for us. We only need two methods to do real work: `tokens()` and
`redirectToAuthorization()`.

---

## 5. What `connectAuthProvider` does

`src/mcp/connect-auth-provider.ts`. It returns an `OAuthClientProvider` whose
methods map onto Connect:

| Interface member        | Our implementation |
| ----------------------- | ------------------ |
| `tokens()`              | Calls `getTokenResponse`. Maps `{ token, expiresAt }` → `{ access_token, token_type: 'Bearer', expires_in }`. On `UserAuthorizationRequiredError` returns **`undefined`** (the spec signal for "no token, start auth"). On `ConnectorInstallationRequiredError` throws (config error, not a per-user consent issue). |
| `redirectToAuthorization(url)` | **Ignores** the SDK-discovered `url`. Calls Connect's `startAuthorization` to get Connect's own consent URL, then either throws `ConsentRequiredError` (default) or invokes the `onConsentRequired` callback. |
| `saveTokens` / `saveCodeVerifier` | No-ops — Connect owns persistence and PKCE. |
| `codeVerifier()`        | Throws loudly. A correctly-wired transport never calls it (we own PKCE server-side); failing visibly beats fabricating a fake verifier. |
| `redirectUrl`           | Configurable, defaults to `''`. The same value is forwarded to Connect's `startAuthorization` as the post-consent return URL (`callbackUrl`); empty string falls back to the connector's registered redirect. |
| `clientMetadata`        | Minimal `{ redirect_uris: [] }` (only used during dynamic registration, which we never trigger). |
| `clientInformation()`   | `{ client_id: connector }` — the connector UID stands in as the client id, so the orchestrator skips dynamic registration. |

### End-to-end consent sequence

```
User asks the agent to do something that needs Linear
        │
        ▼
streamText({ tools: linearTools })  ──►  MCP tool call
        │
        ▼
transport.send()  ──►  provider.tokens()
        │
        ├── Connect HAS a grant ──►  returns {access_token}  ──►  Bearer header  ──►  request OK  ──►  tool runs ✅
        │
        └── Connect has NO grant ──►  tokens() returns undefined
                                            │
                                            ▼ (request → 401)
                                      transport calls auth(provider)
                                            │
                                            ▼
                                  provider.redirectToAuthorization(ignoredUrl)
                                            │
                                            ▼
                                  Connect startAuthorization() → consent URL
                                            │
                                            ▼
                                  throw ConsentRequiredError(url)   (or onConsentRequired callback)
                                            │
                                            ▼
                  caught at the route boundary ──►  Response.redirect(url)
                                            │
                                            ▼
                  user grants access on Connect's hosted page ──►  Connect stores the grant
                                            │
                                            ▼
                  next turn: tokens() now returns a token ──►  happy path ✅
```

The important property called out in the planning PR: the HITL "wait" is a
**chat-turn boundary, not a held-open server connection.** The HTTP response
closes between turns, the function instance is freed, and message history is the
durable store. So there is no long-lived function-timeout exposure.

---

## 6. Package shape

`connectAuthProvider` slots into the **existing adapter family** (`/ash`,
`/betterauth`, `/authjs`). Nothing novel about the packaging:

```jsonc
// package.json (relevant entries)
"exports": {
  "./mcp":    { "types": "./dist/mcp/index.d.ts",    "default": "./dist/mcp/index.js" },
  "./ai-sdk": { "types": "./dist/ai-sdk/index.d.ts", "default": "./dist/ai-sdk/index.js" }
},
"peerDependencies": {
  "@ai-sdk/mcp": "^1 || ^2",   // OAuthClientProvider interface is identical across 1.x/2.x
  "ai": "^6 || ^7"             // works with both major lines
},
"peerDependenciesMeta": {
  "@ai-sdk/mcp": { "optional": true },
  "ai":          { "optional": true }
}
```

Both peers are **optional** — importing `/mcp` or `/ai-sdk` requires them in the
consumer, but the root `@vercel/connect` works without either. The `^1 || ^2`
range is safe because the `OAuthClientProvider` type is byte-for-byte identical
across `@ai-sdk/mcp` 1.x and 2.x (verified by diffing both tarballs; recorded in
PR #16527).

---

## 7. Tool calling, HITL, and the two "consents"

There are **two completely different "consents"** in this work, and conflating
them is the main review concern.

1. **OAuth consent (Connect's job).** "Allow this app to access your Linear
   account at all." Happens once per user; handled by `connectAuthProvider`.
2. **Tool-call approval (AI SDK HITL).** "Are you sure you want the agent to
   create *this* issue right now?" Happens per action; handled by the AI SDK v7
   `toolApproval` primitive.

**This package only handles #1.** Tool-call approval is deliberately left to
the AI SDK: pass a `toolApproval` config to `streamText`/`generateText`, or use
`wrapMcpTools` from `@ai-sdk/policy-opa`, which builds a `{ tools, toolApproval }`
result and defaults uncovered tools to `'user-approval'` for any tool set. An
earlier revision of this PR shipped a `withConsentApproval` helper here; it was
removed because it had zero Connect dependency and duplicated `wrapMcpTools`.
The only thing it added was tool-name prefixing (so multiple MCP servers don't
collide in one `streamText` call) — if that proves to be a recurring need, it
belongs in `@ai-sdk/mcp`, not in Connect.

---

## 8. The two PRs

### PR #16527 — planning doc (docs only)

Proposal + cross-repo release plan. Iterated across 8 commits to: reframe AI SDK
as the headline audience (MCP-spec compatibility a "free bonus"); verify
`OAuthClientProvider` stability across `@ai-sdk/mcp` 1.x/2.x; split into
implementation vs content plans; spell out the `package.json` delta; and define
a testing ladder (unit → integration → real E2E against live Connect as the V1
publish gate).

Release slices: **V0** docs-only (`getToken` + bearer header) → **V1**
`@vercel/connect/mcp` adapter → **V2** `@vercel/connect/ai-sdk` re-export +
cookbook (HITL via the AI SDK's own primitives, no new Connect code).

**Reviewer feedback (dvoytenko):**

- On a doc sample that fetches a token once and threads the raw string into
  `createMCPClient`: *"This looks bad because token can expire and MCP client
  won't be able to re-request it. The callback is the way."* This is the core
  point — a captured token string goes stale; the client needs a callback
  (`tokens()`) it can re-invoke. This **validates the V1 adapter** over the V0
  raw-string pattern.
- Asks for optional `userCode` / `deviceCode` on the consent challenge (Connect
  supports device flow; see `ConnectAuthorizationResponse.deviceCode`).

### PR #16529 — implementation (the code in this package)

Implements the `connectAuthProvider` adapter and both subpath exports, with
optional peer deps and type-level `expectTypeOf` assertions locking the adapter
against drift in `@ai-sdk/mcp`'s `OAuthClientProvider`.

**Reviewer feedback (dvoytenko, requested changes) — and how it was addressed:**

1. `with-consent-approval.ts` *"wholly independent from Connect?"* → **Removed**
   (AI SDK glue, duplicated `wrapMcpTools`; see [§7](#7-tool-calling-hitl-and-the-two-consents)).
2. `vercelToken?: string` *"make it a callback?"* → **Done.** Now accepts
   `string | (() => string | Promise<string>)`, resolved at call time.
3. `callbackUrl` vs `redirectUrl` *"What's the difference?"* → **Consolidated**
   onto one `redirectUrl` (both the provider value and the post-consent return URL).
4. `ConsentChallenge` *"Add optional `userCode`/`deviceCode`"* → **Done.**
   `deviceCode` + `expiresAt` thread onto the challenge and `ConsentRequiredError`.
5. `redirectToAuthorization` *"...no redirect URL of any kind"* → **Confirmed.**
   The SDK-discovered URL is ignored; the consent URL comes from `startAuthorization`.
6. *"Pass redirectUrl"* → **Done.** A non-empty `redirectUrl` is forwarded as
   `callbackUrl` (Connect's `returnUrl`).
7. Version bump *"Why is it here?"* → **Reverted** to `0.1.2`; changeset drives it.
8. Imports *"Where are these files?"* → `../authorization.js` is sibling
   `src/authorization.ts` (`.js` required by NodeNext); OAuth types are the
   optional `@ai-sdk/mcp` peer dep.

---

## 9. Open decisions

All eight review comments are now addressed in the PR (see [§8](#8-the-two-prs)).
Remaining open items:

- **Real E2E gate** against live Connect + a real MCP server remains the V1
  publish gate (per PR #16527); still out of scope for the first code PR.
- **`@ai-sdk/policy-opa` is at `0.0.0` / unreleased.** The V2 cookbook will lean
  on `wrapMcpTools` / `toolApproval`; coordinate with that package's owner before
  depending on it. If tool-name prefixing proves to be a recurring need, propose
  it to `@ai-sdk/mcp` via an issue rather than re-adding a Connect export.

---

## 10. Reference map

| Concept | File |
| --- | --- |
| Connect token fetch + error types | `src/token.ts` |
| Connect consent / authorization start | `src/authorization.ts` |
| MCP `OAuthClientProvider` adapter | `src/mcp/connect-auth-provider.ts` |
| `/mcp` public surface | `src/mcp/index.ts` |
| `/ai-sdk` public surface | `src/ai-sdk/index.ts` |
| AI SDK `OAuthClientProvider` + `auth()` orchestrator | `vercel/ai` → `packages/mcp/src/tool/oauth.ts` |
| AI SDK HTTP transport (token attach + 401 → `auth()`) | `vercel/ai` → `packages/mcp/src/tool/mcp-http-transport.ts` |
| AI SDK equivalent of our HITL helper | `vercel/ai` → `packages/policy-opa/src/wrap-mcp-tools.ts` |
