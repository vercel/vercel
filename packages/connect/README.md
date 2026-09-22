# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. Authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential.

Seven entrypoints, all ESM:

- `@vercel/connect` — core token / authorization SDK
- `@vercel/connect/chat` — adapter helpers for the [Chat SDK](https://chat-sdk.dev) (`chat`): `connectSlackAdapter`, `connectDiscordAdapter`, `connectGitHubAdapter`, `connectLinearAdapter`, `connectNotionAdapter`, `connectTelegramAdapter`, `connectSendblueAdapter` (no Chat SDK dependency — returns structural config)
- `@vercel/connect/ai-sdk` — [Vercel AI SDK](https://ai-sdk.dev) glue: re-exports `connectAuthProvider` for MCP transports (optional peers: `ai`, `@ai-sdk/mcp`)
- `@vercel/connect/mcp` — canonical MCP-spec `OAuthClientProvider` for any MCP client (optional peer: `@ai-sdk/mcp`)
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

### Eve

Use `connectSendblueCredentials` with Eve's native Sendblue channel. It
resolves the app-scoped bearer token and managed sending line together, and
includes Vercel OIDC webhook verification. When the connector has multiple
lines, pass `fromNumber` to choose one.

```ts
import { connectSendblueCredentials } from '@vercel/connect/eve';
import { sendblueChannel } from 'eve/channels/sendblue';

export default sendblueChannel({
  credentials: connectSendblueCredentials('sendblue/my-agent'),
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
