# `@vercel/oidc`

Runtime OIDC helper methods intended to be used with your Vercel Functions

## Usage

### Getting an OIDC Token

```typescript
import { getVercelOidcToken } from '@vercel/oidc';

// Get token using project.json configuration
const token = await getVercelOidcToken();

// Get token with explicit project and team (supports both IDs and slugs)
const token = await getVercelOidcToken({
  project: 'my-project', // or 'prj_abc123'
  team: 'my-team', // or 'team_xyz789'
});

// Get token with expiration buffer (refresh if expires within 5 minutes)
const token = await getVercelOidcToken({
  expirationBufferMs: 5 * 60 * 1000,
});
```

## API

### `getVercelOidcToken(options?)`

Gets the current OIDC token from the request context or environment variable. Will refresh the token if expired in development.

**Options:**

- `project?: string` - Project ID (prj\_\*) or slug
- `team?: string` - Team ID (team\_\*) or slug
- `expirationBufferMs?: number` - Buffer time in ms before expiry to trigger refresh (default: 0)

### `getVercelOidcTokenFromContext()`

Synchronously reads the current OIDC token from the request context (`x-vercel-oidc-token` header) or the `VERCEL_OIDC_TOKEN` environment variable. Does not refresh the token. Use `getVercelOidcToken()` if you need automatic refresh in development.

### `getVercelOidcTokenSync()`

> [!WARNING]
> Deprecated — use [`getVercelOidcTokenFromContext()`](#getverceloidctokenfromcontext) instead. The `Sync` suffix was misleading because `getVercelOidcToken()` is not a sync/async pair with this function — it additionally refreshes the token when expired.

Alias for `getVercelOidcTokenFromContext()`.
