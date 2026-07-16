<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel integration

Manage marketplace integrations. To manage individual resources, see `vercel integration resource`.

```
vercel integration <command>
```

## Subcommands

### `vercel integration accept-terms`

Accept marketplace legal terms for an integration and install it on the current team (installation only; no product resource). Requires an interactive terminal and human confirmation. Does not replace integrations that require a browser or device attestation.

```
vercel integration accept-terms <integration> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Accept terms interactively, then install on the team

```
$ vercel integration accept-terms <integration>
$ vercel integration accept-terms neon
```

Output result as JSON

```
$ vercel integration accept-terms neon --format=json
```

### `vercel integration add`

Installs a marketplace integration

Aliases: `install`

```
vercel integration add <integration> [options]
```

#### Options

- `--claim` — If the new resource is a sandbox (e.g. Stripe, Shopify), claim it immediately without prompting
- `-e, --environment <ENV>` (repeatable) — Environment to connect (can be repeated: production, preview, development). Defaults to all.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--installation-id <ID>` — Installation ID to use when multiple installations exist for the integration
- `-m, --metadata <KEY=VALUE>` (repeatable) — Metadata for the resource as KEY=VALUE (can be repeated). Run `vercel integration add <name> --help` to see available keys.
- `-n, --name <NAME>` — Custom name for the resource (auto-generated if not provided)
- `--no-claim` — If the new resource is a sandbox, skip the offer to claim it (only print a hint)
- `--no-connect` — Skip connecting the resource to the current project (also skips env pull)
- `--no-env-pull` — Skip running env pull after provisioning
- `-p, --plan <PLAN_ID>` — Billing plan ID to use for the resource
- `--prefix <PREFIX>` — Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)

#### Examples

Install a marketplace integration (auto-generates resource name)

```
$ vercel integration add <integration-name>
$ vercel integration add acme
```

Install a specific product from an integration

```
$ vercel integration add <integration>/<product>
$ vercel integration add acme/acme-redis
```

Search by keyword (prompts to select a matching integration)

```
$ vercel integration add postgres
$ vercel integration add redis
```

Install with a custom resource name

```
$ vercel integration add acme --name my-database
$ vercel integration add acme -n my-database
```

Install with metadata options

```
$ vercel integration add acme --metadata region=us-east-1
$ vercel integration add acme -m region=us-east-1 -m version=16
$ vercel integration add acme -m auth=true
$ vercel integration add acme -m "readRegions=sfo1,iad1"
```

Install with a specific billing plan

```
$ vercel integration add acme --plan pro
$ vercel integration add acme -p pro
```

Install and connect to specific environments only

```
$ vercel integration add acme --environment production
$ vercel integration add acme -e production -e preview
```

Install without connecting to the current project

```
$ vercel integration add acme --no-connect
```

Install without pulling environment variables

```
$ vercel integration add acme --no-env-pull
```

Install with a prefix for environment variable names

```
$ vercel integration add acme --prefix NEON2_
```

Output as JSON

```
$ vercel integration add acme --format=json
```

Show available products for an integration

```
$ vercel integration add acme --help
```

Discover available marketplace products and their slugs

```
$ vercel integration discover
```

### `vercel integration balance`

Shows the balances and thresholds of a specified marketplace integration

