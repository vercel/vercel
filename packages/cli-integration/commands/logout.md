# Logout Command Tests

Tests for `vercel logout` using a Prism mock server against the Vercel OpenAPI spec.

## Logs out successfully

```scrut
$ $VERCEL_CLI_MOCK logout --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Logging out…
> Logged out!
```
