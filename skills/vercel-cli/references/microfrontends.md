# Microfrontends

Split a large application into independently deployable units that render as one cohesive app. The default app hosts `microfrontends.json` and serves unmatched requests; child apps declare `routing` path patterns.

## Quick Start

```bash
vercel mf create-group    # create a group and add projects
vercel mf pull            # pull microfrontends.json for local dev
vercel mf proxy           # start the local dev proxy
```

## Managing Groups

### Create

```bash
vercel microfrontends create-group                   # interactive
vercel mf create-group --non-interactive \           # fully scripted
  --name "my-group" \
  --project web \
  --project docs \                                   # repeatable
  --default-app web \
  --default-route / \
  --project-default-route docs=/docs \               # required per non-default project
  --yes                                              # skip confirmation
```

> `--non-interactive` is blocked when adding projects would exceed the free tier limit — the user must confirm billing changes interactively.

### Inspect

Returns project names, frameworks, git repos, and root directories. Useful for automating `microfrontends.json` generation.

```bash
vercel mf inspect-group                              # interactive group selection
vercel mf inspect-group --group="my-group"           # specific group
vercel mf inspect-group --group="my-group" --format=json  # machine-readable
```

### Add / Remove Projects

Run from the project directory. Both commands require an interactive terminal.

```bash
vercel mf add-to-group                               # interactive
vercel mf add-to-group --group="my-group" --default-route=/docs

vercel mf remove-from-group                          # interactive
vercel mf remove-from-group --yes                    # skips project-link prompt only
```

After removing, update `microfrontends.json` in the default app to remove the project's entry. The default app can only be removed after all other projects are removed.

### Delete Group

Irreversible. All projects are removed from the group automatically.

```bash
vercel mf delete-group                               # interactive
vercel mf delete-group --group="my-group"
```

## `pull`

Downloads `microfrontends.json` from the default application. Required in polyrepo setups. Requires CLI 44.2.2+.

```bash
vercel microfrontends pull
vercel mf pull --dpl <deployment-url>
```

## Local Development

The local proxy routes requests to running apps and falls back to production for others. Default port: `3024`.

### Monorepo (Turborepo)

The proxy starts automatically via `turbo` (requires turbo ≥ 2.3.6 or ≥ 2.4.2):

```bash
turbo run dev --filter=web
```

### Without Turborepo

```json
{
  "scripts": {
    "dev": "next dev --port $(microfrontends port)",
    "proxy": "microfrontends proxy microfrontends.json --local-apps web"
  }
}
```

Run both scripts simultaneously.

### Polyrepo

```bash
vercel mf pull                                       # fetch microfrontends.json
next dev --port $(microfrontends port)               # start your app
microfrontends proxy --local-apps your-app-name      # start proxy
```

Alternatively, set `VC_MICROFRONTENDS_CONFIG=/path/to/microfrontends.json` instead of pulling.

### `microfrontends proxy`

```bash
microfrontends proxy [configPath] --local-apps web docs   # multiple local apps
microfrontends proxy --port 4001                          # override port
```

### `microfrontends port`

Prints the auto-assigned dev port for the current app (deterministic, based on app name):

```bash
next dev --port $(microfrontends port)
```

## Deployment

Each app deploys independently. Routing is controlled by `microfrontends.json` deployed with the default app — config changes only take effect once the default app is deployed to production.

## Anti-Patterns

- **Using `--non-interactive` when billing limits are exceeded**: The CLI blocks this — run interactively instead.
- **Skipping `vercel mf pull` in polyrepo**: Without `microfrontends.json` locally, the proxy can't route correctly.
- **Forgetting to update `microfrontends.json` after `remove-from-group`**: Leaving the entry causes routing errors on the next default app deployment.
- **Running `add-to-group` or `remove-from-group` in CI**: Both require an interactive terminal — use the Vercel Dashboard instead.
- **Deploying only the child app after config changes**: Changes to `microfrontends.json` only take effect when the default app is deployed.
