<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel tokens

Manage your personal Vercel authentication tokens

```
vercel tokens [command]
```

## Subcommands

### `vercel tokens add`

Create a new personal authentication token

Aliases: `create`

```
vercel tokens add <name> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--project <NAME_OR_ID>` — Optional project ID to scope the token to

#### Examples

Create a token

```
$ vercel tokens add "CI deploy"
```

### `vercel tokens list`

List your personal authentication tokens (default subcommand)

Aliases: `ls`

```
vercel tokens list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit` — Maximum number of tokens to return (default 20)

#### Examples

List tokens as JSON

```
$ vercel tokens ls --format json
```

### `vercel tokens remove`

Delete a personal authentication token by ID

Aliases: `rm`, `delete`

```
vercel tokens remove <id> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Remove a token

```
$ vercel tokens rm tok_abc123
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
