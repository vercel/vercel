# Native Eve integration for `@vercel/connect`

**Status:** implemented (local), pending publish
**Owner:** @allenzhou
**Target release:** `@vercel/connect@0.1`
**Prerequisites:** Eve PR #316 merged (connection principal model); Eve alpha that exports `eve/connections` with `AuthorizationDefinition`, `ConnectionPrincipal`, `TokenResult`, `ConnectionAuthorizationChallenge`, `ConnectionAuthorizationRequiredError`, `ConnectionAuthorizationFailedError`, and `JsonValue`.

## Motivation

Every Eve app that uses Vercel Connect to broker MCP credentials today writes the same ~100 lines per connection. In `eve-demo-app/agent/connections/linear.ts` the only fields that actually differ from Notion are `url`, `description`, the `CONNECTOR_*` env name, and the `instructions` string. Everything else is boilerplate:

- read `connector` from env at module load and throw if missing,
- build the Vercel Connect `subject` from Eve's `ConnectionPrincipal`,
- catch `UserAuthorizationRequiredError` and rethrow as Eve's `ConnectionAuthorizationRequiredError`,
- catch `ConnectorInstallationRequiredError` and rethrow as Eve's `ConnectionAuthorizationFailedError`,
- wrap `startAuthorization` with `callbackUrl: webhook`,
- re-call `getTokenResponse` in `completeAuthorization` because Vercel Connect (not the webhook payload) is authoritative.

That boilerplate is where subtle bugs live — swap one error mapping and the agent silently stops prompting for consent. The proposal is to add a first-class `connect(opts)` helper to `@vercel/connect` that collapses a connection to ~10 lines:

```ts
// agent/connections/linear.ts — target shape
import { connect } from '@vercel/connect/eve';
import { defineMcpClientConnection } from 'eve/connections';

export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/sse',
  description: 'Linear workspace — issues, projects, cycles, and comments.',
  authorization: connect({
    connector: process.env.CONNECTOR_LINEAR!,
  }),
});
```

`connector` is the only required field. `principalType` defaults to `"user"`; authors set `"app"` only for app-scoped credentials. `connector` is a plain string — authors do their own env-var validation at module load (the typical pattern is a top-level `if (!value) throw ...`). Eve fills in `"Authorize <ConnectionName> in your browser to continue."` as the default consent-page prompt using the slot name it already derives from the filesystem path. Authors override via the optional `instructions` field only when they want non-default phrasing.

The helper imports Eve's authorization types directly via type-only imports from `eve/connections` and returns Eve's real `InteractiveAuthorizationDefinition` / `NonInteractiveAuthorizationDefinition`. `eve` is declared as an **optional peer dependency** of `@vercel/connect`, and the helper lives at the `@vercel/connect/eve` subpath, so consumers that don't use Eve never load it.

### principalType → definition shape

Eve's `AuthorizationDefinition` is a discriminated union. The helper maps `principalType` onto it as follows:

| Helper input                      | Returned shape                                            | Runtime behavior                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| omitted / `principalType: "user"` | `InteractiveAuthorizationDefinition` (all 3 methods)      | `getToken` → on `UserAuthorizationRequiredError`, runtime runs `startAuthorization`, suspends on the webhook, then resumes into `completeAuthorization`.                                                                                 |
| `principalType: "app"`            | `NonInteractiveAuthorizationDefinition` (`getToken` only) | `getToken` succeeds for a provisioned app connector; on failure the runtime throws `ConnectionAuthorizationFailedError` (`retryable: false`) because there is no user to consent. Eve v1 disallows interactive OAuth for app principals. |

Eve's `NonInteractiveAuthorizationDefinition` technically accepts `principalType: "user"` too (its "out-of-band OAuth" mode, where a user is authorized through a non-Connect flow and the agent just fetches the token). The helper does **not** expose that combination: with Vercel Connect specifically, a `"user"` token is always provisioned via Vercel Connect's own `startAuthorization`, so dropping the interactive methods would leave the runtime with no recovery path when `getToken` throws `UserAuthorizationRequiredError`. If that combination ever proves useful, it's an additive option later.

