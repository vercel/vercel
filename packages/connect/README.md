# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. Authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential.

Four entrypoints, all ESM:

- `@vercel/connect` — core token / authorization SDK
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
