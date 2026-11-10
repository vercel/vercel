# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. Authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential.

Eight entrypoints, all ESM:

- `@vercel/connect` — core token / authorization SDK
- `@vercel/connect/chat` — adapter helpers for the [Chat SDK](https://chat-sdk.dev) (`chat`): `connectSlackAdapter`, `connectDiscordAdapter`, `connectGitHubAdapter`, `connectLinearAdapter`, `connectNotionAdapter`, `connectTelegramAdapter`, `connectSendblueAdapter`, `connectTeamsAdapter` (no Chat SDK dependency — returns structural config)
- `@vercel/connect/ai-sdk` — [Vercel AI SDK](https://ai-sdk.dev) glue: re-exports `connectAuthProvider` for MCP transports (optional peers: `ai`, `@ai-sdk/mcp`)
- `@vercel/connect/mcp` — canonical MCP-spec `OAuthClientProvider` for any MCP client (no SDK dependency; returns a self-contained `ConnectOAuthClientProvider` assignable to `@ai-sdk/mcp` and `@modelcontextprotocol/sdk`)
- `@vercel/connect/tanstack-ai` — [TanStack AI](https://tanstack.com/ai) glue: `connectMCPTransport` builds a `@tanstack/ai-mcp` transport config with a Connect `authProvider` (eager consent on Streamable HTTP, spec 401 flow on SSE), plus `getConsentChallenge` (no TanStack, AI SDK, or MCP SDK dependency)
- `@vercel/connect/eve` — adapter helpers for [Eve](https://github.com/vercel/eve) connections (optional peer: `eve`)
- `@vercel/connect/betterauth` — [Better Auth](https://www.better-auth.com/) `genericOAuth` provider (optional peer: `better-auth`)
- `@vercel/connect/authjs` — [Auth.js](https://authjs.dev/) `OAuth2Config` provider (optional peer: `@auth/core`)

## Install

```sh
pnpm add @vercel/connect
```

## Usage

### Core SDK

```ts
import { getToken } from '@vercel/connect';

const token = await getToken(process.env.CONNECTOR_LINEAR!, {
  subject: { type: 'user', id: 'user_123' },
});
```

For a Passport-authenticated user, you can pass the identity returned by
`requireIdentity` from `@vercel/passport` as the subject:

```ts
import { getToken } from '@vercel/connect';
import { requireIdentity } from '@vercel/passport';

const identity = await requireIdentity();

const token = await getToken('slack/xaa-slack', {
  subject: identity,
  scopes: ['users:read'],
});
```

To start an authorization request for a user, use `startAuthorization`:

```ts
import { startAuthorization } from '@vercel/connect';

const { url } = await startAuthorization(
  process.env.CONNECTOR_LINEAR!,
  { subject: { type: 'user', id: 'user_123' } },
  { callbackUrl: 'https://example.com/settings/integrations' }
);
```

### Chat SDK

Spread the helper into the matching `create*Adapter` factory. Each helper
wires outbound app-scoped tokens; trigger-capable providers also receive
inbound Connect webhook verification via Vercel OIDC.

```ts
import { createSlackAdapter } from '@chat-adapter/slack';
import { connectSlackAdapter } from '@vercel/connect/chat';

createSlackAdapter({
  ...connectSlackAdapter('slack/acme-slack'),
  userName: 'my-bot',
});
```

`connectDiscordAdapter` (`botToken` and `applicationId`),
`connectGitHubAdapter` (`installationToken`), and `connectLinearAdapter`
(`accessToken`) follow the same shape. `connectSendblueAdapter` supplies a
lazy Sendblue `accessToken` and Connect OIDC webhook verifier.
`connectTeamsAdapter` supplies a lazy Microsoft Teams `appId`, a scope-aware
`token` callback for Bot Framework and Microsoft Graph, and Connect OIDC webhook
verification. Use it with a Teams adapter release that supports lazy `appId`
and `webhookVerifier`:

```ts
import { createTeamsAdapter } from '@chat-adapter/teams';
import { connectTeamsAdapter } from '@vercel/connect/chat';

createTeamsAdapter({
  ...connectTeamsAdapter('microsoft-teams/my-bot'),
});
```

`connectNotionAdapter` supplies only the outbound `token`; native Notion
webhooks still require `NOTION_VERIFICATION_TOKEN`. `connectTelegramAdapter`
supplies only `botToken`; Telegram retains native webhook verification or
polling. See the
[Chat SDK integration guide](https://github.com/vercel/vercel/blob/main/packages/connect/docs/chat-integration.md)
for connector setup, trigger forwarding, and per-platform examples.

### Vercel AI SDK + MCP

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { streamText } from 'ai';
import {
  connectAuthProvider,
  ConsentRequiredError,
} from '@vercel/connect/ai-sdk';

const mcp = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://mcp.linear.app',
    authProvider: connectAuthProvider('oauth/linear', {
      subject: { type: 'user', id: 'user_123' },
    }),
  },
});

try {
  const result = await streamText({
    model: 'openai/gpt-5.4',
    tools: await mcp.tools(),
    prompt,
  });
  return result.toUIMessageStreamResponse();
} catch (err) {
  if (err instanceof ConsentRequiredError) return Response.redirect(err.url);
  throw err;
}
```

Tool-call approval (Human-in-the-Loop) is independent of Connect — use the AI
SDK's `toolApproval` option or `wrapMcpTools` from `@ai-sdk/policy-opa`.

Non-AI-SDK MCP clients (the official MCP TypeScript SDK, Mastra, etc.)
can import the same `connectAuthProvider` from `@vercel/connect/mcp`.
TanStack AI has its own subpath, `@vercel/connect/tanstack-ai`, described
below.

### TanStack AI + MCP

`@tanstack/ai-mcp`'s `createMCPClient` passes `transport.authProvider`
straight to the official `@modelcontextprotocol/sdk` transports.
`connectMCPTransport` builds that transport config with a Connect-backed
`authProvider` and picks the consent mode per transport: on Streamable HTTP
(`type: 'http'`) a missing grant fails eagerly inside `createMCPClient`, at
the route boundary, instead of mid-run inside a tool call where TanStack
would feed the error back to the model as text; on SSE it keeps the MCP-spec
401 flow, because the SSE EventSource would turn an eager throw into a
reconnect loop. TanStack wraps connect failures in `MCPConnectionError`;
`getConsentChallenge` looks through the `cause` chain for you. The adapter
also supplies a fixed discovery state so the official SDK never fetches OAuth
metadata from URLs the MCP server names in `WWW-Authenticate`, and the
transport refuses HTTP redirects by default (`redirect: 'error'`, as in
`@ai-sdk/mcp`).

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

`createMCPClients` pools take the same per-entry transport config, so one
`connectMCPTransport` per connector drops in. `connectAuthProvider` is also
re-exported for hand-built transports; only pass `consent: 'eager'` with
`type: 'http'`. Tool-call approval remains independent of Connect: use
TanStack's `needsApproval` on tool definitions. See the
[TanStack AI integration guide](https://github.com/vercel/vercel/blob/main/packages/connect/docs/tanstack-ai-mcp-integration.md)
for the eager-consent rationale, the SSE caveat, pool caveats, and the
`redirectUrl` fix for official-SDK transports.

### Eve

Use channel-specific credential helpers with Eve's native channels.
`connectSendblueCredentials` resolves the app-scoped bearer token and managed
sending line together, and includes Vercel OIDC webhook verification. When the
connector has multiple lines, pass `fromNumber` to choose one.

```ts
import { connectSendblueCredentials } from '@vercel/connect/eve';
import { sendblueChannel } from 'eve/channels/sendblue';

export default sendblueChannel({
  credentials: connectSendblueCredentials('sendblue/my-agent'),
});
```

For managed Microsoft Teams bots, `connectTeamsCredentials` resolves the
public bot application id and short-lived Bot Framework token without exposing
the managed app's federated credential. It also verifies Connect-forwarded
activities with Vercel OIDC.

```ts
import { connectTeamsCredentials } from '@vercel/connect/eve';
import { teamsChannel } from 'eve/channels/teams';

export default teamsChannel({
  credentials: connectTeamsCredentials('microsoft-teams/my-agent'),
});
```

```ts
import { defineMcpClientConnection } from 'eve/connections';
import { connect } from '@vercel/connect/eve';

export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/sse',
  auth: connect({ connector: 'linear', autoProvision: true }),
});
```

By default, `connect()` only uses connectors already linked to the project and
does not provision or modify connectors at runtime. Pass `autoProvision: true`
to opt in. When enabled, `connect()` first tries the token or authorization
request; if the connector is missing or not linked, it provisions or links the
connector and retries the request once.

### Better Auth

```ts
import { genericOAuth } from 'better-auth/plugins';
import { connect } from '@vercel/connect/betterauth';

genericOAuth({ config: [connect({ connector: 'linear' })] });
```

### Auth.js

```ts
import { connect } from '@vercel/connect/authjs';

const providers = [connect({ connector: 'linear' })];
```

See the source under `src/` for the full API (additional helpers like `revokeToken`, `getTokenResponse`, `startAuthorization`, `experimental_startInstallation`, typed error classes, and per-adapter options).

Experimental [MCP event subscription management](./docs/mcp-events.md) is available through `@vercel/connect/mcp`.

### Experimental eve event integration

`connect()` also exposes a runtime-only `vercelConnect.experimental_events`
bridge for eve's event-enabled connections. eve can create a managed AI SDK
adapter using the current authenticated principal and its framework-owned
receiver path. It reuses the provider's `createSubject` mapping and
`tokenParams`, including scopes, installation, audience, and resources. Creating
the provider or adapter performs no network requests or subscriptions.

The bridge also verifies Connect deliveries with the existing MCP event verifier.
eve must then authorize each delivery against its saved session/subscription
binding before invoking an authored callback. The bridge does not implement
eve's inbox, session dispatch, or persistence. Those require the matching eve
integration release.

Event management uses deployment OIDC and the default Connect region, independently
of the provider's `connectOptions.vercelToken` and `connectOptions.region`
credential options. Event request failures use the provider's usual error
translation. Compiler metadata must omit the live bridge and continue serializing
only `connector` and `requirement`.
