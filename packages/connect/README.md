# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. Authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential.

Six entrypoints, all ESM:

- `@vercel/connect` — core token / authorization SDK
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

```ts
import { defineMcpClientConnection } from 'eve/connections';
import { connect } from '@vercel/connect/eve';

export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/sse',
  auth: connect('linear'),
});
```

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

See the source under `src/` for the full API (additional helpers like `revokeToken`, `getTokenResponse`, `startAuthorization`, typed error classes, and per-adapter options).
