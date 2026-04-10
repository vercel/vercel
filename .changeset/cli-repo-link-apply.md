---
'vercel': patch
---

Repository link (`vc link --repo`): the default flow remains the classic checkbox-based discovery. Set `VERCEL_EXPERIMENTAL_LINK` to opt into the new discovery and apply implementation under `src/util/link/experimental-repo/` (table picker, cross-team search, subdirectory scoping, etc.).

Experimental (`VERCEL_EXPERIMENTAL_LINK`): complete the apply phase after project selection — create detected projects, connect Git where chosen, PATCH project root when updating settings, write `repo.json`, and exit early in `LINK_DEMO` without API calls or file writes.

Non-interactive (`--yes`, experimental only): do not create new projects or connect Git; auto-select existing primary rows (exclude “new project” detections); for non-git / misconfigured rows when the suggested directory differs from the Vercel root, PATCH the project’s root directory on Vercel to match, then write `repo.json`. `LINK_DEMO` scenario ids use `initial-*` for `vc link --repo` and `add-*` for `vercel link add` (see `link-demo-scenarios.ts`).

When the experimental flow is used from a subdirectory that lies inside a known project root (linked, suggested, or locally detected), the picker is limited to that directory. When the cwd is not under any such root, the CLI explains that and shows options for the whole repository (same as running from the repo root).

`vc link --repo` merges new discovery results into an existing `repo.json`, replacing only rows that match the same `(orgId, directory)` key; other projects are preserved. `getLinkedProject` merges the repo mapping into `project.rootDirectory` when linked via `repo.json`, so pull, deploy `--prebuilt`, and microfrontends use the same filesystem root as `vercel build` when the dashboard root differs (no separate `projectRootDirectory` on `ProjectLinked`).

`vc link --repo` respects `--scope` / `--team` (and the global scope) before org selection so `--yes` targets the intended team. With `--project`, the experimental flow resolves that project in the selected scope, keeps framework detection for path/git-link suggestions, omits local “new project” rows, and synthesizes a link row when discovery would otherwise only show a new-project detection.

`readProjectSettings` prefers the matching `repo.json` row’s `directory` as `settings.rootDirectory` when `project.json` references the same project and path, so the effective root matches the repo link instead of stale dashboard values from pull (no separate build-only override helper).

Resolving a project from `repo.json` writes `orgId` / `projectId` / `projectName` to `.vercel/project.json` immediately; if the file previously pointed at another project, `settings` are omitted so nested `pull` (e.g. from `vercel build`) does not reuse stale settings or prompt again for the same mapping.

When multiple projects share a name, the experimental link table and interactive project selection show `orgId` in parentheses for disambiguation. `repo.json` does not store a team slug; it continues to use `orgId` per project entry only.

`vc link` / `selectOrg`: when `--scope` or `--team` is passed on the command line, the matching scope is used without prompting. Experimental repo link with `--yes` prints a clear message when nothing can be linked (empty discovery or only “new project” rows).

`vercel pull` always writes `orgId`, `projectId`, and `projectName` into `.vercel/project.json` (including repo-linked monorepos). If that file references a project listed in `repo.json` but mapped to a different directory or org than the current path, link resolution ignores it and re-resolves from `repo.json` so the next pull can refresh settings for the correct project.
