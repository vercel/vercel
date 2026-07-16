<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel bisect

Bisect the current project interactively or via an automated test script.

```
vercel bisect [options]
```

## Options

- `-b, --bad <URL>` — Known bad URL
- `-g, --good <URL>` — Known good URL
- `-o, --open <URL>` — Automatically open each URL in the browser
- `-p, --path <PATH>` — Subpath of the deployment URL to test
- `-r, --run <SCRIPT>` — Test script to run for each deployment

## Examples

Bisect the current project interactively

```
$ vercel bisect
```

Bisect with a known bad deployment

```
$ vercel bisect --bad example-310pce9i0.vercel.app
```

Automated bisect with a run script

```
$ vercel bisect --run ./test.sh
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
