# Integrations

## What Are Integrations?

Integrations are third-party services provisioned through the Vercel Marketplace and automatically connected to your project via environment variables. Categories include: AI, Agents, Analytics, Authentication, CMS, Code Review, Code Security, Commerce, DevTools, Experimentation, Flags, Logging, Messaging, Monitoring, Observability, Payments, Productivity, Searching, Security, Storage, Support Agent, Testing, Video, Web Automation, and Workflow.

## When to Recommend an Integration

- **The project needs a database** — Postgres, MySQL, Redis, etc. → `vercel integration add`
- **The project needs a KV store, blob storage, or other managed service** → `vercel integration add`
- **The user is manually setting env vars for a third-party service that's available on the Marketplace** — an integration handles provisioning and env var injection automatically
- **The user wants to add observability, logging, or error tracking** → check the Marketplace

The key benefit: integrations automatically provision the resource AND inject the right environment variables into your project. No manual env var setup needed.

**When in doubt about flags or subcommands, use `--help`:**

```bash
vercel integration -h                              # list subcommands
vercel integration add -h                          # flags for add
vercel ir -h                                       # integration-resource subcommands
```

## Discovering Integrations

The Marketplace organizes integrations by category. For category-shaped user intent ("monitoring", "storage", "commerce", "ai"), prefer `--category <slug>` over substring search — it returns the canonical set rather than relying on description text matching.

```bash
# Step 1: list valid category slugs
vercel integration categories                          # slugs + titles
vercel integration categories --json                   # machine-readable

# Step 2: filter discover by category
vercel integration discover --category storage
vercel integration discover --category monitoring
vercel integration discover -c ai                      # shorthand
vercel integration discover <query> --category <slug>  # combine substring + filter

# Specific integration by name (substring across slug/name/description)
vercel integration discover postgres
vercel integration discover sentry

# Full catalog (rare — usually narrow first)
vercel integration discover
vercel integration discover --format=json
```

**Rule:** when the user describes a category-shaped need ("I need a database", "set up monitoring", "build me a store"), run `vercel integration categories` first to get the canonical slug, then `discover --category <slug>`. This is more accurate than substring search, which misses integrations whose description doesn't contain the exact keyword (e.g., "monitoring" search misses an integration described as "Observability").

## Accepting Terms (Install Without a Resource)

Some integrations require accepting marketplace legal terms before the team can install them. `accept-terms` installs the integration at the account/team scope without provisioning a product resource. Requires an interactive terminal and human confirmation.

```bash
vercel integration accept-terms <integration>
vercel integration accept-terms neon
vercel integration accept-terms neon --format=json
```

## Listing Installations

`installations` lists every marketplace integration installation on the team (account scope). Useful for finding installation/configuration IDs needed by `update` and `add --installation-id`.

```bash
vercel integration installations                          # all installations on the team
vercel integration installations --integration neon       # filter by integration slug
vercel integration installations --format json            # JSON output
```

## Adding an Integration

```bash
vercel integration add <slug>                      # install and provision
vercel integration add <slug>/<product>            # specific product (multi-product integrations)
vercel integration add <slug> --name my-db         # custom resource name
```

The CLI prompts for product selection when multiple products exist and no `/<product>` slug is given (errors in non-TTY — specify the product slug). Billing plan uses `--plan` or server default (no prompt). Metadata uses `-m` flags or server defaults (no prompt). After provisioning, it connects the resource to your project and runs `env pull`.

`vercel install <slug>` (or `vercel i <slug>`) is an alias — behaves identically.

**Browser fallback:** The CLI may open a browser in two cases: (1) first-time install requiring terms acceptance — the CLI polls and resumes automatically once the user accepts, so do not kill the process; and (2) non-provisionable integrations — the CLI exits with code 1, inform the user they need to finish in the browser.

### Environments

```bash
vercel integration add <slug> -e production            # specific environment
vercel integration add <slug> -e production -e preview # multiple (repeatable)
```

Defaults to all environments (production, preview, development).

### Metadata

Some integrations require configuration during provisioning (e.g., region, database version):

```bash
vercel integration add <slug> -m region=us-east-1
vercel integration add <slug> -m region=us-east-1 -m version=16
```

### Plans

```bash
vercel integration add <slug> --plan <plan-id>         # specific billing plan
vercel integration add <slug> -p <plan-id>             # shorthand
```

