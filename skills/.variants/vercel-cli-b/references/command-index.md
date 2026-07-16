<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# Vercel CLI Command Index

Every command and subcommand in the Vercel CLI (`vercel`, alias `vc`), generated from the CLI source.

This index is for discovering which command exists for a task. For flags, arguments, and defaults, run `vercel <command> [subcommand] --help` — help prints to stderr and may exit with code 2 after printing usage. If a command listed here is missing from your CLI, your installed CLI is older; check `vercel --help`.

## `vercel activity`

List user activity events.

- `types` — List available event types with descriptions.

## `vercel agent`

Generate an AGENTS.md file with Vercel deployment best practices

## `vercel agent-runs`

Inspect Agent Runs observability data

- `inspect <runId>` — Show metadata, lifecycle events, usage, and subagent data for an Agent Run
- `list` — List Agent Runs for a project
- `projects` — List projects in the current team with Agent Runs activity
- `trace <runId>` — Show the trace for an Agent Run (turns, messages, reasoning, and tool calls)

## `vercel ai-gateway`

Manage AI Gateway resources

- `api-keys` — Manage AI Gateway API keys
  - `create` — Create a new AI Gateway API key
- `coding-agents` — Connect local coding agents to the AI Gateway
  - `setup` — Connect local coding agents (Claude Code, Codex, OpenCode, Pi) to the AI Gateway
- `models` — Manage AI Gateway models
  - `endpoints <model>` — List provider endpoints for an AI Gateway model
  - `list` — List AI Gateway models
- `rules` — Manage AI Gateway routing rules (Beta).
  - `add` — Add an AI Gateway routing rule
  - `edit <ruleId>` — Edit an AI Gateway routing rule
  - `list` — List AI Gateway routing rules
  - `remove <ruleId>` — Remove an AI Gateway routing rule

## `vercel alerts`

List alert groups, inspect a group, or manage alert rules (see `alerts rules`).

- `inspect <groupId>` — Show details for a single alert group
- `rules` — Create, list, update, or delete alert notification rules (dashboard parity).
  - `add` — Create an alert rule from a JSON body file
  - `inspect <ruleId>` — Show one alert rule by id
  - `ls` — List alert rules for the current scope
  - `rm <ruleId>` — Delete an alert rule
  - `update <ruleId>` — Patch an alert rule from a JSON body file

## `vercel alias` (aliases: `aliases`, `ln`)

Interact with deployment aliases

- `list` — Show all aliases
- `remove <alias>` — Remove an alias using its hostname
- `set <id-or-url> <alias>` — Create a new alias (default)

## `vercel api`

Make authenticated HTTP requests to the Vercel API

- `list` — List all available API endpoints

## `vercel bisect`

Bisect the current project interactively or via an automated test script.

## `vercel blob`

Interact with Vercel Blob

- `copy <fromUrlOrPathname> <toPathname>` — Copy a file in the Blob store
- `create-store [name]` — Create a new Blob store
- `del <urlsOrPathnames>` — Delete a file from the Blob store
- `delete-store [storeId]` — Delete a Blob store
- `empty-store` — Delete all blobs in a Blob store
- `get <urlOrPathname>` — Download a blob by URL or pathname
- `get-store [storeId]` — Get a Blob store
- `list` — List all files in the Blob store
- `list-stores` — List all Blob stores
- `presign <pathname>` — Generate a presigned URL for Blob operations
- `put <pathToFile>` — Upload a file to the Blob store
- `signed-token` — Issue a short-lived signed token for Blob operations

## `vercel build`

Build the project.

## `vercel buy`

Purchase Vercel products for your team

- `addon <addon-name> <quantity>` — Purchase a Vercel addon for your team
- `credits <credit-type> <amount>` — Purchase Vercel credits for your team
- `domain <domain>` — Purchase a domain name
- `pro` — Purchase a Vercel Pro subscription for your team

## `vercel cache`

Manage cache for a Project

