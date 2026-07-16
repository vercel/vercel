<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel crons

Manage cron jobs for a project

Aliases: `cron`

```
vercel crons [command]
```

## Subcommands

### `vercel crons add`

Add a cron job to vercel.json

```
vercel crons add [options]
```

#### Options

- `--path <PATH>` — The API route path for the cron job (must start with /)
- `--schedule <EXPRESSION>` — The cron schedule expression (e.g. "0 10 * * *")

#### Examples

Add a cron job interactively

```
$ vercel crons add
```

Add a cron job with flags

```
$ vercel crons add --path /api/cron --schedule "0 10 * * *"
```

### `vercel crons list`

List all cron jobs for a project (default subcommand)

Aliases: `ls`

```
vercel crons list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

List all cron jobs

```
$ vercel crons ls
```

List all cron jobs as JSON

```
$ vercel crons ls --format json
```

### `vercel crons run`

Trigger a cron job to run immediately

```
vercel crons run [path] [options]
```

#### Options

- `--project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

Trigger a specific cron job

```
$ vercel crons run /api/cron
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
