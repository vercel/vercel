<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel webhooks

Manage webhooks

Aliases: `webhook`

```
vercel webhooks [command]
```

## Subcommands

### `vercel webhooks create`

Create a new webhook

Aliases: `add`

```
vercel webhooks create <url> [options]
```

#### Options

- `-e, --event <EVENT>` (repeatable) — Webhook event to subscribe to (can be used multiple times)
- `-p, --project <PROJECT_ID>` (repeatable) — Project ID to associate with the webhook (can be used multiple times)

#### Examples

Create a webhook for deployment events

```
$ vercel webhooks create https://example.com/webhook --event deployment.created --event deployment.ready
```

### `vercel webhooks get`

Displays information related to a webhook

Aliases: `inspect`

```
vercel webhooks get <id> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

### `vercel webhooks list`

Show all webhooks (default subcommand)

Aliases: `ls`

```
vercel webhooks list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

List all webhooks as JSON

```
$ vercel webhooks ls --format json
```

### `vercel webhooks remove`

Remove a webhook

Aliases: `rm`, `delete`

```
vercel webhooks remove <id> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when removing a webhook

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
