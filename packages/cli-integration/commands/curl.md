# Curl Command Tests

Tests for `vercel curl` beta command.

## Shows beta banner and requires confirmation

```scrut
$ $VERCEL_CLI_MOCK curl /v2/user --token testtoken123
Vercel CLI \d+\.\d+\.\d+.* (re)
Error: Command `vercel curl` requires confirmation. Use option "--yes" to confirm.
[1]
```
