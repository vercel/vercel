# Chat SDK integration for `@vercel/connect`

`@vercel/connect/chat` adapts Vercel Connect to the [Chat SDK](https://chat-sdk.dev)
(`chat`) platform adapters. Each helper returns a config fragment you spread into
the matching `create*Adapter` factory, wiring a Connect connector for both
directions of traffic:

- **Outbound** (your bot calls the provider API) — a function-form token field
  (`botToken` / `installationToken` / `accessToken`) backed by `getToken` with
  `subject: { type: 'app' }`. The adapter invokes it per API call, so it always
  picks up a fresh, short-lived token; rotation, refresh, and tenancy stay
  delegated to Vercel Connect.
- **Inbound** (the provider calls your bot) — a `webhookVerifier` that validates
  the Vercel OIDC token Connect attaches to
  [trigger-forwarded](https://vercel.com/docs/connect/concepts/triggers)
  webhooks, replacing the provider's native signature check.

The subpath has no dependency on `@chat-adapter/*`: it returns structural config
types, so installing it never pulls in the Chat SDK.

## Helpers

| Helper                 | Adapter                | Outbound field      | Connector example    |
| ---------------------- | ---------------------- | ------------------- | -------------------- |
| `connectSlackAdapter`  | `@chat-adapter/slack`  | `botToken`          | `slack/acme-slack`   |
| `connectGitHubAdapter` | `@chat-adapter/github` | `installationToken` | `github/acme-github` |
| `connectLinearAdapter` | `@chat-adapter/linear` | `accessToken`       | `linear/acme-linear` |

Each helper has the signature `(connector, params?, options?)`:

- `connector` — the connector UID (`slack/acme-slack`) or id (`scl_...`).
- `params` — `ConnectTokenParams` minus `subject` (pinned to `{ type: 'app' }`).
  Forward `installationId`, `scopes`, `validityBufferMs`, etc.
- `options` — `ConnectOptions` (for example `vercelToken` for non-Vercel
  runtimes).

## Setup

### 1. Create a connector with triggers

Create the connector in the Vercel dashboard, or with the CLI, and enable trigger
forwarding so the provider's webhooks reach your project:

```bash
vercel connect create slack --name acme-slack --triggers
```

### 2. Attach your project and register the webhook path

Trigger forwarding posts verified webhooks to a project + branch + path. Point
the path at your Chat SDK webhook route (`/api/webhooks/{platform}`):

```bash
vercel connect attach slack/acme-slack \
  --project my-bot --environment production \
  --triggers --trigger-path /api/webhooks/slack
```

### 3. Pull the development token locally

Vercel injects `VERCEL_OIDC_TOKEN` in deployments automatically. For local
development:

```bash
vercel link
vercel env pull
```

### 4. Wire the adapter

```ts
import { Chat } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { connectSlackAdapter } from '@vercel/connect/chat';

export const bot = new Chat({
  userName: 'my-bot',
  adapters: {
    slack: createSlackAdapter({
      ...connectSlackAdapter('slack/acme-slack'),
    }),
  },
  // state: createRedisState(), etc.
});
```

The webhook route is unchanged — Connect forwards to the same
`/api/webhooks/{platform}` handler.

## Per-platform examples

### Slack

```ts
import { createSlackAdapter } from '@chat-adapter/slack';
import { connectSlackAdapter } from '@vercel/connect/chat';

createSlackAdapter({
  ...connectSlackAdapter('slack/acme-slack', { scopes: ['chat:write'] }),
});
```

Omit `signingSecret` / `SLACK_SIGNING_SECRET` — the Connect `webhookVerifier`
is the freshness boundary.

### GitHub

```ts
import { createGitHubAdapter } from '@chat-adapter/github';
import { connectGitHubAdapter } from '@vercel/connect/chat';

createGitHubAdapter({
  ...connectGitHubAdapter('github/acme-github'),
  userName: 'my-bot[bot]',
});
```

`installationToken` is the installation access token a GitHub App would normally
mint via its private-key JWT exchange — the adapter uses it directly and skips
that exchange.

### Linear

```ts
import { createLinearAdapter } from '@chat-adapter/linear';
import { connectLinearAdapter } from '@vercel/connect/chat';

createLinearAdapter({
  ...connectLinearAdapter('linear/acme-linear'),
  mode: 'agent-sessions',
});
```

Use `mode: 'agent-sessions'` for app-actor installs.

## Custom webhook verification

The platform helpers attach a default verifier that matches the deployment's
project and environment automatically (`projectId` defaults to
`VERCEL_PROJECT_ID`, `environment` to `VERCEL_TARGET_ENV` then `VERCEL_ENV`), so
production, preview, and development each accept only their own tokens. You only
need to build a custom verifier to add extra constraints — for example to accept
several environments or pin an explicit project id:

```ts
import {
  connectSlackAdapter,
  createConnectWebhookVerifier,
} from '@vercel/connect/chat';

createSlackAdapter({
  ...connectSlackAdapter('slack/acme-slack'),
  // Accept both production and preview deployments of this project.
  webhookVerifier: createConnectWebhookVerifier({
    environment: ['production', 'preview'],
  }),
});
```

Avoid hardcoding `environment: 'production'` unless you only ever forward to
production — it would reject preview and development deployments.

## Notes and limitations

- **App-scoped tokens only.** Helpers pin `subject: { type: 'app' }`. End-user
  (`{ type: 'user' }`) OAuth is a separate concern handled outside the adapter.
- **Single installation.** Pass `installationId` to target a specific install;
  otherwise the connector's default installation is used. Multi-tenant routing
  (resolving a token per inbound workspace/org) is not yet a built-in helper.
- **Freshness / replay.** OIDC verification replaces each provider's native
  signature (and timestamp) check, so request freshness relies on the
  short-lived OIDC token's expiry rather than a signed timestamp, and there is no
  built-in nonce/delivery de-duplication. Keep webhook handlers idempotent.
- **Socket Mode is incompatible.** Connect trigger forwarding is HTTP-only; it
  does not apply to the Slack adapter's Socket Mode.
- **Testing.** Connect forwards to deployed URLs, not `localhost`. Test against a
  preview or development deployment.

## Related

- [Vercel Connect overview](https://vercel.com/docs/connect)
- [Connect triggers](https://vercel.com/docs/connect/concepts/triggers)
- [Chat SDK](https://chat-sdk.dev) and its [guides](https://chat-sdk.dev/resources)
