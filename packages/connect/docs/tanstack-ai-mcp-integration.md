# `@vercel/connect` × TanStack AI / MCP integration

> Companion to `docs/ai-sdk-mcp-integration.md`. That document explains the
> `connectAuthProvider` adapter from zero context; this one covers only what
> is different when the MCP client is `@tanstack/ai-mcp`, and why the new
> `@vercel/connect/tanstack-ai` subpath exists.

---

## 1. TL;DR

`@vercel/connect/tanstack-ai` exports `connectMCPTransport`, which builds the
`createMCPClient({ transport })` config with a Connect-backed `authProvider`
and picks the consent mode per transport type: `'eager'` for Streamable HTTP
(`type: 'http'`), `'transport'` for SSE. Catch the consent challenge at the
route boundary with `getConsentChallenge`.

```ts
import { chat, toServerSentEventsResponse } from '@tanstack/ai';
import { createMCPClient } from '@tanstack/ai-mcp';
import {
  connectMCPTransport,
  getConsentChallenge,
} from '@vercel/connect/tanstack-ai';

export async function POST(request: Request) {
  try {
    const linear = await createMCPClient({
      transport: connectMCPTransport(
        { type: 'http', url: 'https://mcp.linear.app/mcp' },
        'oauth/linear',
        { subject: { type: 'user', id: userId } },
        { redirectUrl: 'https://app.example.com/integrations' }
      ),
    });
    const stream = chat({ adapter, messages, mcp: { clients: [linear] } });
    return toServerSentEventsResponse(stream);
  } catch (err) {
    const challenge = getConsentChallenge(err);
    if (challenge) return Response.redirect(challenge.url);
    throw err;
  }
}
```

The subpath has no TanStack, AI SDK, or MCP SDK import. The provider it
attaches is the package's own `ConnectOAuthClientProvider` interface, which is
structurally assignable to both `@ai-sdk/mcp`'s and the official
`@modelcontextprotocol/sdk`'s `OAuthClientProvider` without a cast, and the
transport config type mirrors `@tanstack/ai-mcp`'s `HttpTransportConfig` /
`SseTransportConfig` (both asserted in
`test/mcp/connect-auth-provider.types.test.ts`). `@modelcontextprotocol/sdk`
(`^1.29.0`) and `@ai-sdk/mcp` are declared only as optional peers to signal
the tested version ranges; consumers do not need either installed to use this
subpath.

---

## 2. What shipped

### New: `@vercel/connect/tanstack-ai` (`src/tanstack-ai/index.ts`)

| Export                                                     | Notes                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connectMCPTransport(config, connector, params, options?)` | Returns `config` with a Connect `authProvider` attached and `fetch` wrapped to refuse HTTP redirects (`options.redirect`, default `'error'`). `config` is `{ type: 'http' \| 'sse', url, headers?, fetch? }`. Consent mode is `'eager'` for `http` and `'transport'` for `sse` unless `options.consent` overrides it. |
| `connectAuthProvider(connector, params, options?)`         | Re-exported unchanged from `/mcp` (`consent` defaults to `'transport'`) for hand-built transports. Only pass `consent: 'eager'` with Streamable HTTP.                                                                                                                                                                 |
| `getConsentChallenge(err)`                                 | Walks `err` and its `cause` chain (up to 16 hops) and returns the `ConsentChallenge` if one is present. Matches by `instanceof`, then structurally on `name === 'ConsentRequiredError'`.                                                                                                                              |
| `isConsentRequiredError(err)`                              | Plain type guard. Does not look through wrappers.                                                                                                                                                                                                                                                                     |
| `ConsentRequiredError`, `CONNECT_MANAGED_REDIRECT_URL`     | Re-exported from the shared adapter.                                                                                                                                                                                                                                                                                  |
| `ConnectOAuthClientProvider` and friends (types)           | The adapter's return type, plus `ConnectOAuthTokens`, `ConnectOAuthClientMetadata`, `ConnectOAuthClientInformation`. Self-contained; no SDK import needed.                                                                                                                                                            |
| Connect error and type re-exports                          | `ConnectError`, `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`, `NoValidTokenError`, `ConnectTokenParams`, and friends, same as `/mcp`.                                                                                                                                                       |

### Changed: the shared adapter (`src/mcp/connect-auth-provider.ts`)

| Change                                                                                                                                          | Effect on existing `/mcp` and `/ai-sdk` consumers                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connectAuthProvider` now returns the exported `ConnectOAuthClientProvider` interface instead of `@ai-sdk/mcp`'s `OAuthClientProvider`          | Structurally assignable to both SDKs' interfaces; `/mcp` no longer needs `@ai-sdk/mcp` installed for types.                                                                                                                     |
| New `consent: 'transport' \| 'eager'` option                                                                                                    | Default stays `'transport'`; `@ai-sdk/mcp` behavior is unchanged.                                                                                                                                                               |
| New `getConsentChallenge` / `isConsentRequiredError` helpers                                                                                    | Additive. Also re-exported from `/mcp` and `/ai-sdk`.                                                                                                                                                                           |
| `redirectUrl` getter returns `CONNECT_MANAGED_REDIRECT_URL` (`https://connect.vercel.com/`) instead of `''` when no `redirectUrl` option is set | Fixes transport-mode consent for official-SDK consumers (see §4). `@ai-sdk/mcp` only uses the value as the `redirect_uri` of an authorization URL that `redirectToAuthorization` discards, so nothing observable changes there. |