- `dangerously-delete` — Dangerously delete all cached content by tag
- `invalidate` — Invalidate all cached content by tag
- `purge` — Purge cache for the current project

## `vercel certs` (alias: `cert`)

Interact with SSL certificates. This command is intended for advanced use only. By default, Vercel manages your certificates automatically.

- `add` — Add a new certificate
- `issue <cn>` — Issue a new certificate for a domain
- `list` — Show all available certificates
- `remove <id>` — Remove a certificate by id

## `vercel connect`

Manage connectors (Beta).

- `attach <connector>` — Attach a Vercel project to a connector for one or more environments
- `create <type>` — Create a new connector
- `detach <connector>` — Detach a Vercel project from a connector
- `list` — List connectors linked to the current project (falls back to every connector in the team when no project is linked or when --all-projects is set)
- `open <id>` — Open a connector in the Vercel dashboard
- `remove <connector>` — Delete a connector
- `revoke-tokens <connector>` — Revoke tokens issued from a connector
- `token <id>` — Get a token for a connector (accepts a connector ID like scl_abc or a UID like slack/my-bot)
- `update <id>` — Update connector branding (icon and colors)

## `vercel contract`

Show contract information for all billing periods

## `vercel crons` (alias: `cron`)

Manage cron jobs for a project

- `add` — Add a cron job to vercel.json
- `list` — List all cron jobs for a project (default)
- `run [path]` — Trigger a cron job to run immediately

## `vercel curl`

Execute curl with automatic deployment URL and protection bypass.

