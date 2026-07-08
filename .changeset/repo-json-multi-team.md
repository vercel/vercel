---
'vercel': major
---

Linking now records Git repositories in `.vercel/repo.json` by default, without `--repo`.

When linking inside a Git repository, the CLI fetches every project that is Git-connected to the repository under the selected team and links them all in one step — no per-project confirmation. If the current directory matches one of them, that project resolves immediately (`Linked acme/my-site and 3 other projects`); otherwise the regular selection/creation flow runs for the current directory and the result is recorded in `repo.json` too, expressed relative to the repository root.

`repo.json` can now hold links from multiple teams: linking under one team preserves entries from others, project selection prompts qualify names with the team when entries span teams, and explicit `--project` name matches are disambiguated by the current team scope. The deprecated top-level `orgId` is materialized onto individual entries on the next write.

Per-directory `.vercel/project.json` links are still created when the directory is not inside a Git repository with a usable remote.