## Non-goals

- Not a general-purpose adapter for other agent frameworks. The helper imports Eve types directly; if a different framework adopts the same `AuthorizationDefinition` shape later, that's an additive subpath (`@vercel/connect/<framework>`), not this one.
- Not a rewrite of `getToken` / `startAuthorization`. Those remain the primitives; the helper is glue above them.
- Not a place to redefine framework types. The helper imports `AuthorizationDefinition`, `ConnectionPrincipal`, `TokenResult`, `ConnectionAuthorizationChallenge`, and the two error classes from `eve/connections` rather than mirroring them.

## Shape inventory

### What Vercel Connect already has

- `getToken(connector, params, options?)` / `getTokenResponse(...)` — token exchange with server-side cache; throws `UserAuthorizationRequiredError`, `ConnectorInstallationRequiredError`, `NoValidTokenError`.
- `startAuthorization(connector, params, options?)` returning `{ request, verifier, url }`. Accepts `callbackUrl` and/or `webhook`.
- `ConnectTokenParams` — `subject`, `installationId`, `audience`, `scopes`, `resources`, `authorizationDetails`, `validityBufferMs`.

### What Eve expects (structurally)

`AuthorizationDefinition` is a discriminated union. The interactive branch:

```ts
interface InteractiveAuthorizationDefinition<Resume = JsonValue> {
  readonly principalType: 'user';
  getToken(opts: { principal: ConnectionPrincipal }): Promise<TokenResult>;
  startAuthorization(opts: {
    principal: ConnectionPrincipal;
    callbackUrl: string;
  }): Promise<{ challenge: ConnectionAuthorizationChallenge; resume?: Resume }>;
  completeAuthorization(opts: {
    principal: ConnectionPrincipal;
    callbackUrl: string;
    resume?: Resume;
    callback: AuthorizationCallback; // { params, method, body? } — no headers
  }): Promise<TokenResult>;
}
```

`TokenResult` is `{ token: string; expiresAt?: number }`. `ConnectionPrincipal` is `{ type: "user"; id; issuer; attributes? }` or `{ type: "app" }`.

### Translation matrix

| Vercel Connect                                 | Eve                                                       | Translation                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConnectTokenResponse.token`                   | `TokenResult.token`                                       | pass through                                                                                                                                                               |
| `ConnectTokenResponse.expiresAt`               | `TokenResult.expiresAt`                                   | pass through                                                                                                                                                               |
| `{ type: "user", id }`                         | `{ type: "user", id, issuer, ... }`                       | extract `type` and `id`; ignore `issuer`/`attributes`                                                                                                                      |
| `UserAuthorizationRequiredError`               | `ConnectionAuthorizationRequiredError`                    | throw; Eve suspends turn                                                                                                                                                   |
| `ConnectorInstallationRequiredError`           | `ConnectionAuthorizationFailedError` (`retryable: false`) | deployment issue, not user-fixable                                                                                                                                         |
| `NoValidTokenError`                            | `ConnectionAuthorizationRequiredError`                    | treat as "need consent"                                                                                                                                                    |
| `startAuthorization` `callbackUrl` / `webhook` | `opts.webhook`                                            | always `callbackUrl: webhook` (Eve mints a browser-redirect URL with a branded landing page; `webhook:` would land the user on Vercel Connect's generic close-window page) |

## Proposed API

```ts
// packages/connect/src/eve/connection-authorization.ts

import {
  ConnectionAuthorizationFailedError,
  ConnectionAuthorizationRequiredError,
  type ConnectionAuthorizationChallenge,
  type ConnectionPrincipal,
  type InteractiveAuthorizationDefinition,
  type NonInteractiveAuthorizationDefinition,
  type TokenResult,
} from 'eve/connections';

