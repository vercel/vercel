<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel logs

Display request logs for a project.

With --follow, stream live runtime logs from a deployment. When no deployment is specified, resolves in order: latest deployment on the current git branch, then your latest deployment, then the latest production deployment. Use --environment production to always stream the latest production deployment.

Source types: λ = serverless, ε = edge/middleware, ◇ = static/external

Aliases: `log`

```
vercel logs [url|deploymentId] [options]
```

## Options

- `-b, --branch` — Filter by git branch (defaults to current branch for a linked project)
- `-d, --deployment` — Filter logs to a specific deployment ID or URL (alternative to positional argument)
- `--environment` — Filter by environment: production or preview. With --follow, selects which environment to stream (production always streams the latest production deployment)
- `-x, --expand` — Show full log message below each request line (default when output is not a TTY)
- `-f, --follow` — Stream live runtime logs. Without a deployment, follows the latest deployment on the current git branch, then your latest deployment, then the latest production deployment
- `-j, --json` — Output logs as JSON Lines for piping to other tools
- `--level` (repeatable) — Filter by log level: error, warning, info, fatal
- `-n, --limit` — Maximum number of results (default: 100)
- `--no-branch` — Disable auto-detection of git branch
- `--no-follow` — No-op; deployment arguments only stream logs when --follow is set
- `-p, --project <NAME_OR_ID>` — Project name or ID (defaults to the linked project)
- `-q, --query` — Advanced search query (supports filter syntax, e.g. "status:500 error")
- `--request-id` — Filter by request ID
- `--since` — Start time (ISO format or relative: 1h, 30m)
- `--source` (repeatable) — Filter by source: serverless, edge-function, edge-middleware, static
- `--status-code` — Filter by HTTP status code (e.g., 500, 4xx)
- `--until` — End time (ISO format or relative, default: now)

## Examples

Stream live logs for your most recent deployment

```
$ vercel logs --follow
```

Stream live logs for the latest production deployment

```
$ vercel logs --follow --environment production
```

Stream live logs for a deployment URL

```
$ vercel logs https://my-app-xxxxx.vercel.app --follow
```

Stream live logs for a deployment ID

```
$ vercel logs dpl_xxxxx --follow
```

Stream logs for a specific project

```
$ vercel logs --project my-app --follow
```

Display recent logs for the linked project

```
$ vercel logs
```

Display error logs from the last hour

```
$ vercel logs --level error --since 1h
```

Display logs for a specific deployment (historical)

```
$ vercel logs dpl_xxxxx
```

Filter logs by status code and output as JSON

```
$ vercel logs --status-code 500 --json
```

Search logs and pipe to jq

```
$ vercel logs --query "timeout" --json | jq '.message'
```

Use advanced search query with filters

```
$ vercel logs --query 'status:500 error' --json | jq '.message'
```

Display production logs only

```
$ vercel logs --environment production
```

Display logs for a specific request

```
$ vercel logs --request-id req_xxxxx
```

Display logs with full message details

```
$ vercel logs --expand
```

Display logs for a specific branch

```
$ vercel logs --branch feature-x
```

Display logs for all branches (disable auto-detection)

```
$ vercel logs --no-branch
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
