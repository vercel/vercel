---
name: vercel-cli
description: Deploy, manage, inspect, and troubleshoot Vercel projects from the command line. Use for Vercel deployments, build failures, projects and teams, environment variables, domains and DNS, logs, metrics, Speed Insights, Core Web Vitals, request traces, usage, activity, alerts, firewall rules, cache, cron jobs, deploy hooks, Edge Config, feature flags, integrations, connectors, Blob storage, Container Registry (VCR), microfrontends, rolling releases, custom environments, Sandbox, agent/MCP setup, OAuth apps, preview access, local development, or `vercel api` fallback.
---

# Vercel CLI Skill

The Vercel CLI (`vercel` or `vc`) deploys, manages, and develops projects on the Vercel platform from the command line. Use `vercel <command> --help` for full flag details on any command.

The installed CLI help is the source of truth for obscure or newly added flags. If a command example here is not enough, check `vercel <command> --help` before acting instead of guessing.

Parse only stdout for URLs and JSON. Warnings, progress, and `--help` print to stderr; merge streams only when searching help text. Some help commands exit 2 after printing usage, so treat printed usage as a successful help read.

In agent/non-interactive mode, many commands report errors and required confirmations as a single JSON object on stdout with `status`, `reason`, `hint`, and `next` (runnable follow-up commands). Prefer running a suggested `next` command over composing a retry. Read commands such as `list`, `logs`, `inspect`, and `api` keep their normal output shape.

## Critical: Project Linking

Commands must be run from the directory containing the `.vercel` folder (or a subdirectory of it). How `.vercel` gets set up depends on your project structure:

- **`.vercel/project.json`**: Created by `vercel link`. Links a single project. Fine for single-project repos, and can work in monorepos if there's only one project.
- **`.vercel/repo.json`**: Created by `vercel link --repo`. Links a repo that may contain multiple projects. Always a good idea when any project has a non-root directory (e.g., `apps/web`).

Running from a project subdirectory (e.g., `apps/web/`) skips the "which project?" prompt since it's unambiguous.

**When something goes wrong, check how things are linked first** — look at what's in `.vercel/` and whether it's `project.json` or `repo.json`. Also verify you're on the right team with `vercel whoami` — linking while on the wrong team is a common mistake.

## Quick Start

```bash
npm i -g vercel
vercel login
vercel link              # single project
# OR
vercel link --repo       # monorepo
vercel pull
vercel dev        # local development
vercel deploy     # preview deployment
vercel --prod     # production deployment
```

## Decision Tree

Use this to route to the correct reference file:

- **Deploy, redeploy, forced builds, no-cache builds, or deployment source/provenance** → `references/deployment.md`
- **Rolling releases, deploy hooks, cron jobs, cache, git connection, Edge Config, redirects, custom environments** → `references/project-infra.md`
- **Local development** → `references/local-development.md`
- **Environment variables** → `references/environment-variables.md`
- **CI/CD automation** → `references/ci-automation.md`
- **Domains or DNS** → `references/domains-and-dns.md`
- **Projects or teams** → `references/projects-and-teams.md`
- **Build failures, deployment errors, logs, metrics, Speed Insights, Core Web Vitals, activity, performance, preview access, or production debugging** → `references/monitoring-and-debugging.md`
- **Alerts, usage, contracts, billing purchases, tokens, telemetry, or CLI upgrades** → `references/platform-ops.md`
- **Blob storage** → `references/storage.md`
- **Container Registry (`vercel vcr`: repositories, images, tags, docker/podman/buildah login, push/pull)** → `references/container-registry.md`
- **Integrations (databases, storage, etc.)** → `references/integrations.md`
- **Connectors (`vercel connect`)** → `references/connectors.md`
- **Routing rules** → `references/routing.md`
- **Firewall (WAF rules, IP blocks, rate limiting)** → `references/firewall.md`
- **Access a preview deployment** → use `vercel curl` (see `references/monitoring-and-debugging.md`)
- **CLI command is unavailable or output is missing required fields** → use `vercel api` after first-class CLI paths are unavailable or insufficient (see `references/advanced.md`)
- **Node.js backends (Express, Hono, etc.)** → `references/node-backends.md`
- **Monorepos (Turborepo, Nx, workspaces)** → `references/monorepos.md`
- **Bun runtime** → `references/bun.md`
- **Feature flags** → `references/flags.md`
- **Microfrontends** → `references/microfrontends.md`
- **Sandbox** → `references/sandbox.md`
- **Agent, MCP, skills discovery, or AI Gateway** → `references/agent-and-ai.md`
- **Captured request traces (`vercel traces`, including `--open` / `--view`)** → `references/advanced.md`
- **Vercel Apps / OAuth apps (`vercel oauth-apps`)** → `references/advanced.md`
- **Advanced (`vercel api` fallback, webhooks)** → `references/advanced.md`
- **Global flags** → `references/global-options.md`
- **First-time setup** → `references/getting-started.md`

## Anti-Patterns

- **Wrong link type in monorepos with multiple projects**: `vercel link` creates `project.json`, which only tracks one project. Use `vercel link --repo` instead. When things break, check `.vercel/` first.
- **Letting commands auto-link in monorepos**: Many commands implicitly run `vercel link` if `.vercel/` doesn't exist. This creates `project.json`, which may be wrong. Run `vercel link` (or `--repo`) explicitly first.
- **Linking while on the wrong team**: Use `vercel whoami` to check, `vercel teams switch` to change.
- **Forgetting non-interactive flags in plain CI runs**: detected agents get `--non-interactive` by default, but plain CI does not — pass it explicitly there, and add `--yes` only for commands that require confirmation.
- **Using `vercel deploy` after `vercel build` without `--prebuilt`**: The build output is ignored.
- **Using `vercel redeploy` for no-cache rebuilds**: `vercel redeploy` does not expose a no-cache flag; use `vercel deploy --force` without `--with-cache` when you need a fresh deployment that does not retain build cache.
- **Hardcoding tokens in flags**: Use `VERCEL_TOKEN` env var instead of `--token`.
- **Disabling deployment protection**: Use `vercel curl` instead to access preview deploys.
- **Using `vercel api` too early**: Prefer first-class CLI commands when they expose the needed data or mutation.
