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

### Validating an OIDC Token

```typescript
import {
  isValidVercelOidcToken,
  assertValidVercelOidcToken,
  UnacceptableVercelOidcTokenError,
} from '@vercel/oidc';

// Returns true/false
const ok = await isValidVercelOidcToken(
  [
    { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
    { team: 'vercel-labs', project: 'oidc-trigger', environment: 'preview' },
  ],
  token
);

// Throws UnacceptableVercelOidcTokenError if the token is not valid or no
// matcher applies. Verifies the JWT signature, expiration, and standard claims.
try {
  await assertValidVercelOidcToken(
    { team: 'vercel', project: 'vercel-alerts', environment: 'production' },
    token
  );
} catch (err) {
  if (err instanceof UnacceptableVercelOidcTokenError) {
    // reject the request
  }
  throw err;
}
```

### `isValidVercelOidcToken(matchers, token)`

Returns `true` if the given Vercel OIDC token has a valid signature, has not
expired, and matches at least one of the provided matchers; otherwise `false`.

Each matcher is matched as a logical AND of its non-`undefined` properties, and
the array of matchers is treated as a logical OR. Supported matcher properties:

- `iss`, `aud`, `sub` &mdash; standard JWT claims
- `team` / `owner` &mdash; team slug
- `teamId` / `owner_id` &mdash; team ID (`team_*`)
- `project` &mdash; project name
- `projectId` / `project_id` &mdash; project ID (`prj_*`)
- `environment` &mdash; `production`, `preview`, or `development`
- `userId` / `user_id` &mdash; user ID (only set in `development`)

A single matcher object (not wrapped in an array) is also accepted.

### `assertValidVercelOidcToken(matchers, token)`

Same as `isValidVercelOidcToken`, but throws `UnacceptableVercelOidcTokenError`
when no matcher applies or the token cannot be verified.
