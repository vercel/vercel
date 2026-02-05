---
'@vercel/oidc': minor
---

## New Features

- Add optional `teamId` and `projectId` parameters to `getVercelOidcToken()` to allow explicit control over token refresh behavior instead of always reading from `.vercel/project.json`
- Add `bufferMs` option to `getVercelOidcToken()` to proactively refresh tokens before they expire (useful for avoiding auth errors mid-request)
- Export `getVercelCliToken()` function to allow refreshing CLI tokens with automatic retry on expiry

## Breaking Changes

- Rename `NoAuthConfigError` to `AccessTokenMissingError` for better clarity
- Remove `TokenExpiredError` - now consolidated into `RefreshAccessTokenFailedError` (covers both missing refresh tokens and refresh failures)
- Rename `RefreshFailedError` to `RefreshAccessTokenFailedError` to be more specific
- Remove internal utilities from public API: `readAuthConfig`, `writeAuthConfig`, `isValidAccessToken`, `GetVercelOidcTokenOptions` type, and `AuthConfig` type

## Migration Guide

If you were using the error classes:
```typescript
// Before
import { NoAuthConfigError, TokenExpiredError, RefreshFailedError } from '@vercel/oidc';

// After
import { AccessTokenMissingError, RefreshAccessTokenFailedError } from '@vercel/oidc';
```

If you were using internal utilities (rare), you'll need to implement your own or use the higher-level functions like `getVercelCliToken()`.