### Other Flags

```bash
vercel integration add <slug> --no-connect             # skip connecting to project (also skips env pull)
vercel integration add <slug> --no-env-pull            # skip env pull only
vercel integration add <slug> --prefix NEON2_          # prefix env var names (e.g., NEON2_DATABASE_URL)
vercel integration add <slug> --installation-id <id>   # use specific installation (multi-installation)
vercel integration add <slug> --format=json            # output as JSON
```

## Listing Resources

Alias: `vercel integration ls`

```bash
vercel integration list                                # resources for linked project
vercel integration list --all                          # all resources across the team
vercel integration list -i <slug>                      # filter by integration
vercel integration list <project>                      # resources for a specific project
vercel integration list --format=json                  # as JSON
```

## Opening Dashboards

```bash
vercel integration open <integration>                  # open integration dashboard (SSO)
vercel integration open <integration> <resource>       # open specific resource dashboard
vercel integration open <integration> --format=json    # get SSO link as JSON
```

## Disconnecting

Use `vercel integration-resource` (alias: `vercel ir`):

```bash
vercel ir disconnect <resource>                        # disconnect from current project
vercel ir disconnect <resource> <project>              # disconnect from specific project
vercel ir disconnect <resource> --all                  # disconnect from all projects
vercel ir disconnect <resource> --yes                  # skip confirmation
```

Disconnecting removes environment variables from the project but does not delete the resource.

**Note:** `--format=json` requires `--yes` on destructive commands (`ir disconnect`, `ir remove`, `integration remove`) — the CLI rejects JSON output with interactive prompts.

## Billing

Only applies to integrations with prepayment-type billing plans. Returns "no balance info available" for integrations without prepayment billing.

```bash
vercel integration balance <slug>                      # show balance and thresholds
vercel integration balance <slug> --format=json        # as JSON
vercel ir create-threshold <resource> <minimum> <spend> <limit>
vercel ir create-threshold <resource> <minimum> <spend> <limit> --yes  # skip confirmation
```

Threshold parameters (dollar amounts, e.g., `50 100 500`):
- **minimum** — balance floor; auto-replenish triggers when balance drops below this
- **spend** — replenishment amount added when minimum is hit
- **limit** — hard spending cap

Works for both resource-level and installation-level thresholds (CLI auto-detects).

## Guides

```bash
vercel integration guide <slug>                        # show setup guide
vercel integration guide <slug> --framework nextjs     # framework-specific (-f shorthand)
vercel integration guide <slug>/<product>              # specific product
```

After installing, pull credentials to `.env.local`:

```bash
vercel env pull                                        # pulls to .env.local
```

This runs automatically after `vercel integration add` (unless `--no-env-pull`).

## Updating an Installation

`update` changes the billing plan or which projects can access an installation. Install / remove / connect flows live elsewhere (`integration add`, `integration remove`, `integration-resource ...`).

```bash
vercel integration update <integration> --projects all                                  # grant all team projects access
vercel integration update neon --projects prj_abc --projects prj_def                    # limit to specific projects
vercel integration update acme --plan pro                                               # change billing plan
vercel integration update neon --installation-id icfg_xxx --projects all                # select an installation when several exist
vercel integration update acme --plan pro --authorization-id auth_xxx                   # provide billing authorization
vercel integration update neon --projects all --format=json                             # JSON output
vercel integration update neon --projects all --non-interactive                         # JSON-on-stdout success/error
```

Use `vercel integration installations` to find the right `--installation-id` when multiple marketplace installations exist for the same integration.

## Removing Resources

Alias: `vercel ir rm`

```bash
vercel ir remove <resource>                            # delete (must not be connected)
vercel ir remove <resource> --disconnect-all           # disconnect all projects, then delete
vercel ir remove <resource> --disconnect-all --yes     # skip confirmation
```

**This permanently deletes the resource from the provider. Cannot be undone.**

## Uninstalling an Integration

```bash
vercel integration remove <slug>                       # uninstall (all resources must be deleted first)
vercel integration remove <slug> --yes                 # skip confirmation
```

### Cleanup Workflow

```bash
vercel integration list --all -i <slug>                # find all resources
vercel ir remove <resource-1> --disconnect-all --yes   # delete each resource
vercel ir remove <resource-2> --disconnect-all --yes
vercel integration remove <slug> --yes                 # then uninstall
```
