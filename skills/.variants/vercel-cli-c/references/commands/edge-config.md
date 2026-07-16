<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel edge-config

Manage Edge Config stores (dashboard API parity)

```
vercel edge-config [command]
```

## Subcommands

### `vercel edge-config add`

Create an Edge Config store

Aliases: `create`

```
vercel edge-config add <slug> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--items <JSON>` — Optional JSON object of initial items `{ "key": <value>, ... }`

#### Examples

Create a store with slug `flags`

```
$ vercel edge-config add flags
```

### `vercel edge-config backups`

List, inspect, or restore Edge Config backups

```
vercel edge-config backups <id-or-slug> [options]
```

#### Options

- `--backup-version <VERSION_ID>` — Fetch a single backup by version id
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Maximum number of backups to list (0-50)
- `--next <CURSOR>` — Pagination cursor from a previous backup list response
- `--restore <VERSION_ID>` — Restore items from the backup version id. Requires confirmation because it updates live Edge Config items
- `-y, --yes` — Skip the confirmation prompt when restoring

#### Examples

List backups for an Edge Config

```
$ vercel edge-config backups my-store
```

Inspect a backup as JSON

```
$ vercel edge-config backups my-store --backup-version <version-id> --format json
```

Restore a backup

```
$ vercel edge-config backups my-store --restore <version-id> --yes
```

### `vercel edge-config get`

Show metadata for an Edge Config (id `ecfg_…` or slug)

Aliases: `inspect`

```
vercel edge-config get <id-or-slug> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

### `vercel edge-config items`

List items in an Edge Config, or fetch one item with `--key`

```
vercel edge-config items <id-or-slug> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-k, --key <KEY>` — When set, fetch a single item by key

### `vercel edge-config list`

List Edge Config stores for the current team (default subcommand)

Aliases: `ls`

```
vercel edge-config list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

List Edge Configs as JSON

```
$ vercel edge-config list --format json
```

### `vercel edge-config remove`

Delete an Edge Config store

Aliases: `rm`, `delete`

```
vercel edge-config remove <id-or-slug> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Accept default value for all prompts

### `vercel edge-config tokens`

List, create (`--add`), or revoke (`--remove`) read tokens for an Edge Config

```
vercel edge-config tokens <id-or-slug> [options]
```

#### Options

- `--add <LABEL>` — Create a token with this label (1–52 characters)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--remove <ID_OR_TOKEN>` (repeatable) — Revoke one or more tokens by id or plaintext token (repeatable). Requires `--yes` in non-interactive mode
- `-y, --yes` — Accept default value for all prompts

### `vercel edge-config update`

Rename an Edge Config (`--slug`) and/or patch items (`--patch` JSON)

```
vercel edge-config update <id-or-slug> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--patch <JSON>` — JSON for `PATCH /v1/edge-config/:id/items`: `{"items":[...]}` or a bare array. Each item needs `operation` (create | update | upsert | delete), `key`, and usually `value` (see REST API: update-edge-config-items-in-batch)
- `--slug <SLUG>` — New slug for the Edge Config

## Examples

List stores

```
$ vercel edge-config list
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