import type {
  ConnectOptions,
  ConnectTokenParams,
  ConnectTokenSubject,
} from './token.js';

export type ConnectAuthorizationPhase =
  | 'getToken'
  | 'startAuthorization'
  | 'completeAuthorization';

export interface EveAuthorizationOptions {
  /**
   * Vercel Connect connector identifier. Accepts either the UID shown
   * in the Vercel Connect dashboard (e.g. `oauth/mcp-linear-app`)
   * or the opaque SCL form (e.g. `scl_V66vvAu5OJUsQll1LPOOQ`).
   */
  readonly connector: string;

  /**
   * Defaults to `"user"`.
   *
   * - `"user"` — per-end-user token. Returns the full interactive
   *   shape (all three methods); the runtime suspends the turn on a
   *   webhook when Vercel Connect reports the user hasn't authorized
   *   yet.
   * - `"app"` — one shared credential for the agent's own identity.
   *   Returns a non-interactive definition (`getToken` only). Eve
   *   v1 does not support interactive OAuth in app mode.
   */
  readonly principalType?: 'app' | 'user';

  /**
   * Forwarded on every token request. The helper derives `subject`
   * from the principal; any other field is passed through verbatim.
   */
  readonly tokenParams?: Omit<ConnectTokenParams, 'subject'>;

  /**
   * Override how Eve's framework-resolved principal is mapped to a
   * Vercel Connect token subject.
   */
  readonly principalToSubject?: (
    principal: ConnectionPrincipal
  ) => ConnectTokenSubject | Promise<ConnectTokenSubject>;

  /**
   * Forwarded to `@vercel/connect`. Primarily for tests that inject
   * a fake `vercelToken`.
   */
  readonly connectOptions?: ConnectOptions;

  /**
   * Consent-page instructions shown to the user in the
   * `connection.authorization_required` event. When omitted, Eve
   * fills in `"Authorize <ConnectionName> in your browser to
   * continue."` using the slot name it derives from the filesystem
   * path (capitalized first letter). Only set this to override the
   * default phrasing.
   */
  readonly instructions?: string;

  /**
   * Hook for custom error translation. Return an `Error` to rethrow;
   * return `undefined` to fall back to the default translation.
   */
  readonly onError?: (
    error: unknown,
    phase: ConnectAuthorizationPhase
  ) => Error | undefined;
}

/**
 * Returns Eve's real `InteractiveAuthorizationDefinition` /
 * `NonInteractiveAuthorizationDefinition`, narrowed by
 * `principalType`. Omitted `principalType` is treated as `"user"`.
 * Drop directly into `defineMcpClientConnection`.
 */
