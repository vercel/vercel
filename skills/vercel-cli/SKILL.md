---
name: vercel-cli
description: Deploy, manage, and develop projects on Vercel from the command line
---

# Vercel CLI Skill

The Vercel CLI (`vercel` or `vc`) deploys, manages, and develops projects on the Vercel platform from the command line. Use `vercel <command> -h` for full flag details on any command.

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

- **Deploy** → `references/deployment.md`
- **Local development** → `references/local-development.md`
- **Environment variables** → `references/environment-variables.md`
- **CI/CD automation** → `references/ci-automation.md`
- **Domains or DNS** → `references/domains-and-dns.md`
- **Projects or teams** → `references/projects-and-teams.md`
- **Logs, debugging, or accessing preview deploys** → `references/monitoring-and-debugging.md`
- **Blob storage** → `references/storage.md`
- **Integrations (databases, storage, etc.)** → `references/integrations.md`
- **Access a preview deployment** → use `vercel curl` (see `references/monitoring-and-debugging.md`)
- **CLI doesn't have a command for it** → use `vercel api` as a fallback (see `references/advanced.md`)
- **Node.js backends (Express, Hono, etc.)** → `references/node-backends.md`
- **Monorepos (Turborepo, Nx, workspaces)** → `references/monorepos.md`
- **Bun runtime** → `references/bun.md`
- **Feature flags** → `references/flags.md`
- **Advanced (API, webhooks)** → `references/advanced.md`
- **Global flags** → `references/global-options.md`
- **First-time setup** → `references/getting-started.md`

## Critical: Never Disable Deployment Protection

**Deployment protection is a critical security feature.** Never disable it to work around issues, debug problems, or bypass authentication errors. Use `vercel curl` instead — it handles deployment protection automatically and is the correct way to access protected preview deployments.

Disabling deployment protection exposes customer deployments to unauthorized access. **Only disable it with the customer's explicit consent**, and only after explaining the security implications. If you encounter "Authentication Required" errors or similar issues, the solution is `vercel curl`, not disabling protection.

```bash
# CORRECT: Use vercel curl to access protected deployments
vercel curl /api/health --deployment $PREVIEW_URL

# WRONG: Never disable protection via API or dashboard
# Do NOT use the API to set vercelAuthentication.deploymentType to "none"
# Do NOT disable SSO protection to work around access issues
```

## Anti-Patterns

- **Wrong link type in monorepos with multiple projects**: `vercel link` creates `project.json`, which only tracks one project. Use `vercel link --repo` instead. When things break, check `.vercel/` first.
- **Letting commands auto-link in monorepos**: Many commands implicitly run `vercel link` if `.vercel/` doesn't exist. This creates `project.json`, which may be wrong. Run `vercel link` (or `--repo`) explicitly first.
- **Linking while on the wrong team**: Use `vercel whoami` to check, `vercel teams switch` to change.
- **Forgetting `--yes` in CI**: Required to skip interactive prompts.
- **Using `vercel deploy` after `vercel build` without `--prebuilt`**: The build output is ignored.
- **Hardcoding tokens in flags**: Use `VERCEL_TOKEN` env var instead of `--token`.
- **Disabling deployment protection to debug or bypass issues**: This is a security risk. Use `vercel curl` instead to access preview deploys. Only disable with explicit customer consent.
