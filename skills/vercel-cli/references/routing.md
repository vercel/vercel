# Routing Rules

## Overview

`vercel routes` manages project-level routing rules. Each rule matches requests by path pattern and optional conditions (headers, cookies, query parameters), then applies an action (rewrite, redirect, set status) or modifies headers and query parameters.

Routing rules take effect immediately without a deployment and take precedence over routes defined in your deployment configuration (`vercel.json`, `next.config.js`, etc.).

Each routing rule has a unique name within the project, used to identify it in `edit`, `delete`, `enable`, `disable`, and `reorder` commands. Rules are evaluated in priority order (top to bottom). Use `reorder` to control placement.

All changes are staged as drafts. Run `vercel routes publish` to push staged changes to production.

## Viewing Routing Rules

```bash
vercel routes list                       # all routing rules
vercel routes list --diff                # staged changes vs production
vercel routes inspect "My Route"         # full details of a specific rule
```

## Creating Routing Rules

Use `--ai` with a natural language description to generate routing rules with AI. For full control, use flags or interactive mode.

### Source path (`--src` and `--src-syntax`)

Use `--src` to specify the path pattern and `--src-syntax` to control how it's interpreted:

| Syntax | Example | When to use |
|--------|---------|-------------|
| `regex` | `^/api/(.*)$` | Full regex control. |
| `path-to-regexp` | `/api/:path*` | Express-style named params. More readable. |
| `equals` | `/about` | Exact string match. Simplest option. |

Defaults to `regex` if `--src-syntax` is not specified. `path-to-regexp` and `equals` paths must start with `/`.

### Actions

Each routing rule can have at most one primary action:

| Action | Required flags | Description |
|--------|---------------|-------------|
| `rewrite` | `--dest` | Proxy to destination URL (transparent to the client) |
| `redirect` | `--dest` + `--status` (301/302/307/308) | Redirect the client to a new URL |
| `set-status` | `--status` (100-599) | Return a status code (no destination) |

A routing rule without a primary action can still set response headers or apply request transforms.

### Conditions

Conditions control when a routing rule matches. Use `--has` to require something is present, and `--missing` to require it is absent. Supported types are `header`, `cookie`, `query`, and `host`. Conditions are repeatable, up to 16 per rule.

```bash
# Existence check
--has "cookie:session"
--missing "header:Authorization"

# Value matching
--has "header:X-API-Key:eq=my-secret"          # exact match
--has "cookie:theme:contains=dark"              # value contains substring
--has "header:Accept:re=application/json.*"     # regex match
--missing "query:debug:eq=true"                 # must NOT have debug=true

# Host matching (no key, just value)
--has "host:eq=example.com"
```

### Response headers & request transforms

Response headers, request headers, and request query parameters can each be set, appended to, or deleted. All flags are repeatable.

```bash
--set-response-header "Cache-Control=public, max-age=3600"
--append-request-header "X-Forwarded-Host=myapp.com"
--delete-request-query "debug"
```

### Examples

```bash
# AI — describe what you want
vercel routes add --ai "Rewrite /api/* to https://backend.example.com/*"

# Interactive — guided builder with prompts
vercel routes add

# Rewrite with path-to-regexp syntax and a request header
vercel routes add "API Proxy" \
  --src "/api/:path*" --src-syntax path-to-regexp \
  --action rewrite --dest "https://api.example.com/:path*" \
  --set-request-header "X-Forwarded-Host=myapp.com" --yes

# Redirect with status
vercel routes add "Legacy Redirect" \
  --src "/old-blog" --src-syntax equals \
  --action redirect --dest "/blog" --status 301 --yes

# Routing rule with conditions and a description
vercel routes add "Auth Required" \
  --src "/dashboard/:path*" --src-syntax path-to-regexp \
  --action redirect --dest "/login" --status 307 \
  --missing "cookie:session" \
  --description "Redirect unauthenticated users to login" --yes
```

## Editing Routing Rules

```bash
# AI — describe the changes
vercel routes edit "My Route" --ai "Add CORS headers and change to 308 redirect"

# Interactive — choose which fields to modify
vercel routes edit "My Route"

# Change specific fields
vercel routes edit "My Route" --dest "https://new-api.example.com/:path*" --yes
vercel routes edit "My Route" --action redirect --dest "/new" --status 301 --yes
vercel routes edit "My Route" --name "New Name" --yes
```

## Managing Routing Rules

Use `vercel routes list` or `inspect` to find routing rule names and IDs.

```bash
vercel routes enable "My Route"           # enable a disabled routing rule
vercel routes disable "My Route"          # disable without removing
vercel routes delete "My Route"           # delete a routing rule
vercel routes reorder "My Route" --position start           # move to top
vercel routes reorder "My Route" --position end             # move to bottom
vercel routes reorder "My Route" --position after:<id>      # move after another
vercel routes reorder "My Route" --position before:<id>     # move before another
```

## Publishing & Versioning

```bash
vercel routes publish                    # promote staged changes to production
vercel routes discard-staging            # discard all staged changes
vercel routes list-versions              # view version history
vercel routes restore <version-id>       # roll back to a previous version
```