## `vercel deploy`

Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`). Use `--dry` to inspect the detected framework preset and source files without deploying.

## `vercel deploy-hooks` (alias: `deploy-hook`)

Manage deploy hooks for Git-triggered builds

- `create [name]` — Create a deploy hook for a Git branch
- `list` — List deploy hooks for a project
- `remove <id>` — Remove a deploy hook by id

## `vercel dev` (alias: `develop`)

Starts the `vercel dev` server.

## `vercel dns`

Interact with DNS entries for a project

- `add <domain> <details>` — Add a new DNS entry (see below for examples)
- `import <domain> <zonefile>` — Import a DNS zone file (see below for examples)
- `list [domain]` — List DNS entries. Pass a domain to list its records, or omit the argument to list records across every domain on the scope (default)
- `remove <id>` — Remove a DNS entry using its ID

## `vercel domains` (alias: `domain`)

Manage domains

- `add <domain> [project]` — Add a domain name that you already own to a Vercel Team
- `buy <domain>` — Purchase a new domain name
- `check <domain ...>` — Check if a domain is available to buy
- `inspect <domain>` — Displays information related to a domain
- `list` — Show all domains in a list (default)
- `move <domain> <destination>` — Move ownership of a domain name to another Vercel Team
- `price <domain ...>` — Show registrar price quotes for one or more domains
- `remove <domain>` — Remove ownership of a domain name from a Vercel Team
- `search <query>` — Discover domain-name candidates from a keyword or fragment
- `transfer-in <domain>` — Transfer in a domain name to Vercel
- `verify <domain>` — Check a domain's DNS configuration and explain what to fix when it is misconfigured or unverified

## `vercel edge-config`

Manage Edge Config stores (dashboard API parity)

- `add <slug>` — Create an Edge Config store
- `backups <id-or-slug>` — List, inspect, or restore Edge Config backups
- `get <id-or-slug>` — Show metadata for an Edge Config (id `ecfg_…` or slug)
- `items <id-or-slug>` — List items in an Edge Config, or fetch one item with `--key`
- `list` — List Edge Config stores for the current team (default)
- `remove <id-or-slug>` — Delete an Edge Config store
- `tokens <id-or-slug>` — List, create (`--add`), or revoke (`--remove`) read tokens for an Edge Config
- `update <id-or-slug>` — Rename an Edge Config (`--slug`) and/or patch items (`--patch` JSON)

## `vercel env`

Interact with Environment Variables for a Project

- `add <name> [environment] [git-branch]` — Add an Environment Variable
- `list [environment] [git-branch]` — List all Environment Variables for a Project
- `pull [filename]` — Pull all Development Environment Variables from the cloud and write to a file [.env.local]
- `remove <name> [environment]` — Remove an Environment Variable (see examples below)
- `run <command ...>` — Run a command with environment variables from the linked Vercel project
- `update <name> [environment]` — Update the value of an existing Environment Variable (see examples below)

## `vercel firewall`

Manage your project's firewall rules, IP blocks, and system bypass configuration

- `attack-mode` — Manage attack mode, which challenges all incoming requests with a verification page
  - `disable` — Disable attack mode — visitors will no longer be challenged. Takes effect immediately (no publish required)
  - `enable` — Enable attack mode — all visitors will be shown a verification challenge before accessing your site. Takes effect immediately (no publish required)
- `diff` — Show draft changes that have been made but are not yet published to production
- `discard` — Permanently discard all unpublished draft changes, reverting to the current production configuration
- `ip-blocks` — Manage IP blocking rules that deny access from specific addresses or ranges
  - `block <ip>` — Block an IP address or CIDR range from accessing your project. Stages a draft change — run `publish` to make it live
  - `list` — List all IP blocking rules, including any unpublished draft changes
  - `unblock <id-or-ip>` — Remove an IP blocking rule to allow the address to access your project again. Stages a draft change — run `publish` to make it live
- `overview` — Show a summary of your project's firewall configuration, including active rules, IP blocks, bypasses, and any unpublished draft changes
- `publish` — Publish all draft firewall changes to production, making them live immediately
- `rules` — Manage custom firewall rules that control how traffic is handled based on conditions
  - `add [name]` — Create a new custom firewall rule using AI, an interactive builder, JSON, or command-line flags. Stages a draft change — run `publish` to make it live
  - `disable <name-or-id>` — Disable a custom firewall rule without removing it. Stages a draft change — run `publish` to make it live
  - `edit <name-or-id>` — Edit an existing custom firewall rule using AI, an interactive editor, JSON, or command-line flags. Stages a draft change — run `publish` to make it live
  - `enable <name-or-id>` — Enable a disabled custom firewall rule. Stages a draft change — run `publish` to make it live
  - `inspect <name-or-id>` — Show the full configuration of a custom firewall rule, including conditions, action, and rate limit settings
  - `list` — List all custom firewall rules, including any unpublished draft changes
  - `remove <name-or-id>` — Remove a custom firewall rule. Stages a draft change — run `publish` to make it live
  - `reorder <name-or-id>` — Change the priority order of a custom firewall rule. Stages a draft change — run `publish` to make it live
- `system-bypass` — Manage system bypass rules that allow specific IPs to skip firewall checks
  - `add <ip>` — Add a system bypass rule to allow a specific IP address to skip firewall checks. Takes effect immediately (no publish required)
  - `list` — List all system bypass rules that allow specific IPs to skip firewall checks
  - `remove <ip>` — Remove a system bypass rule so the IP is no longer exempt from firewall checks. Takes effect immediately (no publish required)
- `system-mitigations` — Manage automatic DDoS protection and system-level traffic filtering
  - `pause` — Pause automatic DDoS protection and system-level traffic filtering for 24 hours. Takes effect immediately (no publish required)
  - `resume` — Resume automatic DDoS protection and system-level traffic filtering. Takes effect immediately (no publish required)

## `vercel flags`

Manage feature flags for a Vercel project

- `archive <flag>` — Archive a feature flag
- `create <slug>` — Create a new feature flag
- `disable <flag>` — Shortcut to serve the false variant of a boolean feature flag in an environment
- `enable <flag>` — Shortcut to serve the true variant of a boolean feature flag in an environment
- `inspect <flag>` — Display information about a feature flag
- `list` — List all feature flags for the current project (default)
- `open [flag]` — Open feature flags in the Vercel dashboard
- `override [flag=value]` — Encrypt flag overrides into a secure token for the vercel-flag-overrides cookie
- `prepare` — Prepare flag definition fallbacks for the build
- `remove <flag>` — Delete a feature flag
- `rollout <flag>` — Configure a progressive rollout for a feature flag in an environment
- `rules` — Manage conditional rules for feature flags
  - `add <flag>` — Add a conditional rule to a feature flag environment
  - `list <flag>` — List conditional rules for a feature flag environment
  - `move <flag> <rule>` — Move a conditional rule within a feature flag environment
  - `remove <flag> <rule>` — Remove a conditional rule from a feature flag environment
  - `update <flag> <rule>` — Update a conditional rule in a feature flag environment
- `sdk-keys` — Manage SDK keys for feature flags
  - `add` — Create a new SDK key
  - `list` — List all SDK keys for the current project
  - `remove <key>` — Delete an SDK key
- `segments` — Manage feature flag segments
  - `create <slug>` — Create a feature flag segment
  - `inspect <segment>` — Display information about a feature flag segment
  - `list` — List all feature flag segments for the current project
  - `remove <segment>` — Delete a feature flag segment
  - `update <segment>` — Update a feature flag segment
- `set <flag>` — Set the served variant for a feature flag in an environment
- `split <flag>` — Configure a weighted split for a feature flag in an environment
- `update <flag>` — Update an existing feature flag
- `versions` — List and compare version history for a feature flag
  - `diff <flag>` — Show changes introduced by a feature flag version
  - `list <flag>` — List version history for a feature flag (default)

## `vercel git`

Manage your Git repository connection to the current Project

- `connect [git-url]` — Connect your Vercel Project to your Git repository or provide the remote URL to your Git repository
- `disconnect` — Disconnect the Git repository from your Vercel Project

## `vercel httpstat`

Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.

## `vercel init`

Initialize example Vercel Projects

## `vercel inspect`

Show information about a deployment.

## `vercel install` (alias: `i`)

Install an integration from the marketplace (alias for `integration add`)

## `vercel integration`

Manage marketplace integrations. To manage individual resources, see `vercel integration resource`.

- `accept-terms <integration>` — Accept marketplace legal terms for an integration and install it on the current team (installation only; no product resource). Requires an interactive terminal and human confirmation. Does not replace integrations that require a browser or device attestation.
- `add <integration>` — Installs a marketplace integration
- `balance <integration>` — Shows the balances and thresholds of a specified marketplace integration
- `categories` — List marketplace integration categories (slugs valid for `integration discover --category`)
- `discover [query]` — Discover available marketplace integrations
- `guide <integration>` — Show getting started guides and code snippets for a marketplace integration
- `installations` — List marketplace integration installations for the current team (account scope)
- `list [project]` — List resources from marketplace integrations for the current project
- `open <name> [resource]` — Opens a marketplace integration's or resource's dashboard via SSO
- `remove <integration>` — Uninstalls a marketplace integration. Resources must be removed first using `integration-resource remove`.
- `resource` — Manage marketplace integration resources (connect, disconnect, remove, create-threshold, claim)
  - `claim [resource]` — Claim a sandbox marketplace resource (e.g. Stripe, Shopify) by opening the provider claim URL in your browser
  - `connect <resource> [project]` — Connect a marketplace resource to a project
  - `create-threshold <resource> <minimum> <spend> <limit>` — Creates a threshold for a resource (or installation, if the integration uses installation-level thresholds)
  - `disconnect <resource> [project]` — Disconnect a marketplace resource from a project
  - `inspect <resource>` — Show live details and status for a marketplace integration resource, fetched fresh from the provider
  - `remove <resource>` — Delete an integration resource
- `update <integration>` — Update a marketplace integration installation (billing plan or which projects can access it). Install, remove, and connect flows are separate (integration add, integration remove, integration-resource, env pull, etc.) — not part of update. UI-only flows (OAuth in a browser, consent screens, marketplace purchase) may not map one-to-one to a single CLI flag; pass --plan and --authorization-id when the product requires them for billing changes. Any extra fields on the configuration resource that the API exposes but this command PATCH body does not send are not covered until the API and CLI support them.

## `vercel integration-resource` (alias: `ir`)

Manage marketplace integration resources (alias for `vercel integration resource`)

- `claim [resource]` — Claim a sandbox marketplace resource (e.g. Stripe, Shopify) by opening the provider claim URL in your browser
- `connect <resource> [project]` — Connect a marketplace resource to a project
- `create-threshold <resource> <minimum> <spend> <limit>` — Creates a threshold for a resource (or installation, if the integration uses installation-level thresholds)
- `disconnect <resource> [project]` — Disconnect a marketplace resource from a project
- `inspect <resource>` — Show live details and status for a marketplace integration resource, fetched fresh from the provider
- `remove <resource>` — Delete an integration resource

## `vercel link`

Link a local directory to a Vercel project

- `add` — Add projects to an existing repository link created by link --repo

## `vercel list` (alias: `ls`)

List deployments.

## `vercel login`

Sign in to your Vercel account.

## `vercel logout`

Sign out the currently authenticated user.

## `vercel logs` (alias: `log`)

Display request logs for a project.

## `vercel mcp`

Set up MCP agents and configuration for Vercel integration

## `vercel metrics`

Query observability metrics for your Vercel project or team.

- `schema [metric-or-prefix]` — List available metrics or inspect a specific metric.

## `vercel microfrontends` (alias: `mf`)

Manage microfrontends groups that compose multiple projects into one cohesive application

- `add-to-group` — Add the current project to a microfrontends group so it can be independently deployed as part of the microfrontends group
- `create-group` — Create a new microfrontends group to compose multiple projects into one cohesive application with shared routing
- `delete-group` — Delete a microfrontends group and all of its settings. This action is not reversible.
- `inspect-group` — Inspect a microfrontends group and return project metadata used for setup automation
- `pull` — Pull a Vercel Microfrontends configuration into your project
- `remove-from-group` — Remove the current project from its microfrontends group so it is no longer part of the composed application

## `vercel open`

Opens the current project in the Vercel Dashboard.

## `vercel project` (alias: `projects`)

Manage your Vercel projects

- `access-groups [name]` — List access groups for a project
- `access-summary [name]` — Show member counts by team role for project access (requires access groups entitlement)
- `add <name>` — Add a new project
- `checks [name]` — List, add, or remove deployment checks for a project (GET/POST/DELETE /v2/projects/.../checks)
- `inspect [name]` — Displays information related to a project
- `list` — Show all projects in the selected scope (default)
- `members [name]` — List project members for a project
- `protection [action] [name]` — Show or toggle deployment protection settings for a project
- `remove <name>` — Delete a project
- `rename <name> <new-name>` — Rename a project
- `speed-insights [name]` — Enable Speed Insights for a project
- `token [name]` — Get a development OIDC token for a project
- `update [name]` — Update one or more project settings; omitted settings remain unchanged
- `web-analytics [name]` — Enable Web Analytics for a project

## `vercel promote`

Promote an existing Deployment to current

- `status [project]` — Show the status of any current pending promotions

## `vercel pull`

Pull latest environment variables and project settings from Vercel.

## `vercel redeploy`

Rebuild and deploy a previous deployment.

## `vercel redirects` (alias: `redirect`)

Manage redirects for a project. Redirects managed at the project level apply to all deployments and environments and take effect immediately after being created and promoted to production.

- `add [source] [destination]` — Add a new redirect
- `list` — List all redirects for the current project. These redirects apply to all deployments and environments. There may also be redirects defined in a deployment that are not listed here.
- `list-versions` — List all versions of redirects
- `promote <version-id>` — Promote a staged redirects version to production
- `remove <source>` — Remove a redirect
- `restore <version-id>` — Restore a previous redirects version
- `upload <file>` — Upload redirects from a CSV or JSON file

## `vercel remove` (alias: `rm`)

Remove deployment(s) by project name or deployment ID.

## `vercel rollback`

Quickly revert back to a previous deployment

- `status [project]` — Show the status of any current pending rollbacks

## `vercel rolling-release` (alias: `rr`)

Rolling releases gradually shift traffic to a new deployment in stages, allowing you to monitor for errors before serving all traffic. Learn more: https://vercel.com/docs/rolling-releases

- `abort` — Abort an active rolling release
- `approve` — Approve the current stage of an active rolling release
- `complete` — Complete an active rolling release
- `configure` — Configure rolling release settings for a project
- `fetch` — Fetch details about a rolling release
- `start` — Start a rolling release

## `vercel routes`

Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.

- `add [name]` — Add a new routing rule to the project
- `delete <name-or-id ...>` — Delete one or more routing rules
- `disable <name-or-id>` — Disable a routing rule without deleting it
- `discard-staging` — Discard staged routing changes
- `edit <name-or-id>` — Edit an existing routing rule
- `enable <name-or-id>` — Enable a disabled routing rule
- `export [name-or-id]` — Export routes to a vercel.json or vercel.ts file
- `inspect <name-or-id>` — Show detailed information about a specific route
- `list` — List all routing rules for the current project. These routes apply to all deployments and environments.
- `list-versions` — List all versions of routing rules
- `publish` — Publish staged routing changes to production
- `reorder <name-or-id>` — Move a routing rule to a different position
- `restore <version-id>` — Restore a previous routing version to production

## `vercel sandbox`

Interact with Vercel Sandbox

## `vercel skills`

Discover agent skills relevant to your project

## `vercel target` (alias: `targets`)

Manage your Vercel Project's "targets" (custom environments).

- `list` — List targets defined for the current Project

## `vercel teams` (aliases: `switch`, `team`)

Manage Teams under your Vercel account

- `add` — Create a new team
- `invite <email ...>` — Invite a new member to a team
- `list` — Show all teams that you're a member of
- `members` — List members for the currently scoped team
- `request [userId]` — Show join-request status for the current team (defaults to the authenticated user)
- `sso` — Show SAML / SSO configuration for the current team
- `switch [name]` — Switch to a different team

## `vercel telemetry`

Allows you to enable or disable telemetry collection

- `disable` — Disables telemetry collection
- `enable` — Enables telemetry collection
- `status` — Shows whether telemetry collection is enabled or disabled

## `vercel tokens`

Manage your personal Vercel authentication tokens

- `add <name>` — Create a new personal authentication token
- `list` — List your personal authentication tokens (default)
- `remove <id>` — Delete a personal authentication token by ID

## `vercel traces`

Fetch traces captured for a Vercel project.

- `create <path>` — Capture a session trace for a request (alias for `vercel curl --trace`).
- `get [requestId]` — Fetch a captured trace by request id. (default)

## `vercel upgrade`

Upgrades the Vercel CLI to the latest version.

## `vercel usage`

Show billing usage (MIUs and costs) for the current billing period or a custom date range

## `vercel vcr`

Manage Vercel Container Registry repositories and images (see `vcr image`).

- `add <name>` — Create a container registry repository
- `image` — List, inspect, or delete images in a repository
  - `inspect <repository> <imageId>` — Show details for a single image, including its layer history
  - `ls <repository>` — List images in a container registry repository
  - `rm <repository> <imageId>` — Delete an image from a repository
- `inspect <repository>` — Show details for a single repository
- `login <engine>` — Authenticate a container tool (docker, podman, or buildah) with the Vercel Container Registry
- `ls` — List container registry repositories for a project
- `rm <repository>` — Delete a container registry repository
- `tag` — List or inspect a repository's tags
  - `inspect <repository> <tag>` — Show details for a single tag
  - `ls <repository>` — List a repository's tags

## `vercel webhooks` (alias: `webhook`)

Manage webhooks

- `create <url>` — Create a new webhook
- `get <id>` — Displays information related to a webhook
- `list` — Show all webhooks (default)
- `remove <id>` — Remove a webhook

## `vercel whoami`

Shows the username of the currently logged in user.