export function connect(
  options: EveAuthorizationOptions & { readonly principalType?: 'user' }
): InteractiveAuthorizationDefinition;
export function connect(
  options: EveAuthorizationOptions & { readonly principalType: 'app' }
): NonInteractiveAuthorizationDefinition;
export function connect(
  options: EveAuthorizationOptions
): InteractiveAuthorizationDefinition | NonInteractiveAuthorizationDefinition;
```

### Behavior

1. **`getToken`** — derives `subject` from `principal`, merges with `tokenParams`, calls `getTokenResponse`. Translates:

   | Vercel Connect error                                              | Thrown as                                                                                              |
   | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | `UserAuthorizationRequiredError` (user mode)                      | `ConnectionAuthorizationRequiredError`                                                                 |
   | `NoValidTokenError` (user mode)                                   | `ConnectionAuthorizationRequiredError`                                                                 |
   | `UserAuthorizationRequiredError` / `NoValidTokenError` (app mode) | `ConnectionAuthorizationFailedError` (`reason: "app_not_installed"`, `retryable: false`)               |
   | `ConnectorInstallationRequiredError`                              | `ConnectionAuthorizationFailedError` (`reason: "connector_installation_required"`, `retryable: false`) |
   | anything else                                                     | passed through `onError`, then rethrown verbatim                                                       |

2. **`startAuthorization`** — calls Vercel Connect with `callbackUrl: webhook`. Eve's `webhook` parameter is semantically a browser-redirect target — the runtime mints it via `createWebhook({ respondWith: buildAuthorizationCompletePage() })` so the user lands on a branded "you can close this tab" page after consent. That maps to Vercel Connect's `callbackUrl:` semantics, which already accepts both `https://` (prod) and `http://localhost` (vercel dev), so one field covers both. We deliberately do **not** route `https://` URLs into Vercel Connect's `webhook:` (server-POST) field even though that would be more robust to the user closing the consent tab right after IdP callback: that mode shows the user Vercel Connect's generic "close this window" page instead of Eve's branded landing page, and the helper would need to grow protocol-aware logic that diverges from the simple "Eve mints one URL, Vercel Connect redirects there" mental model. Revisit if tab-close timeouts become a real problem in production. Returns `{ challenge: { url, instructions? } }` — the narrowed contract no longer journals a `state`/`resume` blob, so the PKCE verifier never crosses the step boundary. `instructions` is only set when the author provides one — otherwise Eve fills in the default in its runtime step (see `withDefaultAuthorizationInstructions`).

3. **`completeAuthorization`** — ignores the journaled `resume` and the `callback` payload (Vercel Connect is authoritative); re-calls `getTokenResponse`. If it still throws `UserAuthorizationRequiredError` / `NoValidTokenError`, translate to `ConnectionAuthorizationFailedError` with a "Vercel Connect still reports user as unauthorized" message (defaults to `retryable: true` so the model can re-prompt — most cases are network blips or replays).

4. **App-scoped mode** (`principalType: "app"`) — helper returns only `getToken` (no `startAuthorization` / `completeAuthorization`). Vercel Connect gets `subject: { type: "app" }` on every request. Token-fetch failure surfaces as `ConnectionAuthorizationFailedError` with `retryable: false` because there is no user to consent.

5. **Connection name on errors.** The constructor of `ConnectionAuthorizationRequiredError` / `ConnectionAuthorizationFailedError` requires a `connectionName`, but the helper doesn't know it (Eve derives it from the filesystem path). The helper passes a placeholder (`"connect"`) and an explicit `message`; Eve's runtime reads `err.message`, `err.reason`, and `err.retryable` from the throw — it does **not** read `err.connectionName`. The placeholder is therefore inert, and the runtime tags the resulting event with the correct slot name from `input.connectionName`.

## Usage examples

### Minimum — user-scoped

```ts
// agent/connections/linear.ts
import { connect } from '@vercel/connect/eve';
import { defineMcpClientConnection } from 'eve/connections';

const connector = process.env.CONNECTOR_LINEAR;
if (!connector) {
  throw new Error('CONNECTOR_LINEAR is required to use the linear connection.');
}

export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/sse',
  description: 'Linear workspace — issues, projects, cycles, and comments.',
  authorization: connect({
    connector,
  }),
});
```

A missing env var fails at module load (i.e. agent boot). The check lives at the top of each connection file so the failure points at the connection that actually needs the var.

### Minimum — app-scoped (non-interactive)

```ts
// agent/connections/status-api.ts — a shared service the agent polls
// on its own identity, no end-user consent.
import { connect } from '@vercel/connect/eve';
import { defineMcpClientConnection } from 'eve/connections';

export default defineMcpClientConnection({
  url: 'https://status.internal.example.com/mcp',
  description: 'Internal status API (agent-owned credential).',
  authorization: connect({
    connector: process.env.CONNECTOR_STATUS!,
    principalType: 'app',
  }),
});
```

TypeScript narrows the return type: `startAuthorization` and `completeAuthorization` are absent on the app-scoped definition, so you can't accidentally call them downstream.