```
vercel integration balance <integration> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Show the balance(s) & threshold(s) of a marketplace integration

```
$ vercel integration balance <integration-name>
$ vercel integration balance acme
```

Output as JSON

```
$ vercel integration balance acme --format=json
```

### `vercel integration categories`

List marketplace integration categories (slugs valid for `integration discover --category`)

```
vercel integration categories [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

List marketplace categories

```
$ vercel integration categories
```

List categories as JSON

```
$ vercel integration categories --format=json
```

Use a category slug to filter discover results

```
$ vercel integration discover --category storage
```

### `vercel integration discover`

Discover available marketplace integrations

```
vercel integration discover [query] [options]
```

#### Options

- `-c, --category <CATEGORY>` (repeatable) — Filter integrations by category (can be repeated; e.g., -c storage -c authentication). Run `vercel integration categories` for valid slugs.
- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Discover marketplace integrations

```
$ vercel integration discover
```

Search for integrations matching a query

```
$ vercel integration discover postgres
$ vercel integration discover aws
```

Filter integrations by category

```
$ vercel integration discover --category storage
$ vercel integration discover -c authentication
```

Filter by multiple categories at once (repeat the flag)

```
$ vercel integration discover --category storage --category authentication
$ vercel integration discover -c commerce -c payments -c authentication
```

List available category slugs to use with --category

```
$ vercel integration categories
```

Discover marketplace integrations as JSON

```
$ vercel integration discover --format=json
```

### `vercel integration guide`

Show getting started guides and code snippets for a marketplace integration

```
vercel integration guide <integration> [options]
```

#### Options

- `-f, --framework <FRAMEWORK>` — Select a framework guide without interactive prompt (e.g., nextjs, remix, astro, nuxtjs, sveltekit)

#### Examples

Show guides for a single-product integration

```
$ vercel integration guide <integration-name>
$ vercel integration guide neon
```

Show guides for a specific product of a multi-product integration

```
$ vercel integration guide <integration>/<product>
$ vercel integration guide aws/aws-dynamodb
```

Show the Next.js guide without prompts (useful for CI/agents)

```
$ vercel integration guide neon --framework nextjs
```

Discover available integrations and product slugs

```
$ vercel integration discover
```

### `vercel integration installations`

List marketplace integration installations for the current team (account scope)

Aliases: `installation`

```
vercel integration installations [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-i, --integration <SLUG_OR_ID>` — Limit to installations of this integration (slug or id)

#### Examples

List all marketplace installations for the team

```
$ vercel integration installations
```

Filter by integration slug

```
$ vercel integration installations --integration neon
```

JSON output

```
$ vercel integration installations --format json
```

### `vercel integration list`

List resources from marketplace integrations for the current project

Aliases: `ls`

```
vercel integration list [project] [options]
```

#### Options

- `-a, --all` — Lists all resources regardless of project
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-i, --integration <NAME>` — Limits the resources listed to a designated integration

#### Examples

List resources for the current linked project

```
$ vercel integration list
```

Filter the resources to a single integration

```
$ vercel integration list --integration <integration>
$ vercel integration list --integration acme
$ vercel integration list -i acme
```

List all marketplace resources for the current team

```
$ vercel integration list --all
$ vercel integration list -a
```

List resources as JSON

```
$ vercel integration list --format=json
```

### `vercel integration open`

Opens a marketplace integration's or resource's dashboard via SSO

```
vercel integration open <name> [resource] [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

#### Examples

Open a marketplace integration's dashboard

```
$ vercel integration open <integration-name>
$ vercel integration open acme
```

Open a resource's dashboard within an integration

```
$ vercel integration open <integration-name> <resource-name>
$ vercel integration open acme my-acme-store
```

Get the SSO link as JSON

```
$ vercel integration open acme --format=json
$ vercel integration open acme my-acme-store --format=json
```

### `vercel integration remove`

Uninstalls a marketplace integration. Resources must be removed first using `integration-resource remove`.

```
vercel integration remove <integration> [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when uninstalling an integration

#### Examples

Uninstall an integration

```
$ vercel integration remove <integration>
$ vercel integration remove acme
```

Remove a resource before uninstalling

```
$ vercel integration-resource remove <resource-name> --disconnect-all --yes
```

Output as JSON

```
$ vercel integration remove acme --format=json --yes
```

### `vercel integration resource`

Manage marketplace integration resources (connect, disconnect, remove, create-threshold, claim)

```
vercel integration resource <command>
```

##### `vercel integration resource claim`

Claim a sandbox marketplace resource (e.g. Stripe, Shopify) by opening the provider claim URL in your browser

```
vercel integration resource claim [resource] [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--no-wait` — Print the claim URL and exit without polling for completion
- `-y, --yes` — Skip the confirmation prompt when claiming a single sandbox resource

###### Examples

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

##### `vercel integration resource connect`

Connect a marketplace resource to a project

```
vercel integration resource connect <resource> [project] [options]
```

###### Options

- `-e, --environment <ENV>` (repeatable) — Environment to connect (can be repeated: production, preview, development). Defaults to all.
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--prefix <PREFIX>` — Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)
- `-y, --yes` — Skip the confirmation prompt when connecting a resource

###### Examples

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

##### `vercel integration resource create-threshold`

Creates a threshold for a resource (or installation, if the integration uses installation-level thresholds)

```
vercel integration resource create-threshold <resource> <minimum> <spend> <limit> [options]
```

###### Options

- `-y, --yes` — Skip the confirmation prompt when creating a threshold

###### Examples

create threshold

```
$ vercel integration-resource create-threshold <resource> <minimum> <spend> <limit> [options]
$ vercel integration-resource create-threshold my-acme-resource 50 100 2000
$ vercel integration-resource create-threshold my-acme-resource 50 100 2000 --yes
```

##### `vercel integration resource disconnect`

Disconnect a marketplace resource from a project

```
vercel integration resource disconnect <resource> [project] [options]
```

###### Options

- `-a, --all` — Disconnects all projects from the specified resource
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when disconnecting a resource

###### Examples

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

##### `vercel integration resource inspect`

Show live details and status for a marketplace integration resource, fetched fresh from the provider

Aliases: `status`

```
vercel integration resource inspect <resource> [options]
```

###### Options

- `-F, --format <FORMAT>` — Specify the output format (json)

###### Examples

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

##### `vercel integration resource remove`

Delete an integration resource

Aliases: `rm`

```
vercel integration resource remove <resource> [options]
```

###### Options

- `-a, --disconnect-all` — Disconnects all projects from the specified resource before deletion
- `-F, --format <FORMAT>` — Specify the output format (json)
- `-y, --yes` — Skip the confirmation prompt when deleting a resource

###### Examples

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

#### Examples

Connect a resource to the current project

```
$ vercel integration resource connect my-acme-resource
```

Disconnect a resource from the current project

```
$ vercel integration resource disconnect my-acme-resource
```

Remove a resource (disconnecting all projects first)

```
$ vercel integration resource remove my-acme-resource --disconnect-all --yes
```

### `vercel integration update`

Update a marketplace integration installation (billing plan or which projects can access it). Install, remove, and connect flows are separate (integration add, integration remove, integration-resource, env pull, etc.) — not part of update. UI-only flows (OAuth in a browser, consent screens, marketplace purchase) may not map one-to-one to a single CLI flag; pass --plan and --authorization-id when the product requires them for billing changes. Any extra fields on the configuration resource that the API exposes but this command PATCH body does not send are not covered until the API and CLI support them.

```
vercel integration update <integration> [options]
```

#### Options

- `--authorization-id <ID>` — Billing authorization ID when the platform requires it for plan changes
- `-F, --format <FORMAT>` — Specify the output format (json)
- `--installation-id <ID>` — Configuration ID when multiple marketplace installations exist for this integration
- `-p, --plan <PLAN_ID>` — Billing plan ID for integrations that support installation-level billing plans
- `--projects <PROJECT>` (repeatable) — Project ID allowed to use this installation, or "all" for all projects (repeatable)

#### Examples

Grant all team projects access to the integration

```
$ vercel integration update <integration> --projects all
$ vercel integration update neon --projects all
```

Limit access to specific projects

```
$ vercel integration update neon --projects prj_abc --projects prj_def
```

Change installation billing plan

```
$ vercel integration update acme --plan pro
```

Select installation when several exist

```
$ vercel integration update neon --installation-id icfg_xxx --projects all
```

Output result as JSON

```
$ vercel integration update neon --projects all --format=json
```

Non-interactive (JSON success and errors on stdout)

```
$ vercel integration update neon --projects all --non-interactive
```

## Examples

Install a specific product from an integration

```
$ vercel integration add acme/acme-redis
```

Connect an existing resource to the current project

```
$ vercel integration resource connect my-acme-resource
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
