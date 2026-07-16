<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel alerts

List alert groups, inspect a group, or manage alert rules (see `alerts rules`).

```
vercel alerts <command> [options]
```

## Options

- `--ai` — Print AI-focused sections (title, resolved time, summary, key findings) instead of table output.
- `-a, --all` — Show team-wide alerts (ignore linked project auto-scoping).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <NUMBER>` — Number of results to return per page (default: 20, max: 100)
- `-p, --project <NAME_OR_ID>` — Filter by project (overrides auto-detected linked project).
- `--since <ISO_DATE>` — Start of time range (ISO-8601). Defaults to 24 hours ago if not provided.
- `--type <TYPE>` (repeatable) — Filter by alert type. Repeatable and comma-separated (for example --type usage_anomaly,error_anomaly).
- `--until <ISO_DATE>` — End of time range (ISO-8601). Defaults to now.

## Subcommands

### `vercel alerts inspect`

Show details for a single alert group

```
vercel alerts inspect <groupId> [options]
```

#### Options

- `-a, --all` — Use team-wide scope (ignore linked project auto-scoping).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Filter by project (overrides auto-detected linked project).

#### Examples

Inspect a group in the linked project

```
$ vercel alerts inspect grp_abc123
```

Inspect as JSON

```
$ vercel alerts inspect grp_abc123 --format json
```

### `vercel alerts rules`

Create, list, update, or delete alert notification rules (dashboard parity).

```
vercel alerts rules <command>
```

##### `vercel alerts rules add`

Create an alert rule from a JSON body file

Aliases: `create`

```
vercel alerts rules add [options]
```

###### Options

- `-a, --all` — Team-wide rules only (omit project filter; ignore linked project).
- `--body <PATH>` — Path to JSON for the new rule. Do not include id or teamId; the API assigns them.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project scope (overrides linked project). Requires team context.

###### Examples

Create from file

```
$ vercel alerts rules add --body ./rule.json
```

##### `vercel alerts rules inspect`

Show one alert rule by id

Aliases: `get`

```
vercel alerts rules inspect <ruleId> [options]
```

###### Options

- `-a, --all` — Team-wide rules only (omit project filter; ignore linked project).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project scope (overrides linked project). Requires team context.

###### Examples

Inspect a rule

```
$ vercel alerts rules inspect ar_abc123
```

JSON output

```
$ vercel alerts rules inspect ar_abc123 --format json
```

##### `vercel alerts rules ls`

List alert rules for the current scope

Aliases: `list`

```
vercel alerts rules ls [options]
```

###### Options

- `-a, --all` — Team-wide rules only (omit project filter; ignore linked project).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project scope (overrides linked project). Requires team context.

###### Examples

List rules for the linked project

```
$ vercel alerts rules ls
```

List team-wide rules

```
$ vercel alerts rules ls --all
```

JSON output

```
$ vercel alerts rules ls --format json
```

##### `vercel alerts rules rm`

Delete an alert rule

Aliases: `remove`, `delete`

```
vercel alerts rules rm <ruleId> [options]
```

###### Options

- `-a, --all` — Team-wide rules only (omit project filter; ignore linked project).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project scope (overrides linked project). Requires team context.
- `-y, --yes` — Accept default value for all prompts

###### Examples

Delete with confirmation

```
$ vercel alerts rules rm ar_abc123
```

Delete without prompt

```
$ vercel alerts rules rm ar_abc123 --yes
```

##### `vercel alerts rules update`

Patch an alert rule from a JSON body file

Aliases: `patch`

```
vercel alerts rules update <ruleId> [options]
```

###### Options

- `-a, --all` — Team-wide rules only (omit project filter; ignore linked project).
- `--body <PATH>` — Path to JSON with fields to update (partial document).
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project scope (overrides linked project). Requires team context.

###### Examples

Update from file

```
$ vercel alerts rules update ar_abc123 --body ./patch.json
```

#### Examples

List rules

```
$ vercel alerts rules ls
```

Add a rule

```
$ vercel alerts rules add --body ./rule.json
```

## Examples

List alerts for the linked project

```
$ vercel alerts
```

List team-wide alerts

```
$ vercel alerts --all
```

Filter by type

```
$ vercel alerts --type usage_anomaly --type error_anomaly
```

Output JSON

```
$ vercel alerts --format json
```

Custom time range

```
$ vercel alerts --since 2026-03-01T00:00:00.000Z --until 2026-03-02T00:00:00.000Z
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
