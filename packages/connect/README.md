# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. Authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential.

Six entrypoints, all ESM:

- `@vercel/connect` — core token / authorization SDK
- `@vercel/connect/ai-sdk` — [Vercel AI SDK](https://ai-sdk.dev) glue: `connectAuthProvider` for MCP transports and `withConsentApproval` for AI SDK v7 Human-in-the-Loop (optional peers: `ai`, `@ai-sdk/mcp`)
- `@vercel/connect/mcp` — canonical MCP-spec `OAuthClientProvider` for any MCP client (optional peer: `@ai-sdk/mcp`)
- `@vercel/connect/ash` — adapter helpers for [Ash](https://github.com/vercel/ash) connections (optional peer: `experimental-ash`)
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
  withConsentApproval,
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

const linear = withConsentApproval(await mcp.tools(), { prefix: 'linear_' });

try {
  const result = await streamText({
    model: 'openai/gpt-5.4',
    tools: linear.tools,
    toolApproval: linear.toolApproval,
    prompt,
  });
  return result.toUIMessageStreamResponse();
} catch (err) {
  if (err instanceof ConsentRequiredError) return Response.redirect(err.url);
  throw err;
}
```

Non-AI-SDK MCP clients (the official MCP TypeScript SDK, Mastra, etc.)
can import the same `connectAuthProvider` from `@vercel/connect/mcp`.

### Ash

```ts
import { defineMcpClientConnection } from 'experimental-ash/connections';
import { connect } from '@vercel/connect/ash';

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

See the source under `src/` for the full API (additional helpers like `getTokenResponse`, `startAuthorization`, typed error classes, and per-adapter options).