---

## 3. How `@tanstack/ai-mcp` uses the provider

`createMCPClient({ transport: { type: 'http' | 'sse', url, headers?, fetch?, authProvider? } })`
passes `authProvider` straight through to the official SDK's
`StreamableHTTPClientTransport` or `SSEClientTransport`. The option is typed
as `OAuthClientProvider` from `@modelcontextprotocol/sdk/client/auth.js`, and
`@modelcontextprotocol/sdk ^1.29.0` is a regular dependency of
`@tanstack/ai-mcp`. TanStack does no auth work of its own, so the seam is the
same one `@ai-sdk/mcp` exposes, just backed by a different transport
implementation. `ConnectOAuthClientProvider` covers the required members of
both SDKs' interfaces, so the same adapter value satisfies either.

Two lifecycle facts shape the rest of this document:

- **Connection is eager.** `createMCPClient` awaits `client.connect()`, which
  performs the MCP `initialize` handshake. Any failure is wrapped in
  `MCPConnectionError` with the original error on `cause`.
- **Tool discovery is lazy.** `chat({ mcp: { clients } })` lists tools when
  its stream is consumed; discovery errors surface through the SSE stream, not
  at the `chat()` call.

TanStack's docs currently show static tokens via
``headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` }``. A captured
string goes stale across turns and refreshes; the adapter's `tokens()`
callback is re-invoked by the transport before every request, so the token is
always fresh.

---

## 4. Why eager consent is the default for Streamable HTTP

### Tool errors are model-visible in TanStack

TanStack core catches any exception thrown by a tool's `execute` and converts
it into a tool result string, `Error executing tool: <message>`, with state
`output-error`, which is fed back to the model. If a Connect consent error
were raised mid-run inside a tool call, the user would never see a redirect;
the model would see an error string and improvise.

With `consent: 'eager'`, `tokens()` raises the challenge itself the moment
Connect reports a missing grant. Because the Streamable HTTP transport calls
`tokens()` before every request, including `initialize`, and lets a throw
propagate, a missing grant always fails inside `createMCPClient`, at the route
boundary, where the handler above can redirect. It never reaches a tool call. Eager mode also skips the transport's
protected-resource discovery round trips: Connect is authoritative about the
grant, so there is nothing to learn from letting the server 401 first.

```
createMCPClient()  ──►  transport.connect()  ──►  provider.tokens()
        │
        ├── Connect HAS a grant ──►  Bearer header  ──►  initialize OK  ──►  client ready
        │
        └── Connect has NO grant ──►  startAuthorization() ──►  throw ConsentRequiredError
                                                                        │
                                          MCPConnectionError { cause: ConsentRequiredError }
                                                                        │
                                          getConsentChallenge(err) ──►  Response.redirect(url)
