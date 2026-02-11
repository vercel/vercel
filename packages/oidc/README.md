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

### `getVercelOidcTokenSync()`

Synchronously gets the current OIDC token without refreshing. Use `getVercelOidcToken()` if you need automatic refresh in development.
