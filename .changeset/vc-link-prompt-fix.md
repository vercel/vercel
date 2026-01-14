---
'vercel': patch
---

Fix `vc link --yes` prompting for project selection when multiple projects match the same directory.

When using `vc link` with a repo.json that has multiple projects for the same directory (e.g., after running `vc link --repo`), the CLI would prompt for project selection even when `--yes` was provided. This fix:

- Uses the `--project` flag to auto-select the matching project when multiple projects are found
- Errors with a helpful message when `--yes` is provided but no `--project` flag and multiple projects match
- Errors when `--project` is provided but doesn't match any available project
