---
---

Fix and expand `vercel-cli` skill references so Omniagent emits valid commands:

- `monitoring-and-debugging.md`: use valid `--level` values (`warning`, not `warn`) and valid `--source` values (`serverless`, `edge-function`, `edge-middleware`, `static`) for `vercel logs`.
- `global-options.md`: remove `--yes` from globals (it's per-command), add `--api`, and tighten the `--non-interactive` auto-detection description to match `index.ts` (agent + non-TTY only).
- `project-infra.md`: clarify that `pull` uses `--environment`, not `--target` (only `deploy`/`build` accept `--target`).
- `environment-variables.md`: document that `env add` / `env update` require `--value` (or stdin) in non-interactive / agent mode.
- `storage.md`: `--access` is required on `blob put`, `copy`, and `get`. Add `blob get`, the `--rw-token` / `--oidc-token` / `--store-id` auth modes, and `list-stores --no-projects`.
- `domains-and-dns.md`: split `domains add` guidance into linked (1 arg) and unlinked (2 args) forms; document `dns ls` with no domain.
- `flags.md`: add `json` to flag kinds, replace the misleading `--variant off` example with `--variant false`, and add `split`, `rollout`, `prepare`, `override` subcommands.
- `microfrontends.md`: correct that `remove-from-group` and `delete-group` run non-interactively with `--yes`; clarify what `--yes` skips for `remove-from-group`; and replace the wrong default-app removal guidance with "change default app in the dashboard first".
- `connectors.md`: add `connect update` and `connect detach`; document `connect token` `--subject` / `--installation-id` / `--scopes`; document `connect attach` `--triggers` / `--trigger-branch` / `--trigger-path`.
- `integrations.md`: add `accept-terms`, `installations`, and `update` subcommands.
- `sandbox.md`: replace the truncated subcommand list with the full set (`exec`, `run`, `connect`, `stop`, `copy`, `config`, `snapshot`, `snapshots`, `login`, `logout`).
- `advanced.md`: document `vercel traces` (including `--open` / `--view`) and `vercel oauth-apps`.
