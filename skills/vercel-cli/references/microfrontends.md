# Microfrontends

Split a large application into independently deployable units that render as one cohesive app. The default app hosts `microfrontends.json` and serves unmatched requests; child apps declare `routing` path patterns.

## Quick Start

```bash
vercel mf create-group       # create a group and add projects
vercel mf pull               # pull microfrontends.json for local dev
vercel mf proxy              # start the local dev proxy
```

## `create-group`

Creates a new microfrontends group. Interactive by default; use `--non-interactive` for scripting.

```bash
vercel microfrontends create-group
vercel mf create-group --non-interactive \
  --name "my-group" \
  --project web \
  --project docs \
  --default-app web \
  --default-route / \
  --project-default-route docs=/docs \
  --yes
```

| Flag | Description |
|---|---|
| `--name` | Group name |
| `--project` | Vercel project to add (repeatable) |
| `--default-app` | Which project is the default app |
| `--default-route` | Default route for the default app |
| `--project-default-route` | Route for a non-default project, format: `<project>=<route>` (required for each non-default project in `--non-interactive` mode) |
| `--yes` | Skip confirmation prompt |
| `--non-interactive` | Fully non-interactive mode (blocked if billing changes require interactive confirmation) |

## `inspect-group`

Returns project names, frameworks, git repos, and root directories — useful for automating `microfrontends.json` generation.

```bash
vercel mf inspect-group
vercel mf inspect-group --group="my-group" --format=json
```

| Flag | Description |
|---|---|
| `--group` | Group name, slug, or ID (omit for interactive selection) |
| `--format` | Use `json` for machine-readable output |
| `--config-file-name` | Custom config file path/name (must end in `.json` or `.jsonc`) |

## `add-to-group`

Adds the current project to an existing group. Run from the project directory. Requires an interactive terminal.

```bash
vercel microfrontends add-to-group
vercel mf add-to-group --group="my-group" --default-route=/docs
```

| Flag | Description |
|---|---|
| `--group` | Pre-select the group |
| `--default-route` | Default route for this project in its child deployments |

## `remove-from-group`

Removes the current project from its group. Requires an interactive terminal.

```bash
vercel microfrontends remove-from-group
vercel mf remove-from-group --yes
```

The `--yes` flag skips the project-link prompt only, not the removal confirmation. After removal, update `microfrontends.json` in the default app to remove the project's entry.

> The default application can only be removed after all other projects in the group are removed.

## `delete-group`

Deletes a group and all its settings. Irreversible. Projects are removed from the group automatically.

```bash
vercel microfrontends delete-group
vercel mf delete-group --group="my-group"
```

## `pull`

Downloads `microfrontends.json` from the default application. Required in polyrepo setups where each repo doesn't have the config locally. Requires Vercel CLI 44.2.2+.

```bash
vercel microfrontends pull
vercel mf pull --dpl <deployment-url>
```

## Local Development

The `@vercel/microfrontends` proxy routes requests to locally running apps and falls back to production for apps not running locally. Default proxy port: `3024`.

### Monorepo (Turborepo)

The proxy starts automatically when running a dev task with `turbo` (requires turbo ≥ 2.3.6 or ≥ 2.4.2):

```bash
turbo run dev --filter=web
```

### Without Turborepo

Start the proxy and dev server separately:

```bash
# package.json
{
  "scripts": {
    "dev": "next dev --port $(microfrontends port)",
    "proxy": "microfrontends proxy microfrontends.json --local-apps web"
  }
}
```

### Polyrepo

```bash
vercel mf pull                                    # get microfrontends.json
next dev --port $(microfrontends port)            # start your app
microfrontends proxy --local-apps your-app-name  # start proxy
```

Or set `VC_MICROFRONTENDS_CONFIG=/path/to/microfrontends.json` instead of pulling.

### `microfrontends proxy`

```
microfrontends proxy [configPath] --local-apps <names...> [--port <port>]
```

| Argument/Flag | Description |
|---|---|
| `[configPath]` | Path to `microfrontends.json` (auto-detected in monorepos) |
| `--local-apps` | Space-separated app names running locally |
| `--port` | Override proxy port |

### `microfrontends port`

Prints the auto-assigned dev port for the current app (deterministic, based on app name):

```bash
next dev --port $(microfrontends port)
```

## Deployment

Each app in a group deploys independently with `vercel deploy` or `vercel --prod`. The group routes traffic based on `microfrontends.json` deployed with the default app.

```bash
# Deploy the default app (with microfrontends.json) to production
vercel --prod

# Deploy a child app independently
vercel --prod
```

Config changes in `microfrontends.json` take effect once the default app is deployed to production.

## Anti-Patterns

- **Using `--non-interactive` when billing limits are exceeded**: The CLI blocks this and requires interactive confirmation — run without `--non-interactive` instead.
- **Skipping `vercel mf pull` in polyrepo**: Without `microfrontends.json` locally, the proxy can't route correctly.
- **Forgetting to update `microfrontends.json` after `remove-from-group`**: The CLI warns but won't block — leaving the entry causes routing errors on the next default app deployment.
- **Running `add-to-group` or `remove-from-group` in a non-interactive terminal**: Both commands require an interactive terminal; use the Vercel Dashboard instead for CI environments.
- **Deploying only the child app after config changes**: Changes to `microfrontends.json` only take effect when the default app is deployed.
