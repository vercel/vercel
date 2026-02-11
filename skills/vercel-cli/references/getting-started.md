# Getting Started

## Install

```bash
npm i -g vercel
```

## First-Time Setup

1. **Authenticate** — `vercel login` (opens browser). For CI, use `VERCEL_TOKEN` env var instead.
2. **Check your team** — `vercel whoami` to see current team. `vercel teams switch` to change. Linking on the wrong team is a common mistake.
3. **Link your project** — `vercel link` (single project) or `vercel link --repo` (monorepo with multiple projects or non-root directories). Creates `.vercel/`.
4. **Pull env vars** — `vercel pull` downloads project settings and env vars to `.env.local`.
5. **Dev or deploy** — `vercel dev` (local server) or `vercel --prod` (production deploy).

## Project Linking

Commands must be run from the directory containing `.vercel/` or a subdirectory of it.

- **`.vercel/project.json`**: Created by `vercel link`. Links a single project. Fine for single-project repos, and can work in monorepos if there's only one project.
- **`.vercel/repo.json`**: Created by `vercel link --repo`. Links a repo that may contain multiple projects. Always a good idea when any project has a non-root directory (e.g., `apps/web`).

Running from a project subdirectory (e.g., `apps/web/`) skips the "which project?" prompt.

**When something goes wrong, check how things are linked first** — look at `.vercel/` and whether it's `project.json` or `repo.json`.