### Override the consent-page prompt

```ts
authorization: connect({
  connector: process.env.CONNECTOR_NOTION!,
  // Default would be "Authorize Notion in your browser to continue."
  instructions:
    "Notion needs one-time consent to read pages and databases. " +
    "You can revoke this from Notion's Integrations page any time.",
}),
```

### Request additional scopes / audience / resources

All fields on `ConnectTokenParams` except `subject` (which the helper derives from the principal) flow through `tokenParams`:

```ts
authorization: connect({
  connector: process.env.CONNECTOR_LINEAR!,
  tokenParams: {
    scopes: ["read:issues", "write:comments"],
    audience: ["https://api.linear.app"],
    // Vercel Connect's per-request token-freshness buffer. Refresh
    // tokens that expire within 60s rather than the 30s default.
    validityBufferMs: 60_000,
  },
}),
```

Same pattern for `resources`, `installationId`, and `authorizationDetails`.

### Custom subject mapping

By default, app principals map to `{ type: "app" }` and user principals map to
`{ type: "user", id, issuer }`. Use `principalToSubject` when a connector needs
a different subject shape:

```ts
authorization: connect({
  connector: process.env.CONNECTOR_OAUTH!,
  principalToSubject: principal => ({
    type: "jwt-bearer",
    sub: principal.attributes.email,
  }),
}),
```

### Custom error translation

When Vercel Connect (or the underlying IdP) surfaces an error Eve doesn't know how to classify, the `onError` hook lets you rewrite it without copy-pasting the whole try/catch. Because the helper imports Eve's real error classes via the peer dep, you can construct them directly in your hook:

```ts
import { connect } from "@vercel/connect/eve";
import { ConnectionAuthorizationFailedError } from "eve/connections";

authorization: connect({
  connector: process.env.CONNECTOR_GITHUB!,
  onError(error, phase) {
    // GitHub returns org-SSO-required as a specific message shape.
    // Surface it as a non-retryable failure with actionable copy.
    if (
      phase === "getToken" &&
      error instanceof Error &&
      /saml_single_sign_on/i.test(error.message)
    ) {
      return new ConnectionAuthorizationFailedError("github", {
        message:
          "Your GitHub org requires SSO. Sign in to the org at " +
          "https://github.com/orgs/<org>/sso before retrying.",
        reason: "saml_sso_required",
        retryable: false,
      });
    }
    // Fall back to the helper's default translation.
    return undefined;
  },
}),
```

### Test-only — inject a fake Vercel token

For unit tests that stub the Vercel API, pass `connectOptions.vercelToken` so the SDK skips `getVercelOidcToken()`:

```ts
authorization: connect({
  connector: "oauth/test-client",
  connectOptions: { vercelToken: "stub-oidc-token" },
}),
```

## Error classes — staying decoupled

Eve owns `ConnectionAuthorizationRequiredError` / `ConnectionAuthorizationFailedError` in `eve/connections`. The first iteration of this plan considered three approaches:

**Option A: branded duck-typing.** Tag errors with `Symbol.for("eve.error.connection-authorization")` and have Eve discriminate on the brand instead of `instanceof`. Vercel Connect throws plain errors with the brand attached and never imports Eve.

**Option B: optional Eve subpath.** `@vercel/connect/eve` imports Eve's error classes directly via a type-only import + an optional peer dependency. Real `instanceof` works at the call site; consumers that don't use Eve never load the subpath.

**Option C: inject error classes via options.** Every caller passes `{ errors: { AuthorizationRequired, ... } }`. Defeats the purpose of the helper — the boilerplate just moves.

**Decision: Option B.** The helper lives at the `@vercel/connect/eve` subpath. `eve` is declared as an optional peer dependency in `@vercel/connect/package.json`; importing the subpath requires Eve to be installed in the consumer project, but the rest of `@vercel/connect` works without it.

