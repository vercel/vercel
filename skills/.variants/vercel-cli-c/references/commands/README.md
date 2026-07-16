<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# Vercel CLI Command Reference

Generated per-command reference. If a command or flag listed here is missing from your CLI, your installed CLI is older; `vercel <command> --help` reflects what is actually installed.

- [Global options](global-options.md)
- [`vercel activity`](activity.md) — List user activity events.
- [`vercel agent`](agent.md) — Generate an AGENTS.md file with Vercel deployment best practices
- [`vercel agent-runs`](agent-runs.md) — Inspect Agent Runs observability data
- [`vercel ai-gateway`](ai-gateway.md) — Manage AI Gateway resources
- [`vercel alerts`](alerts.md) — List alert groups, inspect a group, or manage alert rules (see `alerts rules`).
- [`vercel alias`](alias.md) — Interact with deployment aliases
- [`vercel api`](api.md) — Make authenticated HTTP requests to the Vercel API
- [`vercel bisect`](bisect.md) — Bisect the current project interactively or via an automated test script.
- [`vercel blob`](blob.md) — Interact with Vercel Blob
- [`vercel build`](build.md) — Build the project.
- [`vercel buy`](buy.md) — Purchase Vercel products for your team
- [`vercel cache`](cache.md) — Manage cache for a Project
- [`vercel certs`](certs.md) — Interact with SSL certificates. This command is intended for advanced use only. By default, Vercel manages your certificates automatically.
- [`vercel connect`](connect.md) — Manage connectors (Beta).

Vercel Connect is currently in beta. Behavior, commands, and output may change before general availability.
- [`vercel contract`](contract.md) — Show contract information for all billing periods
- [`vercel crons`](crons.md) — Manage cron jobs for a project
- [`vercel curl`](curl.md) — Execute curl with automatic deployment URL and protection bypass.
- [`vercel deploy`](deploy.md) — Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`). Use `--dry` to inspect the detected framework preset and source files without deploying.
- [`vercel deploy-hooks`](deploy-hooks.md) — Manage deploy hooks for Git-triggered builds
- [`vercel dev`](dev.md) — Starts the `vercel dev` server.
- [`vercel dns`](dns.md) — Interact with DNS entries for a project
- [`vercel domains`](domains.md) — Manage domains
- [`vercel edge-config`](edge-config.md) — Manage Edge Config stores (dashboard API parity)
- [`vercel env`](env.md) — Interact with Environment Variables for a Project
- [`vercel firewall`](firewall.md) — Manage your project's firewall rules, IP blocks, and system bypass configuration
- [`vercel flags`](flags.md) — Manage feature flags for a Vercel project
- [`vercel git`](git.md) — Manage your Git repository connection to the current Project
- [`vercel httpstat`](httpstat.md) — Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.
- [`vercel init`](init.md) — Initialize example Vercel Projects
- [`vercel inspect`](inspect.md) — Show information about a deployment.
- [`vercel install`](install.md) — Install an integration from the marketplace (alias for `integration add`)
- [`vercel integration`](integration.md) — Manage marketplace integrations. To manage individual resources, see `vercel integration resource`.
- [`vercel integration-resource`](integration-resource.md) — Manage marketplace integration resources (alias for `vercel integration resource`)
- [`vercel link`](link.md) — Link a local directory to a Vercel project
- [`vercel list`](list.md) — List deployments.
- [`vercel login`](login.md) — Sign in to your Vercel account.
- [`vercel logout`](logout.md) — Sign out the currently authenticated user.
- [`vercel logs`](logs.md) — Display request logs for a project.

With --follow, stream live runtime logs from a deployment. When no deployment is specified, resolves in order: latest deployment on the current git branch, then your latest deployment, then the latest production deployment. Use --environment production to always stream the latest production deployment.

Source types: λ = serverless, ε = edge/middleware, ◇ = static/external
- [`vercel mcp`](mcp.md) — Set up MCP agents and configuration for Vercel integration
- [`vercel metrics`](metrics.md) — Query observability metrics for your Vercel project or team.
- [`vercel microfrontends`](microfrontends.md) — Manage microfrontends groups that compose multiple projects into one cohesive application
- [`vercel open`](open.md) — Opens the current project in the Vercel Dashboard.
- [`vercel project`](project.md) — Manage your Vercel projects
- [`vercel promote`](promote.md) — Promote an existing Deployment to current
- [`vercel pull`](pull.md) — Pull latest environment variables and project settings from Vercel. 
- [`vercel redeploy`](redeploy.md) — Rebuild and deploy a previous deployment.
- [`vercel redirects`](redirects.md) — Manage redirects for a project. Redirects managed at the project level apply to all deployments and environments and take effect immediately after being created and promoted to production.
- [`vercel remove`](remove.md) — Remove deployment(s) by project name or deployment ID.
- [`vercel rollback`](rollback.md) — Quickly revert back to a previous deployment
- [`vercel rolling-release`](rolling-release.md) — Rolling releases gradually shift traffic to a new deployment in stages, allowing you to monitor for errors before serving all traffic. Learn more: https://vercel.com/docs/rolling-releases
- [`vercel routes`](routes.md) — Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.
- [`vercel sandbox`](sandbox.md) — Interact with Vercel Sandbox
- [`vercel skills`](skills.md) — Discover agent skills relevant to your project
- [`vercel target`](target.md) — Manage your Vercel Project's "targets" (custom environments).
- [`vercel teams`](teams.md) — Manage Teams under your Vercel account
- [`vercel telemetry`](telemetry.md) — Allows you to enable or disable telemetry collection
- [`vercel tokens`](tokens.md) — Manage your personal Vercel authentication tokens
- [`vercel traces`](traces.md) — Fetch traces captured for a Vercel project.
- [`vercel upgrade`](upgrade.md) — Upgrades the Vercel CLI to the latest version.
- [`vercel usage`](usage.md) — Show billing usage (MIUs and costs) for the current billing period or a custom date range
- [`vercel vcr`](vcr.md) — Manage Vercel Container Registry repositories and images (see `vcr image`).
- [`vercel webhooks`](webhooks.md) — Manage webhooks
- [`vercel whoami`](whoami.md) — Shows the username of the currently logged in user.
