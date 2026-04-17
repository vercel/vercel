---
'vercel': minor
---

Added global `--project` / `-P` flag to target a specific project within a monorepo. The flag resolves the project name to a directory using Vercel repo links, pnpm/npm/yarn workspaces, or conventional directory structures (`apps/`, `packages/`). This enables CI/CD pipelines, automation scripts, and agent workflows to target specific projects without navigating to the project directory or using `--cwd`.
