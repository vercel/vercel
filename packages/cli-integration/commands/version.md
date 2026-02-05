# Version Command Tests

Tests for `vercel --version` command.

## Shows version number

```scrut
$ $VERCEL_CLI --version
Vercel CLI \d+\.\d+\.\d+.* (re)
\d+\.\d+\.\d+ (re)
```

## Short flag also works

```scrut
$ $VERCEL_CLI -v
Vercel CLI \d+\.\d+\.\d+.* (re)
\d+\.\d+\.\d+ (re)
```
