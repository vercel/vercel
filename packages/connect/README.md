# `@vercel/connect`

SDK for obtaining scoped tokens for third-party services on behalf of apps or users. The runtime authenticates the calling Vercel project via [`@vercel/oidc`](https://www.npmjs.com/package/@vercel/oidc) and exchanges the OIDC token for a Vercel Connect-issued credential through the Vercel API.

The package ships four entrypoints:

- `@vercel/connect` — the core token / authorization SDK (no peer deps beyond `@vercel/oidc`).
- `@vercel/connect/ash` — adapter helpers for the [Ash](https://github.com/vercel/ash) connection runtime. `experimental-ash` is an _optional_ peer dependency.
- `@vercel/connect/betterauth` — a [Better Auth](https://www.better-auth.com/) `genericOAuth` provider. `better-auth` is an _optional_ peer dependency.
- `@vercel/connect/authjs` — an [Auth.js](https://authjs.dev/) (NextAuth core) `OAuth2Config` provider. `@auth/core` is an _optional_ peer dependency.

Consumers that don't use a given integration never load it.

## Install

```sh
pnpm add @vercel/connect
# or
npm install @vercel/connect
```

The package is ESM-only (`"type": "module"`).

---

## `@vercel/connect`

### `getToken(connector, params, options?)`

```ts
function getToken(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectOptions,
): Promise<string>;
```

Returns a token string for the given Vercel Connect connector and subject. Wraps `getTokenResponse` and discards the metadata.

```ts
import { getToken } from "@vercel/connect";

const token = await getToken(process.env.CONNECTOR_LINEAR!, {
  subject: { type: "user", id: "user_123" },
});
```

### `getTokenResponse(connector, params, options?)`

```ts
function getTokenResponse(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectOptions,
): Promise<ConnectTokenResponse>;
```

Returns the full token response including `expiresAt`, connector identity (`connector`), `installationId`, `tenantId`, and `externalSubject`. Use this when you need the expiration or any of the metadata fields.

Both functions share an in-process LRU cache (max 100 entries) keyed by `connector` plus the full `params` payload. Cached entries are reused until they fall inside the `validityBufferMs` window before expiration, after which they're refetched.

`connector` accepts either the opaque service connector key (`scl_...`) or the human-readable UID (`oauth/mcp-linear-app`) — both resolve to the same connector on the Vercel Connect side.

### `startAuthorization(connector, params, options?)`

```ts
function startAuthorization(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthorizationOptions,
): Promise<ConnectAuthorizationResponse>;
```

Begins an interactive (user-facing) authorization flow. Returns a `{ request, verifier, url }` triple; redirect the end user to `url`, then call `getToken` / `getTokenResponse` once Vercel Connect signals completion (via the configured `webhook` or `callbackUrl`). The `verifier` is the PKCE verifier — store it alongside the in-flight request so you can correlate the callback.

```ts
import { startAuthorization } from "@vercel/connect";

const { url, verifier } = await startAuthorization(
  process.env.CONNECTOR_LINEAR!,
  { subject: { type: "user", id: "user_123" } },
  { callbackUrl: "https://app.example.com/connect/callback" },
);
```

`callbackUrl` must be `https://` or `http://localhost` (for `vercel dev`). `webhook` must be `https://`. Both are validated client-side before the request is sent.

### Types

```ts
interface ConnectTokenParams {
  subject: { type: "app" } | { type: "user"; id: string; issuer?: string };
  installationId?: string;
  audience?: string[];
  scopes?: string[];
  resources?: string[];
  authorizationDetails?: Array<{ type: string } & Record<string, unknown>>;
  /** Buffer (ms) before expiration to consider the token invalid. Default: 30_000. */
  validityBufferMs?: number;
}

interface ConnectTokenResponse {
  token: string;
  /** Expiration timestamp in ms since epoch. */
  expiresAt: number;
  connector: {
    /** Opaque Vercel Connect connector id. */
    id: string;
    /** Human-readable Vercel Connect connector UID. */
    uid: string;
    /** Vercel Connect connector type identifier. */
    type: string;
  };
  name?: string;
  installationId?: string;
  tenantId?: string;
  externalSubject?: string;
  metadata?: Record<string, unknown>;
}

interface ConnectOptions {
  /** Override the OIDC bearer used to authenticate to the Vercel API. */
  vercelToken?: string;
}

interface ConnectAuthorizationOptions {
  vercelToken?: string;
  /** Browser-redirect target after consent. Must be https:// or http://localhost. */
  callbackUrl?: string;
  /** Server-POST callback. Must be https://. */
  webhook?: string;
}

interface ConnectAuthorizationResponse {
  request: string;
  verifier: string;
  url: string;
}
```

### Errors

All exchange / authorization calls reject with typed errors. Catch them by class to distinguish recoverable consent-required cases from terminal failures.

| Class                                | Meaning                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `NoValidTokenError`                  | Vercel Connect has no valid credential for this subject. For user subjects, recoverable via `startAuthorization`. |
| `UserAuthorizationRequiredError`     | The user has not consented yet (or the previous grant was revoked). Recoverable via `startAuthorization`.         |
| `ConnectorInstallationRequiredError` | The Vercel Connect connector is not installed for this team. Terminal — an operator must install the connector.   |

Any other failure (network, 5xx, etc.) is thrown as a plain `Error` with the HTTP status and response body in the message.

```ts
import {
  getToken,
  NoValidTokenError,
  UserAuthorizationRequiredError,
  ConnectorInstallationRequiredError,
} from "@vercel/connect";

try {
  await getToken(connector, { subject: { type: "user", id } });
} catch (err) {
  if (err instanceof UserAuthorizationRequiredError) {
    // Redirect the user through startAuthorization().
  } else if (err instanceof ConnectorInstallationRequiredError) {
    // Surface "install this Vercel Connect connector" to an operator.
  } else {
    throw err;
  }
}
```

---

## `@vercel/connect/ash`

Adapter helpers for the [Ash](https://github.com/vercel/ash) connection runtime. Importing this subpath requires `experimental-ash >= 0.8.2` to be installed in the consumer project.

### `connect(input)`

Builds an Ash `AuthorizationDefinition` backed by Vercel Connect, collapsing the `getToken` / `startAuthorization` / `completeAuthorization` boilerplate that each Vercel Connect-backed connection would otherwise repeat.

```ts
function connect(
  connector: string,
): AshConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition<ConnectAuthorizationState>
>;
function connect(
  options: AshAuthorizationOptions & { principalType?: "user" },
): AshConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition<ConnectAuthorizationState>
>;
function connect(
  options: AshAuthorizationOptions & { principalType: "app" },
): AshConnectAuthorizationDefinition<NonInteractiveAuthorizationDefinition>;
```

The shorthand form `connect("linear")` is equivalent to `connect({ connector: "linear" })` — `principalType` defaults to `"user"`, so the helper returns an interactive definition unless you opt into `"app"` explicitly.

The return type narrows on `principalType`:

- `"user"` (default) → interactive definition. Ash drives the consent flow through its framework-owned webhook; failures map to `ConnectionAuthorizationRequiredError` so the runtime can prompt the user.
- `"app"` → non-interactive definition (`getToken` only). Failures map to `ConnectionAuthorizationFailedError` with `retryable: false` — there's nobody to consent for an app-scoped connector.

```ts
import { defineMcpClientConnection } from "experimental-ash/connections";
import { connect } from "@vercel/connect/ash";

export default defineMcpClientConnection({
  url: "https://mcp.linear.app/sse",
  description: "Linear workspace — issues, projects, cycles, and comments.",
  auth: connect("oauth/mcp-linear-app"),
});
```

#### `AshAuthorizationOptions`

| Field            | Type                                                                       | Notes                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connector`      | `string`                                                                   | Vercel Connect connector identifier — accepts the opaque `scl_...` key or the human-readable UID (`oauth/mcp-linear-app`).                                             |
| `principalType`  | `"app" \| "user"`                                                          | Defaults to `"user"` when omitted. Selects which definition shape is returned.                                                                                         |
| `tokenParams`    | `Omit<ConnectTokenParams, "subject">`                                      | Forwarded verbatim to every token / authorization call. Use to pin `scopes`, `audience`, `resources`, etc. `subject` is derived from the framework-resolved principal. |
| `connectOptions` | `ConnectOptions`                                                           | Low-level overrides (e.g. `vercelToken`). Most callers leave this unset.                                                                                               |
| `instructions`   | `string`                                                                   | Custom call-to-action shown on `connection.authorization_required`. Defaults to a message derived from the connection's filename.                                      |
| `onError`        | `(error: unknown, phase: ConnectAuthorizationPhase) => Error \| undefined` | Escape hatch for translating raw errors. Return a replacement `Error`, or `undefined` to fall back to the default mapping.                                             |

#### Supporting types

```ts
type AshAuthorizationInput = string | AshAuthorizationOptions;

interface VercelConnectMetadata {
  readonly connector: string;
}

type AshConnectAuthorizationDefinition<
  TAuthorization extends
    | InteractiveAuthorizationDefinition<ConnectAuthorizationState>
    | NonInteractiveAuthorizationDefinition,
> = TAuthorization & {
  readonly vercelConnect: VercelConnectMetadata;
};

type ConnectAuthorizationPhase =
  | "getToken"
  | "startAuthorization"
  | "completeAuthorization";

type ConnectAuthorizationState = {
  readonly verifier: string;
  readonly [key: string]: JsonValue;
};
```

`ConnectAuthorizationState` is what Ash journals between `startAuthorization` and `completeAuthorization`. The index signature satisfies Ash's `State extends JsonValue` constraint; in practice only `verifier` is set.

### `connectSlackCredentials(connector)`

```ts
function connectSlackCredentials(connector: string): SlackChannelCredentials;
```

Builds `SlackChannelCredentials` for the Ash Slack channel adapter, backed by a Vercel Connect connector that stores the workspace's bot token. The returned `botToken` is a function form, invoked once per inbound webhook so the adapter always picks up a fresh token (rotation, refresh, multi-workspace tenancy are all handled server-side).

Slack bot tokens are app-scoped — one token per workspace install, shared across every end-user — so this helper calls Vercel Connect with `subject: { type: "app" }`. Per-user Slack OAuth is a separate concern.

```ts
import { slackRoute } from "experimental-ash/channels/slack";
import { connectSlackCredentials } from "@vercel/connect/ash";

export default slackRoute({
  credentials: connectSlackCredentials("scl_..."),
});
```

The `webhookVerifier` is set to `vercelOidc()`, which authenticates inbound webhooks using the Vercel OIDC token issued for the calling project.

### `connectOAuth(options?)`

```ts
function connectOAuth(options?: ConnectOAuthOptions): AuthFn<Request>;
```

Returns an Ash route auth callback for Vercel Connect OAuth gateway access tokens. It verifies bearer JWTs issued by `https://connect.vercel.com`, requires the gateway access-token claim `typ: "at"`, and by default accepts Connect OAuth audiences shaped `teamId:VERCEL_PROJECT_ID:VERCEL_ENV`; the team id segment is ignored because project ids are globally unique.

```ts
import { httpRoute } from "experimental-ash/channels/http";
import { connectOAuth } from "@vercel/connect/ash";

export default httpRoute({
  auth: connectOAuth({
    connectors: ["slack/mybot"],
  }),
});
```

Pass `audiences` to accept explicit `aud` values, or pass `projectId` and `environment` to build the Connect OAuth audience manually. `connectors` accepts both `scl_...` connector ids and connector UIDs by checking each value against the `clientId` and `clientUid` claims; `tenantIds`, `installationIds`, `subjects`, and `claims` can further narrow accepted gateway tokens.

---

## `@vercel/connect/betterauth`

Better Auth provider for Vercel Connect's OAuth2 endpoints. Importing this subpath requires `better-auth >= 1.5.0` to be installed in the consumer project.

### `connect(options)`

```ts
function connect(options: BetterAuthConnectOptions): GenericOAuthConfig;
```

Returns a `GenericOAuthConfig` entry that drops into `genericOAuth({ config: [...] })` from `better-auth/plugins/generic-oauth`. Vercel Connect's OAuth client authentication is non-standard — the "client secret" is a Vercel OIDC token that has to be fetched per-request — so the helper overrides `getToken` to inject the token endpoint `Authorization` header.

```ts
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { connect } from "@vercel/connect/betterauth";

export const auth = betterAuth({
  plugins: [
    genericOAuth({
      config: [
        connect({
          providerId: "slack",
          connector: process.env.CONNECTOR_SLACK!,
        }),
      ],
    }),
  ],
});
```

#### `BetterAuthConnectOptions`

| Field                | Type                    | Notes                                                                                                 |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`                 | `string`                | Provider id used by Better Auth's generic OAuth plugin. Surfaces in the sign-in URL and account rows. |
| `connector`          | `string`                | Vercel Connect connector identifier — accepts `scl_...` or the human-readable UID.                    |
| `scopes`             | `readonly string[]`     | Scopes to request. `offline_access` is added automatically. Defaults to `["openid"]`.                 |
| `getVercelOidcToken` | `() => Promise<string>` | Override the OIDC token fetcher. Defaults to `getVercelOidcToken` from `@vercel/oidc`.                |

When the OIDC token is readable, the helper scopes the Vercel Connect consent UI to the deployment's Vercel team (`?teamId=...` on the authorization URL); outside Vercel it falls back to the unqualified URL.

---

## `@vercel/connect/authjs`

Auth.js (NextAuth core) provider for Vercel Connect's OAuth2 endpoints. Importing this subpath requires `@auth/core >= 0.37.0` to be installed in the consumer project.

### `connect(options)`

```ts
function connect(options: AuthJsConnectOptions): OAuth2Config<ConnectProfile>;
```

Returns an `OAuth2Config` provider entry for `AuthConfig.providers`. Vercel Connect's token endpoint expects the Vercel OIDC token in place of a static client secret, so the helper declares `token_endpoint_auth_method: "none"` and injects the token endpoint `Authorization` header via Auth.js's `customFetch` symbol.

```ts
import type { AuthConfig } from "@auth/core";
import { connect } from "@vercel/connect/authjs";

export const authConfig: AuthConfig = {
  providers: [
    connect({
      id: "slack",
      name: "Slack",
      connector: process.env.CONNECTOR_SLACK!,
    }),
  ],
};
```

#### `AuthJsConnectOptions`

| Field                | Type                    | Notes                                                                                                            |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                 | `string`                | Provider id surfaced by Auth.js. Becomes the path segment in callback URLs and the `provider` field on accounts. |
| `name`               | `string`                | Human-readable display name used by Auth.js sign-in UIs.                                                         |
| `connector`          | `string`                | Vercel Connect connector identifier — accepts `scl_...` or the human-readable UID.                               |
| `scopes`             | `readonly string[]`     | Scopes to request. `offline_access` is added automatically. Defaults to `["openid"]`.                            |
| `getVercelOidcToken` | `() => Promise<string>` | Override the OIDC token fetcher. Defaults to `getVercelOidcToken` from `@vercel/oidc`.                           |

#### `ConnectProfile`

```ts
interface ConnectProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}
```

Userinfo payload returned by Vercel Connect's OIDC userinfo endpoint. The helper maps it to an Auth.js user via `profile()`; override that callback in the provider config if you need to surface additional fields.

## License

Apache-2.0. See [LICENSE](LICENSE) for details.
