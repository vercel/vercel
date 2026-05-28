---
"@vercel/connect": minor
---

Expose a `vercelConnect: { connector }` marker on every authorization definition returned by `connect(...)` from `@vercel/connect/ash`. The new field is opaque to runtime token-fetching (the `getToken` / `startAuthorization` / `completeAuthorization` callbacks are unchanged) and exists so downstream tooling can detect Vercel Connect-backed connections at compile time without inspecting closure state.

The most immediate consumer is the Ash compiler: with this marker, `experimental-ash` can include the connector identifier in its agent-summary build output, and the Vercel dashboard can deep-link from a project's connections section to the matching `/[teamSlug]/[project]/connect/[clientId]` settings page.

```ts
import { connect } from "@vercel/connect/ash";

const auth = connect("oauth/mcp-linear-app");
auth.vercelConnect.connector; // "oauth/mcp-linear-app"
```

The marker carries whatever value the author passed to `connect()` (UID or `scl_...`); both forms continue to address the same connector on the Vercel Connect side.

New exports from `@vercel/connect/ash`:

- `VercelConnectMetadata` — the marker shape (`{ connector: string }`).
- `AshConnectAuthorizationDefinition<T>` — type helper that augments a base Ash `AuthorizationDefinition` with the marker field; the existing `connect()` overloads now return narrowed instances of this type.

## ⚠️ Requires updating `experimental-ash` in lockstep

Older versions of `experimental-ash` reject the new `vercelConnect` field via their auth-definition validator (`expectOnlyKnownKeys`), so a naïve `pnpm update @vercel/connect` against an unchanged Ash version would surface as an `ash build` error like:

```
Expected the connection export ... The "auth" field has unknown key "vercelConnect".
```

The peer-dependency range on `experimental-ash` has been bumped to `>=0.8.2`, which is the first release that recognizes the marker (vercel/ash#541). Consumers using the `@vercel/connect/ash` subpath need to update both packages together — pnpm/npm will surface the version mismatch at install time.

Consumers of `@vercel/connect` who **don't** import the `/ash` subpath (i.e., who only use `getToken`, `startAuthorization`, the better-auth provider, or the auth.js provider) are unaffected — those paths don't load the marker and don't depend on Ash.
