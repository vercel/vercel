<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel microfrontends

Manage microfrontends groups that compose multiple projects into one cohesive application

Aliases: `mf`

```
vercel microfrontends <command>
```

## Subcommands

### `vercel microfrontends add-to-group`

Add the current project to a microfrontends group so it can be independently deployed as part of the microfrontends group

```
vercel microfrontends add-to-group [options]
```

#### Options

- `--default-route` — Default route for this project (e.g. /docs)
- `--group` — Name of the microfrontends group to add to

#### Examples

Add current project to a group interactively

```
$ vercel microfrontends add-to-group
```

Add current project to a group with flags

```
$ vercel mf add-to-group --group="My Group" --default-route=/docs
```

### `vercel microfrontends create-group`

Create a new microfrontends group to compose multiple projects into one cohesive application with shared routing

```
vercel microfrontends create-group [options]
```

#### Options

- `--default-app` — Project name for the default application
- `--default-route` — Default route for the default application
- `--name` — Name of the microfrontends group
- `--project` (repeatable) — Project name to include (repeatable)
- `--project-default-route` (repeatable) — Default route for a non-default project in the form "<project>=<route>" (repeatable)
- `-y, --yes` — Skip creation confirmation prompt

#### Examples

Create a microfrontends group interactively

```
$ vercel microfrontends create-group
```

Create a microfrontends group with flags

```
$ vercel mf create-group --name="My Group" --project=web --project=docs --default-app=web --project-default-route=docs=/docs --yes
```

### `vercel microfrontends delete-group`

Delete a microfrontends group and all of its settings. This action is not reversible.

```
vercel microfrontends delete-group [options]
```

#### Options

- `--group` — Name or ID of the microfrontends group to delete
- `-y, --yes` — Skip project linking confirmation

#### Examples

Delete a microfrontends group interactively

```
$ vercel microfrontends delete-group
```

Delete a microfrontends group with flags

```
$ vercel mf delete-group --group="My Group"
```

### `vercel microfrontends inspect-group`

Inspect a microfrontends group and return project metadata used for setup automation

```
vercel microfrontends inspect-group [options]
```

#### Options

- `--config-file-name` — Custom microfrontends config file path/name relative to the default app root (must end with .json or .jsonc)
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--group` — Name or ID of the microfrontends group to inspect

#### Examples

Inspect a microfrontends group interactively

```
$ vercel microfrontends inspect-group
```

Inspect a microfrontends group as JSON

```
$ vercel mf inspect-group --group="My Group" --format=json
```

### `vercel microfrontends pull`

Pull a Vercel Microfrontends configuration into your project

```
vercel microfrontends pull [options]
```

#### Options

- `--dpl` — The deploymentId to use for pulling the microfrontends configuration
- `-y, --yes` — Skip confirmation when linking is required (e.g. in non-interactive mode)

#### Examples

Pull a microfrontends configuration

```
$ vercel microfrontends pull
```

Pull a microfrontends configuration for a specific deployment

```
$ vercel microfrontends pull --dpl=<deployment-id>
```

### `vercel microfrontends remove-from-group`

Remove the current project from its microfrontends group so it is no longer part of the composed application

```
vercel microfrontends remove-from-group [options]
```

#### Options

- `-y, --yes` — Skip project linking confirmation

#### Examples

Remove current project from its group interactively

```
$ vercel microfrontends remove-from-group
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
