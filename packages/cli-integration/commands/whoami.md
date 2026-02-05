# Whoami Command Tests

Tests for `vercel whoami` using a Prism mock server against the Vercel OpenAPI spec.

## Shows username from API

```scrut
$ $VERCEL_CLI_MOCK whoami --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
jdoe
```

## Shows username in JSON format

```scrut
$ $VERCEL_CLI_MOCK whoami --token testtoken123 --format json
Vercel CLI \d+\.\d+\.\d+ (re)
{
  "username": "jdoe",
  "email": "me@example.com",
  "name": "John Doe"
}
```
