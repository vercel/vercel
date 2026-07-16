<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel connect

Manage connectors (Beta).

Vercel Connect is currently in beta. Behavior, commands, and output may change before general availability.

```
vercel connect <command>
```

## Subcommands

### `vercel connect attach`

Attach a Vercel project to a connector for one or more environments

```
vercel connect attach <connector> [options]
```

#### Options

- `-e, --environment <ENV>` (repeatable) — Environments to enable. Repeatable and comma-separated (e.g. -e production -e preview, or -e production,preview). Defaults to all environments.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (default: current linked project)
- `--trigger-branch <BRANCH>` — Target a specific git branch for the trigger destination (default: production). Only valid with --triggers.
- `--trigger-path <PATH>` — Path on the destination project that receives the forwarded webhook (default: /{service}). Only valid with --triggers.
- `--triggers` — Also register this project as a trigger destination so the connector forwards verified webhooks to it (max 3 destinations per connector)
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Attach the current project to a connector for all environments

```
$ vercel connect attach scl_abc123
```

Restrict to specific environments

```
$ vercel connect attach scl_abc123 -e production -e preview
```

Attach a different project by name

```
$ vercel connect attach slack/my-bot --project my-app
```

Attach and register the project as a trigger destination

```
$ vercel connect attach scl_abc123 --triggers
```

Attach and register a preview-branch trigger destination

```
$ vercel connect attach scl_abc123 --triggers --trigger-branch staging --trigger-path /slack
```

Non-interactive output as JSON

```
$ vercel connect attach scl_abc123 --yes --format=json
```

### `vercel connect create`

Create a new connector

```
vercel connect create <type> [options]
```

#### Options

