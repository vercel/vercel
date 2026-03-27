---
'vercel': patch
---

`whoami` resolves scope from the real working directory (`client.cwd`, including `--cwd`): `.vercel/project.json` when present, else a single matching `repo.json` project for the current subfolder, else the same-org aggregate only when `cwd` is the repo root. Explicit `--scope` / `--team` (or `-S` / `-T`) overrides linked scope for that run. JSON output includes `scope`. Piped/non-TTY output remains username-only.
