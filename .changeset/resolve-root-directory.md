---
'vercel': patch
---

Fix `vc build` run from a monorepo subdirectory (gated behind `VERCEL_RESOLVE_ROOT_DIRECTORY=1`).

When a project is linked in place (`apps/api/.vercel/project.json`) and `vc build` is run from that directory, the build previously treated the linked subdirectory as the repository root. Because the project's dependencies are typically hoisted to the monorepo root above it, this broke builds in several ways that share one root cause:

- A `rootDirectory` setting that restates the link's own location (e.g. `apps/api` for a link at `apps/api`) double-appended into `apps/api/apps/api`, failing with `ENOENT … /apps/api/apps/api/.next/package.json`.
- With `--standalone`, the package-manager symlink that makes a dependency resolvable (`apps/api/node_modules/hono` → `../../node_modules/.pnpm/.../hono`) was skipped because its target pointed outside the subdirectory, so the deployed function failed at runtime with `Cannot find module 'hono'` even though the dependency's files were packaged.
- Builders traced from the wrong root, so Next.js set an incorrect `outputFileTracingRoot`/`turbopack.root` (Turbopack errors; Webpack `.nft.json` omits hoisted dependencies).

With the flag enabled, a per-directory link is resolved like a repository-level link: the repository root is detected (workspace markers, then git) and the project is expressed as its path relative to that root, so the build is anchored correctly regardless of which directory the command is run from. The link's physical location is authoritative — a redundant `rootDirectory` is absorbed silently and a mismatched one is ignored with an advisory. Standalone builds additionally preserve the package-manager symlinks (rather than skipping them) so dependencies resolve at runtime. Behavior is unchanged when the flag is not set.
