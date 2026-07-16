# Microfrontends

Split a large application into independently deployable units that render as one cohesive app. The default app hosts `microfrontends.json` and serves unmatched requests; child apps declare `routing` path patterns. Run `vercel microfrontends --help` (alias: `vercel mf`) for flags and subcommands; this file covers behavior that help output cannot tell you. Note that `microfrontends proxy` and `microfrontends port` come from the `@vercel/microfrontends` npm package, not the Vercel CLI, so `vercel --help` never shows them.

Setup order: create a group and add projects (`vercel mf create-group`), pull `microfrontends.json` for local dev (`vercel mf pull`), then start the local dev proxy (`microfrontends proxy`).

## Group Management Gotchas

- `create-group --non-interactive` is blocked when adding projects would exceed the free tier limit — the user must confirm billing changes interactively.
- `add-to-group` requires an interactive terminal — it cannot run in CI; use the Vercel Dashboard instead.
- `remove-from-group --yes` runs fully non-interactively: it skips the project-link prompt, the "still referenced in microfrontends.json" confirmation, and the final removal confirmation. After removing, update `microfrontends.json` in the default app to drop the project's entry — leaving it causes routing errors on the next default app deployment.
- **The default app cannot be removed via the CLI** — change the default app in the Vercel Dashboard first, then `remove-from-group` works on the formerly-default project.
- `delete-group` is irreversible; all projects are removed from the group automatically. It accepts `--yes` for non-interactive use.
- `inspect-group --format=json` returns project names, frameworks, git repos, and root directories — useful for automating `microfrontends.json` generation.

## `pull`

`vercel mf pull` downloads `microfrontends.json` from the default application. Required in polyrepo setups — without it the local proxy can't route correctly. Requires CLI 44.2.2+. Alternatively, set `VC_MICROFRONTENDS_CONFIG=/path/to/microfrontends.json` instead of pulling.

## Local Development

The local proxy routes requests to running apps and falls back to production for others. Default port: `3024`. `microfrontends port` prints the auto-assigned dev port for the current app (deterministic, based on app name).

### Monorepo (Turborepo)

The proxy starts automatically via `turbo` (requires turbo ≥ 2.3.6 or ≥ 2.4.2):

```bash
turbo run dev --filter=web
```

### Without Turborepo

Run both scripts simultaneously:

```json
{
  "scripts": {
    "dev": "next dev --port $(microfrontends port)",
    "proxy": "microfrontends proxy microfrontends.json --local-apps web"
  }
}
```

### Polyrepo

```bash
vercel mf pull                                       # fetch microfrontends.json
next dev --port $(microfrontends port)               # start your app
microfrontends proxy --local-apps your-app-name      # start proxy
```

## Deployment

Each app deploys independently. Routing is controlled by `microfrontends.json` deployed with the default app — config changes only take effect once the default app is deployed to production. Deploying only the child app after a config change has no effect.