```

`onConsentRequired` still runs in eager mode, but the error is thrown
regardless: `tokens()` must abort the outgoing request, and returning
`undefined` there would let the transport proceed unauthenticated and raise
the challenge a second time.

### Why SSE stays on the transport flow

The official `SSEClientTransport` calls `tokens()` inside the `fetch` it hands
to its EventSource. The EventSource library treats any throw from that fetch
as a retryable network error: the consent error is flattened into a
cause-less `SseError` (so `getConsentChallenge` finds nothing) and the
EventSource schedules a reconnect every few seconds, calling `tokens()` and
minting a fresh Connect authorization request each time until the transport
is closed. Nothing in `createMCPClient`'s failure path closes it. This was
reproduced during review; it is why `connectMCPTransport` selects
`'transport'` for `type: 'sse'`, and why `connectAuthProvider` keeps
`'transport'` as its default. On SSE the 401 path goes through the SDK's
`auth()` orchestrator, which preserves the `ConsentRequiredError` thrown by
`redirectToAuthorization`, and a 401 response is terminal for the
EventSource, so there is no loop. `test/tanstack-ai/create-mcp-client.test.ts`
covers both transports.

### Why the adapter pre-empts OAuth discovery

On every 401 the official SDK's `auth()` runs RFC 9728 discovery: it fetches
the URL named by the server's `WWW-Authenticate: Bearer resource_metadata="…"`
parameter, then the authorization-server metadata at whatever host that
document names. Neither URL is validated against the configured server, so a
compromised MCP server can make the application issue blind GETs to
private-network addresses. `@ai-sdk/mcp` behaves the same way.

The official SDK skips all of that when the provider's optional
`discoveryState()` hook returns a complete cached state. Connect is the
authorization server from the adapter's point of view, so `connectAuthProvider`
returns the fixed `CONNECT_DISCOVERY_STATE`, and `validateResourceURL` returns
`undefined` so the SDK does not compare that synthetic resource against the
server URL and fail before reaching `redirectToAuthorization`. With a grant
present and a malicious 401, the only host the transport contacts is the
configured MCP server; `test/tanstack-ai/create-mcp-client.test.ts` asserts
this. `@ai-sdk/mcp` has no `discoveryState` hook, so the `/ai-sdk` path keeps
the SDK's default discovery behaviour until that is addressed upstream.

### Why `connectMCPTransport` refuses HTTP redirects

The official SDK calls native `fetch` with the default `redirect: 'follow'`
on every MCP request. A compromised MCP server can therefore answer a tool
call or `initialize` with a `303` to a private-network URL and the
application will issue a follow-up GET there. The Fetch spec strips
`Authorization` on cross-origin redirects, so it is a blind request, but it
does happen, and `discoveryState` cannot intervene because this is not the
auth flow.

`connectMCPTransport` wraps `config.fetch` (or the global `fetch`, resolved
per call) so no request follows a redirect, and `createMCPClient` fails with
an `MCPConnectionError`. This matches `@ai-sdk/mcp`, whose transport defaults
to `redirect: 'error'` as well. Pass `{ redirect: 'follow' }` for an endpoint
that legitimately redirects; a caller-supplied guarded `fetch` is wrapped, not
replaced, so its own protections remain.

The wrapper passes a different fetch option per transport. Streamable HTTP
gets `redirect: 'error'`, which rejects the request. SSE gets
`redirect: 'manual'`, which resolves with the 3xx itself. The official
`SSEClientTransport` runs `fetch` inside an EventSource that treats any
rejection as a transient network error and reconnects every three seconds
with no handle left for the caller to close, while a non-200 response is
terminal. Returning the redirect as a response therefore fails the SSE
connection exactly once. Any other rejecting `fetch` on SSE, including a
guarded fetch that throws on a private address, still trips that reconnect
loop; that is a property of the SDK's SSE transport, not of this adapter.
`test/tanstack-ai/create-mcp-client.test.ts` exercises both transports
against real local HTTP servers, including a wait past the reconnect
interval for SSE.

### Why `redirectUrl` now has a non-empty placeholder

The official SDK's `auth()` orchestrator contains
`const nonInteractiveFlow = !provider.redirectUrl;`. A falsy `redirectUrl`
makes it attempt a client-credentials token request against the third-party
authorization server and never call `redirectToAuthorization`. The adapter
previously defaulted `redirectUrl` to `''`, so in transport mode a user with
no grant got the opaque error
`Either provider.prepareTokenRequest() or authorizationCode is required`
instead of a consent URL. `@ai-sdk/mcp` has no such branch, which is why this
was never hit before.

The getter now falls back to `CONNECT_MANAGED_REDIRECT_URL`. This fixes
`consent: 'transport'` for every official-SDK consumer of `/mcp`, not just
TanStack. The placeholder is never followed as a real redirect:
`redirectToAuthorization` discards the SDK-built authorization URL in favour
of Connect's own consent URL, and when no `redirectUrl` option is set Connect
uses the connector's server-side registered redirect after consent.

---

## 5. Client pools

`createMCPClients` takes the same per-entry transport config, so one
`connectMCPTransport` per connector drops in and tools are auto-prefixed by
config key:

```ts
const clients = await createMCPClients({
  github: {
    transport: connectMCPTransport(
      { type: 'http', url: GITHUB_MCP_URL },
      'oauth/github',
      { subject }
    ),
  },
  linear: {
    transport: connectMCPTransport(
      { type: 'http', url: 'https://mcp.linear.app/mcp' },
      'oauth/linear',
      { subject }
    ),
  },
});
```

Two cautions:

- `connection: 'keep-alive'` pools outlive a request. Connect tokens are
  per-subject, so per-user subjects should not share a warm pool; create the
  pool per request instead.
- For any long-lived provider, prefer the callback form of `vercelToken`
  (`() => string | Promise<string>`). A captured OIDC string goes stale.

---

## 6. Tool approval is not Connect's job

As in the AI SDK document's "two consents" section: OAuth consent ("may this
app access your Linear account at all") is handled by `connectAuthProvider`;
per-action approval ("create _this_ issue right now") is handled by TanStack's
`needsApproval` on tool definitions. The two are independent and this package
only handles the first.

---

## 7. Not implemented: consent as a TanStack interrupt

A possible V2, recorded here so nobody mistakes it for shipped behavior.
TanStack has generic interrupts (`defineInterrupt`) and a middleware hook
(`onInterruptBoundary` at `beforeModel`). Consent could be modelled as an
interrupt: the server raises it before the model runs, the client renders a
"Connect Linear" card, and after the user grants access a continuation run
resumes with the same message history. That maps directly onto the property
the AI SDK document calls out: the wait is a chat-turn boundary, not a held
connection. If this is pursued, the interrupt payload must carry the consent
URL only, never `request`, `verifier`, or any token.

---

## 8. References

Local:

- `src/mcp/connect-auth-provider.ts`: shared adapter, `consent` option,
  `getConsentChallenge`, `CONNECT_MANAGED_REDIRECT_URL`
- `src/tanstack-ai/index.ts`: `connectMCPTransport` and the per-transport consent choice
- `test/tanstack-ai/create-mcp-client.test.ts`: end-to-end tests against the
  real `@tanstack/ai-mcp` `createMCPClient` / `createMCPClients` over both the
  Streamable HTTP and SSE transports, with a mocked MCP server and mocked
  Connect seam
- `test/tanstack-ai/connect-mcp-transport.test.ts`: consent-mode selection
  and option forwarding

External:

- TanStack AI MCP tools: https://tanstack.com/ai/latest/docs/tools/mcp
- TanStack AI managed MCP clients: https://tanstack.com/ai/latest/docs/tools/mcp-managed
- "Your MCP, your way" (TanStack blog): https://tanstack.com/blog/your-mcp-your-way
- TanStack AI tool approval: https://tanstack.com/ai/latest/docs/tools/tool-approval
- TanStack AI interrupts: https://github.com/TanStack/ai/tree/main/docs/interrupts
- Vercel MCP docs, TanStack AI integration: https://vercel.com/docs/mcp/integrations/tanstack-ai