Why we shifted off Option A:

- **Type drift was already a problem.** While the helper structurally mirrored Eve's `AuthorizationDefinition`, every Eve-side change (renaming `instructions`, narrowing `principal.attributes`, adding `reason` codes) silently went out of sync until something broke at runtime. A type-only import from Eve's actual definitions removes the drift surface.
- **The branding work belongs in Eve regardless.** Eve already discriminates on `err.name`, not `instanceof` (see `isConnectionAuthorizationRequiredError`), specifically because of the bundler-duplication risk. That solves the cross-realm problem without needing `Symbol.for`. With `err.name` discrimination already shipped, Option A's primary benefit collapses.
- **Optional peer deps are well-understood.** React, `@types/*` packages, and many lint plugins use this pattern. Subpath exports + `peerDependenciesMeta.optional` keep non-Eve consumers honest: if you only use the low-level Vercel Connect SDK from `@vercel/connect`, nothing pulls Eve in.
- **Inverted layering is a non-issue here.** `@vercel/connect` is a Vercel-platform SDK; `eve` is a separately-published framework. Neither owns the other. The subpath split makes the dependency _opt-in per import_, which is materially different from a hard dep.

Implementation summary:

- `peerDependencies: { "eve": ">=0.6.0-beta.1" }` + `peerDependenciesMeta.eve.optional: true`.
- Subpath export `./eve` → `./dist/eve/index.js` / `./dist/eve/index.d.ts`.
- `src/eve/` imports types and the two error classes from `eve/connections` and throws Eve's actual error instances. `src/index.ts` does **not** re-export anything from `eve/`.

## Package layout

```
packages/connect/src/
  index.ts          # low-level Vercel Connect SDK only (getToken, startAuthorization, errors, types)
  eve/              # helper, exposed at the `@vercel/connect/eve` subpath
  authorization.ts  # unchanged
  token.ts          # unchanged
```

`packages/connect/package.json`:

```jsonc
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./eve": { "types": "./dist/eve/index.d.ts", "default": "./dist/eve/index.js" },
  },
  "peerDependencies": {
    "eve": ">=0.6.0-beta.1",
  },
  "peerDependenciesMeta": {
    "eve": { "optional": true },
  },
  "devDependencies": {
    "eve": "0.6.0-beta.1",
    "typescript": "^5",
  },
}
```

The devDep on `eve` exists so the Vercel Connect repo can typecheck `src/eve/` locally against Eve's published type surface; it's not part of the published artifact.

## Demo app migration

After migration, `agent/connections/linear.ts` and `agent/connections/notion.ts` each drop from ~80 lines to ~15:

```ts
// agent/connections/linear.ts (after)
import { connect } from '@vercel/connect/eve';
import { defineMcpClientConnection } from 'eve/connections';

const connector = process.env.CONNECTOR_LINEAR;
if (!connector) {
  throw new Error('CONNECTOR_LINEAR is required to use the linear connection.');
}

export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/sse',
  description: 'Linear workspace — issues, projects, cycles, and comments.',
  authorization: connect({
    connector,
  }),
});
```

`agent/lib/connect.ts` is deleted — the env-var check is inlined at the top of each connection module (each connection knows its own env var name, so the inline form reads cleaner than a shared helper). The helper never needs the connection name: Eve's orchestrator attaches the slot name (derived from the filesystem path) to re-thrown errors and to the default `instructions` text.

`tsconfig.json` gains an explicit `"types": ["node"]` — pulling in the type-only chain through `@vercel/connect/eve` → `eve` confused tsgo's auto-`@types/*` walk in our setup, and an explicit list pins it deterministically.

## Implementation plan

Sequential; each step validates the next.

