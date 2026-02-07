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

### Resolving Project Identifiers

The package provides a utility function to resolve project slugs to IDs. Team identifiers (both IDs and slugs) work directly with Vercel APIs without resolution:

```typescript
import { resolveProjectId } from '@vercel/oidc';

// Resolve project slug to ID (or pass through if already an ID)
const projectId = await resolveProjectId(authToken, 'my-project', 'my-team');

// Note: Team IDs and slugs both work directly with Vercel APIs - no resolution needed
const teamId = 'my-team'; // or 'team_abc123' - both work
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

### `resolveProjectId(authToken, projectIdOrSlug, teamId?)`

Resolves a project identifier to a project ID. If the input starts with `prj_`, returns it directly. Otherwise, calls the Vercel API to resolve the slug.

**Note:** Team identifiers don't need resolution - Vercel APIs accept both team IDs (`team_*`) and team slugs directly.