- `--accent-color <HEX>` — Accent color for the connector icon (e.g. #1A2B3C)
- `--background-color <HEX>` — Background color for the connector icon (e.g. #1A2B3C)
- `--connector-type <TYPE>` — Connector type for non-managed creation. By default, the type is resolved from the service.
- `--data <JSON>` — JSON object for non-managed connector creation. When set, posts directly to the connector create API. Pass `@<path>` to read from a file or `@-` to read from stdin — recommended for secrets (e.g. client secrets), which leak into shell history when passed inline.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--icon <PATH>` — Path to a PNG or JPEG image to use as the connector icon (uploaded to Vercel)
- `-n, --name <NAME>` — Name of the connector
- `--triggers` — Enable webhook triggers for this connector

#### Examples

Create a Slack app

```
$ vercel connect create slack
```

Create with a custom name

```
$ vercel connect create slack --name my-bot
```

Create with webhook triggers enabled

```
$ vercel connect create slack --name my-bot --triggers
```

Create with branding (icon and colors)

```
$ vercel connect create slack --name my-bot --icon ./logo.png --background-color '#1A2B3C' --accent-color '#FF0066'
```

Create a non-managed connector from explicit data

```
$ vercel connect create mcp.linear.app --name linear --data '{"clientId":"abc123"}'
```

Create a non-managed connector, reading credentials from a file (keeps secrets out of shell history)

```
$ vercel connect create slack --name my-bot --connector-type slack --data @slack-app.json
```

Create a non-managed connector, reading credentials from stdin

```
$ cat slack-app.json | vercel connect create slack --name my-bot --connector-type slack --data @-
```

Output as JSON

```
$ vercel connect create slack --format=json
```

### `vercel connect detach`

Detach a Vercel project from a connector

```
vercel connect detach <connector> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (default: current linked project)
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Detach the current project from a connector

```
$ vercel connect detach scl_abc123
```

Detach a different project by name

```
$ vercel connect detach slack/my-bot --project my-app
```

Non-interactive output as JSON

```
$ vercel connect detach scl_abc123 --yes --format=json
```

### `vercel connect list`

List connectors linked to the current project (falls back to every connector in the team when no project is linked or when --all-projects is set)

Aliases: `ls`

```
vercel connect list [options]
```

#### Options

- `--all-projects` — List every connector in the team, regardless of project link
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--limit <COUNT>` — Number of connectors to return per page
- `--next <CURSOR>` — Cursor for the next page of results
- `--search <TEXT>` — Search connectors by name or UID
- `--service <NAME>` (repeatable) — Filter by service name (e.g. slack, mcp.linear.app). Repeatable.
- `--type <TYPE>` (repeatable) — Filter by connector type (slack, github, oauth, custom). Repeatable.

#### Examples

List connectors linked to the current project

```
$ vercel connect list
```

List every connector in the team

```
$ vercel connect list --all-projects
```

Filter by connector type

```
$ vercel connect list --type slack
```

Filter by multiple types

```
$ vercel connect list --type oauth --type github
```

Filter by service name

```
$ vercel connect list --service mcp.linear.app
```

Search by text

```
$ vercel connect list --search linear
```

Combine filters

```
$ vercel connect list --type oauth --search prod
```

Limit the number of results

```
$ vercel connect list --limit 10
```

Fetch the next page of results

```
$ vercel connect list --next <cursor>
```

Output as JSON

```
$ vercel connect list --format=json
```

### `vercel connect open`

Open a connector in the Vercel dashboard

```
vercel connect open <id> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Open a connector by ID

```
$ vercel connect open scl_abc123
```

Open a connector by UID

```
$ vercel connect open slack/my-bot
```

Print the dashboard URL as JSON

```
$ vercel connect open scl_abc123 --format=json
```

### `vercel connect remove`

Delete a connector

Aliases: `rm`

```
vercel connect remove <connector> [options]
```

#### Options

- `-a, --disconnect-all` — Disconnects all projects from the connector before deletion
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when deleting a connector

#### Examples

Delete a connector by ID

```
$ vercel connect remove scl_abc123
```

Delete a connector by UID

```
$ vercel connect remove slack/my-bot
```

Disconnect all projects from a connector, then delete it

```
$ vercel connect remove scl_abc123 --disconnect-all
$ vercel connect remove slack/my-bot -a
```

Skip the confirmation prompt

```
$ vercel connect remove scl_abc123 --yes
```

Output as JSON

```
$ vercel connect remove scl_abc123 --format=json --yes
```

### `vercel connect revoke-tokens`

Revoke tokens issued from a connector

```
vercel connect revoke-tokens <connector> [options]
```

#### Options

- `--all-tokens` — Revoke every token for all users and installations. Requires team owner or member permissions.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--my-tokens` — Revoke only your own tokens for this connector
- `-y, --yes` — Skip the confirmation prompt

#### Examples

Interactively select which tokens to revoke

```
$ vercel connect revoke-tokens scl_abc123
```

Revoke only your own tokens

```
$ vercel connect revoke-tokens scl_abc123 --my-tokens
```

Revoke all tokens for all users

```
$ vercel connect revoke-tokens scl_abc123 --all-tokens
```

Skip the confirmation prompt

```
$ vercel connect revoke-tokens scl_abc123 --my-tokens --yes
```

Output as JSON

```
$ vercel connect revoke-tokens scl_abc123 --my-tokens --yes --format=json
```

### `vercel connect token`

Get a token for a connector (accepts a connector ID like scl_abc or a UID like slack/my-bot)

```
vercel connect token <id> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--installation-id <ID>` — Target a specific installation (only useful with --subject app; defaults to the connector's default installation)
- `--scopes <SCOPES>` — Scopes (comma- or space-separated)
- `-s, --subject <TYPE>` — Subject type: "user" (default, acts on behalf of you) or "app" (uses the connector's default installation)
- `-y, --yes` — Accept default value for all prompts

#### Examples

Get a user token by connector ID

```
$ vercel connect token scl_abc123
```

Get a token by connector UID

```
$ vercel connect token slack/my-bot
```

Get an app token (default installation)

```
$ vercel connect token scl_abc123 --subject app
```

Get an app token for a specific installation

```
$ vercel connect token scl_abc123 --subject app --installation-id inst_1
```

Open the browser automatically if authorization/installation is required

```
$ vercel connect token scl_abc123 --yes
```

Output as JSON (includes expiresAt, installationId, etc.)

```
$ vercel connect token scl_abc123 --format=json
```

### `vercel connect update`

Update connector branding (icon and colors)

```
vercel connect update <id> [options]
```

#### Options

- `--accent-color <HEX>` — Accent color for the connector icon (e.g. #1A2B3C)
- `--background-color <HEX>` — Background color for the connector icon (e.g. #1A2B3C)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--icon <PATH>` — Path to a PNG or JPEG image to use as the connector icon (uploaded to Vercel)

#### Examples

Update the connector icon

```
$ vercel connect update scl_abc123 --icon ./logo.png
```

Update the connector colors

```
$ vercel connect update scl_abc123 --background-color '#1A2B3C' --accent-color '#FF0066'
```

Output as JSON

```
$ vercel connect update scl_abc123 --icon ./logo.png --format=json
```

## Examples

Create a Slack app

```
$ vercel connect create slack
```

List connectors on the current team

```
$ vercel connect list
```

Get a token

```
$ vercel connect token scl_abc123
```

Attach the current project to a connector

```
$ vercel connect attach scl_abc123
```

Open a connector in the dashboard

```
$ vercel connect open scl_abc123
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
