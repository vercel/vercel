# `@vercel/cli-exec`

Helpers for locating and executing the Vercel CLI from other Node packages.

## API

### `findVercelCli(options?)`

Resolves the Vercel CLI executable without running it.

- Prefers the nearest `node_modules/.bin/vercel`
- Falls back to the provided `PATH`
- Returns `null` when no usable CLI installation is found

### `execVercelCli(args, options?)`

Resolves and runs the Vercel CLI, returning:

- `stdout`
- `stderr`
- `invocation`

It preserves access to local `node_modules/.bin` entries and Node itself even
when the caller passes a sanitized `PATH`.

### `clearVercelCliCache()`

Clears cached CLI lookups. Use this when a long-lived process needs to pick up
an install or uninstall that happened after an earlier resolution attempt.

### `VercelCliError`

Thrown when resolution or execution fails. The `code` field is one of:

- `VERCEL_CLI_INVALID_CWD`
- `VERCEL_CLI_NOT_FOUND`
- `VERCEL_CLI_PERMISSION_DENIED`
- `VERCEL_CLI_ERRORED`
- `VERCEL_CLI_TIMED_OUT`
- `VERCEL_CLI_CANCELED`
- `VERCEL_CLI_SIGNALED`
- `VERCEL_CLI_EXEC_FAILED`

Available fields:

- `message`: human-readable error message
- `code`: stable machine-readable error code
- `invocation`: resolved CLI command metadata when a command was selected
- `stdout`: captured standard output when the child process produced output
- `stderr`: captured standard error when the child process produced output
- `exitCode`: numeric exit code for non-zero process exits
- `cause`: original underlying error when available
