<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel activity

List user activity events.

```
vercel activity <command> [options]
```

## Options

- `-a, --all` — Show all team events (ignore linked project auto-scoping).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-N, --next <MS>` — Show next page of results
- `-p, --project <NAME_OR_ID>` — Filter by project (overrides auto-detected linked project).
- `--since <DATE>` — Show events after this date (ISO 8601 or relative: 1d, 7d, 30d).
- `--type <TYPE>` (repeatable) — Filter by event type. Repeatable and comma-separated (e.g. --type deployment --type project-created or --type deployment,project-created).
- `--until <DATE>` — Show events before this date (ISO 8601 or relative).

## Subcommands

### `vercel activity types`

List available event types with descriptions.

```
vercel activity types [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

List all event types

```
$ vercel activity types
```

Output JSON

```
$ vercel activity types --format json
```

## Examples

List events for the linked project

```
$ vercel activity
```

Filter events by multiple types

```
$ vercel activity --type deployment --type project-created --since 7d
```

Filter events by comma-separated types

```
$ vercel activity --type deployment,project-created --since 7d
```

List all team events

```
$ vercel activity --all --since 30d
```

Output JSON

```
$ vercel activity --format json | jq '.events[]'
```

List activity event types

```
$ vercel activity types
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
