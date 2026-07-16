# Projects & Teams

Project management (`vercel project`), deployment listing (`vercel list`, `vercel inspect`, `vercel remove`), and team management (`vercel teams`). Run `vercel <command> --help` for flags; this file covers behavior help cannot tell you.

## Deployments

`vercel list` returns one page of 20 and supports cursor pagination with `--next`; do not assume it accepts `--limit`. Use project, scope, status, environment, and metadata filters (e.g. `-m gitBranch=main`) to keep deployment lists focused, or use `vercel api` when a strict page size is required.

`vercel remove <name>` removes deployments; `--safe` skips deployments that have aliases pointing at them.

## Discovering Scope

Use this sequence when the user has not specified a team or project and the task is read-only:

```bash
vercel whoami
vercel teams ls --format json
vercel project ls --scope <team-slug> --format json
vercel list <project-name> --scope <team-slug> --status READY --format json
```

After selecting or inferring the team, pass `--scope <team-slug>` explicitly on subsequent commands (`project inspect`, `list`, etc.).

Do not conclude that no projects or deployments exist after checking only one relevant scope. If several plausible targets remain, ask the user to choose from the candidates found. Avoid broad enumeration across unrelated teams unless the user asked for account-wide investigation.

## Scoping

Use `--scope` on any command to target a specific team. `--team` exists for compatibility but is deprecated.
