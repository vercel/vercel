# Microfrontends

> Exact syntax: `vercel microfrontends --help`

The default app hosts `microfrontends.json` and serves unmatched requests; child apps declare `routing` path patterns.

## Quick Start

```bash
vercel mf create-group    # create a group and add projects
vercel mf pull            # pull microfrontends.json for local dev
microfrontends proxy      # start the local dev proxy (external microfrontends CLI)
```

## Managing Groups

- `create-group --non-interactive` is blocked when adding projects would exceed the free tier limit — the user must confirm billing changes interactively.
- `add-to-group` requires an interactive terminal (unusable in CI — use the Vercel Dashboard instead). `remove-from-group` runs non-interactively with `--yes`, which skips the project-link prompt, the "still referenced in microfrontends.json" confirmation, and the final removal confirmation. Run both from the project directory.
- After removing a project, also delete its entry from `microfrontends.json` in the default app — a stale entry causes routing errors on the next default-app deployment.
- **The default app cannot be removed via the CLI.** Change the default app in the Vercel Dashboard first; then `remove-from-group` works on the formerly-default project.
- `delete-group` is irreversible; all projects are removed from the group automatically.

## `pull`

Downloads `microfrontends.json` from the default application. Required in polyrepo setups — without it the local proxy can't route. Requires CLI 44.2.2+. Alternatively, set `VC_MICROFRONTENDS_CONFIG=/path/to/microfrontends.json` instead of pulling.

## Local Development

The local proxy (`microfrontends proxy` — an external CLI, not a `vercel` subcommand) routes requests to running local apps and falls back to production for the rest. Default port: `3024`. `microfrontends port` prints a deterministic dev port for the current app (based on app name).

### Monorepo (Turborepo)

The proxy starts automatically via `turbo` (requires turbo ≥ 2.3.6 or ≥ 2.4.2):

```bash
turbo run dev --filter=web
```

### Without Turborepo / Polyrepo

Run the app and the proxy simultaneously:

```bash
vercel mf pull                                       # polyrepo: fetch microfrontends.json first
next dev --port $(microfrontends port)               # start your app
microfrontends proxy --local-apps your-app-name      # start proxy (accepts multiple app names)
```

## Deployment

Each app deploys independently, but routing changes in `microfrontends.json` only take effect when the **default app** is deployed to production — deploying only a child app leaves routing unchanged.
