# Local Development

## Prerequisites

1. **Link your project** — `vercel link` or `vercel link --repo` (monorepo). Check your team first with `vercel whoami`.
2. **Pull env vars** — `vercel pull` or `vercel env pull`

## Usage

```bash
vercel dev                           # default: 0.0.0.0:3000
vercel dev --listen 8080             # custom port
vercel dev --listen 127.0.0.1:5000   # custom host and port
```

## Related Commands

- `vercel link` — connect to a Vercel project. Use `--repo` for multi-project monorepos.
- `vercel pull` — download project settings and env vars to `.env.local`
- `vercel env pull` — download only env vars (not project settings)
- `vercel init` — scaffold a new project from a Vercel example
- `vercel open` — open the Vercel dashboard for the linked project

Run `vercel dev` from a project subdirectory (e.g., `apps/web/`) to skip the project selection prompt.