1. **Eve prereq PR — [DONE].**

   - The principal-model branch already exposes `AuthorizationDefinition`, `ConnectionPrincipal`, `TokenResult`, `ConnectionAuthorizationChallenge`, and the two error classes from `eve/connections`.
   - `isConnectionAuthorizationRequiredError` / `isConnectionAuthorizationFailedError` discriminate on `err.name` (not `instanceof`), which already addresses the cross-realm/duplicate-package risk.
   - `withDefaultAuthorizationInstructions(challenge, connectionName)` in `src/execution/authorization-challenge-defaults.ts` fills in the default `"Authorize <ConnectionName> in your browser to continue."` text using the slot name; capitalization helper covers hyphenated/empty cases.
   - Eve `0.6.0-beta.1` publishes the principal-model surface consumed by `@vercel/connect/eve`, so the Vercel Connect repo typechecks against the registry package instead of a local shim.

2. **Vercel Connect SDK change — [DONE locally, pending publish].**

   - Add `eve` as an optional peer dep (`peerDependenciesMeta.eve.optional: true`) and as a devDep.
   - Add `./eve` subpath export pointing to `./dist/eve/index.{js,d.ts}`.
   - Implement `connect` in `src/eve/` with type-only imports from `eve/connections`. Drop the structural mirror types and the local error class lookalikes.
   - Keep `src/index.ts` limited to the low-level Vercel Connect SDK (no Eve exports leak to the root entrypoint).
   - **Pending:** unit tests (`packages/connect/src/eve.test.ts`):
     - `getToken` success yields `{ token, expiresAt }`.
     - `getToken` (user) on `UserAuthorizationRequiredError` throws `ConnectionAuthorizationRequiredError`.
     - `getToken` (app) on `UserAuthorizationRequiredError` / `NoValidTokenError` throws `ConnectionAuthorizationFailedError` with `reason: "app_not_installed"`, `retryable: false`.
     - `getToken` on `ConnectorInstallationRequiredError` throws `ConnectionAuthorizationFailedError` with `reason: "connector_installation_required"`, `retryable: false`.
     - `startAuthorization` wraps Vercel Connect response; `callbackUrl` set to the Eve-minted webhook URL.
     - `completeAuthorization` ignores `request`, re-queries Vercel Connect.
     - `principalType: "app"` returns a definition with `getToken` only and always sends `subject: { type: "app" }`.
     - `onError` hook overrides default translation.
     - `connector` is captured once and passed through to Vercel Connect on every callback.
     - Mock `getTokenResponse` / `startAuthorization` via `vi.mock`; no network.

3. **Changeset.** Minor bump on `@vercel/connect`; call out required Eve version range.

4. **Demo app migration — [DONE].**

   - Rewrote `linear.ts` / `notion.ts` to use the helper, with a top-level env-var check that throws on import if the connector id is unset.
   - Deleted `agent/lib/connect.ts`.
   - Added `@types/node` to devDeps and `"types": ["node"]` to `tsconfig.json`.
   - Rerun `scripts/smoke-linear.mjs` and `scripts/smoke-oauth.mjs` after the Eve alpha publishes.

5. **Docs.** Update `connect/README.md`, `connect/skills/vercel-connect/SKILL.md`, and reference the helper from `eve/research/connections/connect-sts-demo-integration.md`.

## Testing strategy

- **Unit (Vercel Connect):** step 2 above, all network mocked.
- **Unit (Eve):** `withDefaultAuthorizationInstructions` tests cover the default-instructions fill-in (already in `src/execution/authorization-challenge-defaults.test.ts`).
- **Integration (demo app):** existing smoke scripts exercise the full Eve runtime + Vercel Connect + IdP. Regression gate.
- **No e2e needed** — the helper is pure glue; Vercel Connect primitives own network behavior and already have coverage.

## Open questions

