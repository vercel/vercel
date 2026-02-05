# Error Handling Tests

Tests for CLI error cases and exit codes.

## Unknown path shows error

```scrut
$ $VERCEL_CLI /nonexistent/path
Vercel CLI \d+\.\d+\.\d+ (re)
Error: Could not find .*/nonexistent/path.* (re)
[1]
```

## Missing required args shows error with help hint

```scrut
$ $VERCEL_CLI dns add
Vercel CLI \d+\.\d+\.\d+ (re)
Error: Invalid number of arguments. See: `vercel dns --help` for usage.
[1]
```

## Invalid flag shows error

```scrut
$ $VERCEL_CLI --notaflag
Vercel CLI \d+\.\d+\.\d+ (re)
Error: unknown or unexpected option: --notaflag
[1]
```

## Switch rejects --token flag

```scrut
$ $VERCEL_CLI_MOCK switch --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Error: This command doesn't work with "--token". Please use "--scope".
Learn More: https://err.sh/vercel/no-token-allowed
[1]
```

## Domains add requires two arguments

```scrut
$ $VERCEL_CLI_MOCK domains add example.test --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Error: `vercel domains add <domain> <project>` expects two arguments.
[1]
```

## Domains move shows not-found error with hint

```scrut
$ $VERCEL_CLI_MOCK domains move example.com my-team --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Fetching domain example.com under jdoe
Error: Domain not found under jdoe
> Run `vercel domains ls` to see your domains.
[1]
```

## Deploy requires confirmation in non-interactive mode

```scrut
$ $VERCEL_CLI
Vercel CLI \d+\.\d+\.\d+ (re)
Error: Command `vercel deploy` requires confirmation. Use option "--yes" to confirm.
[1]
```

## Promote requires confirmation in non-interactive mode

```scrut
$ $VERCEL_CLI promote
Vercel CLI \d+\.\d+\.\d+ (re)
Error: Command `vercel promote` requires confirmation. Use option "--yes" to confirm.
[1]
```

## Integration list requires correct arguments

```scrut
$ $VERCEL_CLI_MOCK integration ls --token testtoken123
Vercel CLI \d+\.\d+\.\d+ (re)
Error: Invalid number of arguments. Usage: `vercel integration list \[project\]` (re)
[1]
```
