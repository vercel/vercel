<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel deploy-hooks

Manage deploy hooks for Git-triggered builds

Aliases: `deploy-hook`

```
vercel deploy-hooks <command>
```

## Subcommands

### `vercel deploy-hooks create`

Create a deploy hook for a Git branch

Aliases: `add`

```
vercel deploy-hooks create [name] [options]
```

#### Options

- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-r, --ref <BRANCH>` — Git branch ref to deploy when the hook URL is triggered

#### Examples

Create a hook that deploys `main`

```
$ vercel deploy-hooks create cms-rebuild --ref main
```

### `vercel deploy-hooks list`

List deploy hooks for a project

Aliases: `ls`

```
vercel deploy-hooks list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)

#### Examples

List deploy hooks as JSON

```
$ vercel deploy-hooks ls --format json
```

### `vercel deploy-hooks remove`

Remove a deploy hook by id

Aliases: `rm`, `delete`

```
vercel deploy-hooks remove <id> [options]
```

#### Options

- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-y, --yes` — Skip the confirmation prompt when removing a deploy hook

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