1. **Forward `issuer` for user principals?** Eve carries `principal.issuer`; Vercel Connect ignores it today. Leave a TODO pointing at the follow-up.
2. **Switch to Vercel Connect's `webhook:` (server-POST) mode for `https://` URLs?** Would survive the user closing the consent tab right after IdP callback, where the current `callbackUrl` browser redirect would be lost. Costs the branded landing page (user sees Vercel Connect's generic close-window page) and adds protocol-aware logic to the helper. Defer until tab-close timeouts show up as a real prod issue.
3. **Auto-load `connector` from `CONNECTOR_<NAME>`?** Saves a line; hides magic. Recommend explicit `connector`.
4. **Inspect `request.url` for `?error=access_denied`?** Today both connections skip this. Vercel Connect's `UserAuthorizationRequiredError` covers it from the server's perspective, but we lose the "user clicked Deny" (terminal) vs "IdP flow still pending" (retryable) distinction. Defer until Vercel Connect surfaces it, or add an `onCallback` hook.
5. **Is `state: { verifier }` useful?** ~~Eve journals it but does not read it. Cheap to keep for debuggability; propose: keep.~~ **Resolved (contract narrowing):** Eve narrowed the contract so secrets no longer cross the step boundary, and the helper now returns only `{ challenge }` from `startAuthorization`. The verifier is no longer journaled. The renamed, secrets-discouraged `resume` field remains available for non-secret correlation, but the helper does not use it.
6. **Rename `connector` → `uid` (or similar) SDK-wide?** The Vercel Connect dashboard labels the value `UID`, the SDK calls it `connector`, and the value can be either a UID slug (`oauth/mcp-linear-app`) or an opaque SCL token (`scl_...`). The helper inherits whatever name the SDK uses. If the SDK ever wants to unify naming, that's a separate SDK-level migration (deprecate `connector`, accept `uid`, bump minor) — not in scope here, but worth raising in the Vercel Connect repo alongside this plan.

## Risk / rollback

- **Blast radius:** additive on the Vercel Connect side. `src/eve/` is reachable only via the new `@vercel/connect/eve` subpath; existing imports of `@vercel/connect` are untouched.
- **Rollback:** revert the Vercel Connect PR; existing explicit-shape connection code still compiles. The `eve/` module is dist-only (no source-level cross-cutting), so the rollback is a single folder delete plus a `package.json` revert.
- **Eve coupling:** scoped to consumers that import `@vercel/connect/eve`. The optional peer dep keeps non-Eve consumers free of `eve` in their lockfile. If Eve ever ships a breaking change to `AuthorizationDefinition`, the helper's typecheck catches it at compile time (vs the previous structural mirror, which silently went out of sync).

## Appendix A — Why not inline this as an Eve helper?

Alternative: put `defineConnectMcpClientConnection` in `eve/connections/connect` and have Eve depend on `@vercel/connect`.

**Against:**

- AGENTS.md rule 22 ("name public definitions for the protocol they target"): Vercel Connect is a service; it belongs with Vercel Connect.
- Eve would take a hard dep on `@vercel/connect` — fine today, bad if we ever split.
- Non-Eve frameworks could not use the helper.

**For:**

- Intellisense discoverability for Eve authors.

**Decision:** keep the helper in Vercel Connect. One extra import is trivial; inverting the dependency is not.

## Appendix B — Token cache interaction

Eve caches `TokenResult` in virtual context per step (`eve/runtime/connections/authorization-tokens.ts`). Vercel Connect caches `ConnectTokenResponse` in-process per `(connector, params)` tuple until `expiresAt - validityBufferMs`. The helper introduces no additional cache:

- First call in a step: Eve cache miss → helper → Vercel Connect SDK → Vercel Connect server.
- Subsequent calls in the same step: Eve cache hit; helper never runs.
- Next step, same turn: Eve cache miss (virtual wiped) → helper → Vercel Connect SDK (cache hit) → no HTTP.
- Turn N+1: same path. Vercel Connect SDK cache persists across turns.

Fast path: Eve virtual cache → Vercel Connect in-memory cache → Vercel Connect server. No correctness implications; just a note for anyone sizing throughput.
