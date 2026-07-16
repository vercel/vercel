<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel alias

Interact with deployment aliases

Aliases: `aliases`, `ln`

```
vercel alias [command]
```

## Subcommands

### `vercel alias list`

Show all aliases

Aliases: `ls`

```
vercel alias list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results

### `vercel alias remove`

Remove an alias using its hostname

Aliases: `rm`

```
vercel alias remove <alias> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing an alias

### `vercel alias set`

Create a new alias (default subcommand)

```
vercel alias set <id-or-url> <alias>
```

## Examples

Add a new alias to `my-api.vercel.app`

```
$ vercel alias set api-ownv3nc9f8.vercel.app my-api.vercel.app
```

Custom domains work as alias targets

```
$ vercel alias set api-ownv3nc9f8.vercel.app my-api.com
```

The subcommand `set` is the default and can be skipped. Protocols in the URLs are unneeded and ignored

```
$ vercel alias api-ownv3nc9f8.vercel.app my-api.com
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
