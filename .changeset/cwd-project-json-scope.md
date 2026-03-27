---
'vercel': patch
---

Apply `.vercel/project.json` `orgId` to the CLI scope (`client.config.currentTeam`) for commands run from that directory, unless `--scope` / `--team` / `-S` / `-T` is passed, `--token` is set, or the subcommand is excluded (same idea as global `--scope` handling: `login`, `logout`, `build`, `switch`, `init`, and `teams` except `teams invite`).
