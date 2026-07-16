<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel integration-resource

Manage marketplace integration resources (alias for `vercel integration resource`)

Aliases: `ir`

```
vercel integration-resource <command>
```

## Subcommands

### `vercel integration-resource claim`

Claim a sandbox marketplace resource (e.g. Stripe, Shopify) by opening the provider claim URL in your browser

```
vercel integration-resource claim [resource] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--no-wait` — Print the claim URL and exit without polling for completion
- `-y, --yes` — Skip the confirmation prompt when claiming a single sandbox resource

#### Examples

Claim a sandbox resource by name

```
$ vercel integration-resource claim <resource>
$ vercel integration-resource claim my-stripe
```

Pick a sandbox resource interactively (current team)

```
$ vercel integration-resource claim
```

Print the claim URL as JSON without waiting

```
$ vercel integration-resource claim my-stripe --format=json --no-wait
```

### `vercel integration-resource connect`

Connect a marketplace resource to a project

```
vercel integration-resource connect <resource> [project] [options]
```

#### Options

- `-e, --environment <ENV>` (repeatable) — Environment to connect (can be repeated: production, preview, development). Defaults to all.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--prefix <PREFIX>` — Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)
- `-y, --yes` — Skip the confirmation prompt when connecting a resource

#### Examples

Connect a resource to the current project

```
$ vercel integration resource connect <resource>
$ vercel integration resource connect my-acme-resource
```

Connect a resource to a specified project

```
$ vercel integration resource connect <resource> <project>
$ vercel integration resource connect my-acme-resource my-project
```

Connect only to specific environments

```
$ vercel integration resource connect my-acme-resource -e production
$ vercel integration resource connect my-acme-resource -e production -e preview
```

Connect with a prefix for environment variable names

```
$ vercel integration resource connect my-acme-resource --prefix NEON2_
```

Output as JSON

```
$ vercel integration resource connect my-acme-resource --format=json --yes
```

### `vercel integration-resource create-threshold`

Creates a threshold for a resource (or installation, if the integration uses installation-level thresholds)

```
vercel integration-resource create-threshold <resource> <minimum> <spend> <limit> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when creating a threshold

#### Examples

create threshold

```
$ vercel integration-resource create-threshold <resource> <minimum> <spend> <limit> [options]
$ vercel integration-resource create-threshold my-acme-resource 50 100 2000
$ vercel integration-resource create-threshold my-acme-resource 50 100 2000 --yes
```

### `vercel integration-resource disconnect`

Disconnect a marketplace resource from a project

```
vercel integration-resource disconnect <resource> [project] [options]
```

#### Options

- `-a, --all` — Disconnects all projects from the specified resource
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when disconnecting a resource

#### Examples

Disconnect a resource from the current project

```
$ vercel integration-resource disconnect <resource>
$ vercel integration-resource disconnect my-acme-resource
```

Disconnect all projects from a resource

```
$ vercel integration-resource disconnect <resource> --all
$ vercel integration-resource disconnect my-acme-resource --all
$ vercel integration-resource disconnect my-acme-resource -a
```

Disconnect a resource from a specified project

```
$ vercel integration-resource disconnect <resource> <project>
$ vercel integration-resource disconnect my-acme-resource my-project
```

Output as JSON

```
$ vercel integration-resource disconnect my-acme-resource --format=json --yes
```

### `vercel integration-resource inspect`

Show live details and status for a marketplace integration resource, fetched fresh from the provider

Aliases: `status`

```
vercel integration-resource inspect <resource> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Show live details and status for a resource

```
$ vercel integration resource inspect <resource>
$ vercel integration resource inspect my-acme-resource
```

Show live status for a resource (alias)

```
$ vercel integration resource status my-acme-resource
```

Output as JSON

```
$ vercel integration resource inspect my-acme-resource --format=json
```

### `vercel integration-resource remove`

Delete an integration resource

Aliases: `rm`

```
vercel integration-resource remove <resource> [options]
```

#### Options

- `-a, --disconnect-all` — Disconnects all projects from the specified resource before deletion
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when deleting a resource

#### Examples

Delete a resource

```
$ vercel integration-resource remove <resource>
$ vercel integration-resource remove my-acme-resource
```

Disconnect all projects from a resource, then delete it

```
$ vercel integration-resource remove <resource> --disconnect-all
$ vercel integration-resource remove my-acme-resource --disconnect-all
$ vercel integration-resource remove my-acme-resource -a
```

Output as JSON

```
$ vercel integration-resource remove my-acme-resource --format=json --yes
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
