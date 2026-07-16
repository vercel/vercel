# Local Development

`vercel dev` runs a local dev server (default `0.0.0.0:3000`; `--listen` accepts a port or `host:port`). Run `vercel dev --help` for flags; this file covers the workflow around it.

## Prerequisites

1. **Link your project** — `vercel link` or `vercel link --repo` (monorepo). Check your team first with `vercel whoami`.
2. **Pull env vars** — `vercel pull` or `vercel env pull`

## Related Commands

- `vercel pull` — download project settings and env vars to `.env.local`
- `vercel env pull` — download only env vars (not project settings)
- `vercel init` — scaffold a new project from a Vercel example
- `vercel open` — open the Vercel dashboard for the linked project

Run `vercel dev` from a project subdirectory (e.g., `apps/web/`) to skip the project selection prompt.
