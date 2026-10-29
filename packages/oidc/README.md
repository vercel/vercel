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

### Immutable AWS project identity

`exchangeVercelAwsOidcToken({ token, skipCache? })` exchanges a standard project
OIDC token for an AWS web identity token with an immutable team/project subject.
The token expires within five minutes and no later than the source token. Its
cache is bounded, expires with the token, and is separate from custom-audience
exchanges. Requests time out after ten seconds and do not follow redirects.

Use this only after the AWS role trusts the `aws-v1/owner/<team_id>/project/<project_id>/environment/<environment>`
subject format. Custom environments use `environment/custom/<environment_id>`.
Existing standard tokens and custom-audience exchanges are unchanged. The
exchange must be deployed before enabling consumers; failures never fall back
to the source token.
