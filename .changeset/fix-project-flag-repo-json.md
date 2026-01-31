---
'vercel': patch
---

Fixed `--project` flag not being respected when a `repo.json` exists. Previously, running `vercel link --yes --project=example` would still prompt for project selection in monorepo setups with `repo.json`. Now the `--project` flag correctly auto-selects the matching project without interactive prompts.
