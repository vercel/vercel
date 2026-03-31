# Routing Rules

## Overview

`vercel routes` manages project-level CDN routing rules. These take effect immediately without a deployment and take precedence over routes defined in your deployment configuration (`vercel.json`, `next.config.js`, etc.).

All changes are staged as drafts before going live. After making changes, run `vercel routes publish` to push them to production, or `vercel routes discard-staging` to undo.

## Actions

A route can have at most one primary action:

| Action | Required flags | Description |
|--------|---------------|-------------|
| `rewrite` | `--dest` | Proxy to destination URL (transparent to the client) |
| `redirect` | `--dest` + `--status` (301/302/307/308) | Redirect the client to a new URL |
| `set-status` | `--status` (100-599) | Return a status code (no destination) |

A route can also have no primary action — only response headers or request transforms.

## Conditions

Control when a route matches using `--has` (must match) and `--missing` (must not match). Repeatable, max 16 total.

**Types:** `header`, `cookie`, `query`, `host`

**Formats:**

```bash
# Existence check — does the header/cookie/query exist?
--has "cookie:session"
--missing "header:Authorization"

# Value matching — check the actual value
--has "header:X-API-Key:eq=my-secret"          # exact match
--has "cookie:theme:contains=dark"              # value contains substring
--has "header:Accept:re=application/json.*"     # regex match
--missing "query:debug:eq=true"                 # must NOT have debug=true

# Host matching (no key, just value)
--has "host:eq=example.com"
--has "host:contains=staging"
```

## Response Headers & Request Transforms

Modify headers and query params on the request or response. All flags are repeatable.

```bash
# Response headers
--set-response-header "Cache-Control=public, max-age=3600"
--append-response-header "X-Custom=value"
--delete-response-header "X-Powered-By"

# Request headers (before forwarding to destination)
--set-request-header "X-Forwarded-Host=myapp.com"
--delete-request-header "Cookie"

# Request query params
--set-request-query "version=2"
--delete-request-query "debug"
```

## Creating Routes

### Source path syntax (`--src-syntax`)

| Syntax | Default | Example | When to use |
|--------|---------|---------|-------------|
| `regex` | Yes | `^/api/(.*)$` | Full regex control. Default if not specified. |
| `path-to-regexp` | No | `/api/:path*` | Express-style named params. More readable. |
| `equals` | No | `/about` | Exact string match. Simplest option. |

`path-to-regexp` and `equals` paths must start with `/`. Only `regex` allows patterns without a leading `/`.

### Examples

```bash
# AI — describe what you want
vercel routes add --ai "Rewrite /api/* to https://backend.example.com/*"

# Interactive — step by step
vercel routes add

# Flags — full control
vercel routes add "API Proxy" \
  --src "/api/:path*" --src-syntax path-to-regexp \
  --action rewrite --dest "https://api.example.com/:path*" --yes

# Redirect with status
vercel routes add "Legacy Redirect" \
  --src "/old-blog" --src-syntax equals \
  --action redirect --dest "/blog" --status 301 --yes

# CORS headers (no primary action, just headers)
vercel routes add "CORS" \
  --src "^/api/.*$" \
  --set-response-header "Access-Control-Allow-Origin=*" --yes

# Route with conditions — redirect if auth cookie missing
vercel routes add "Auth Required" \
  --src "/dashboard/:path*" --src-syntax path-to-regexp \
  --action redirect --dest "/login" --status 307 \
  --missing "cookie:session" --yes

# Control position in priority order
vercel routes add "Priority Route" \
  --src "/critical" --src-syntax equals \
  --action rewrite --dest "/handler" \
  --position start --yes
```

## Editing Routes

```bash
# AI — describe the changes
vercel routes edit "My Route" --ai "Add CORS headers and change to 308 redirect"

# Interactive — pick fields to edit
vercel routes edit "My Route"

# Change specific fields (other fields preserved)
vercel routes edit "My Route" --dest "https://new-api.example.com/:path*" --yes
vercel routes edit "My Route" --action redirect --dest "/new" --status 301 --yes
vercel routes edit "My Route" --name "New Name" --yes

# Clear and replace conditions
vercel routes edit "My Route" --clear-conditions --has "header:Authorization" --yes

# Clear all response headers or transforms
vercel routes edit "My Route" --clear-headers --yes
vercel routes edit "My Route" --clear-transforms --yes
```

## Managing Routes

```bash
vercel routes enable "My Route"           # enable a disabled route
vercel routes disable "My Route"          # disable without removing
vercel routes delete "My Route"           # delete a route
vercel routes reorder "My Route" --position start           # move to top
vercel routes reorder "My Route" --position end             # move to bottom
vercel routes reorder "My Route" --position after:<id>      # move after another
vercel routes reorder "My Route" --position before:<id>     # move before another
```

## Viewing Routes

```bash
vercel routes list                       # all routes
vercel routes list --diff                # staged changes vs production
vercel routes list --production          # production only
vercel routes list --search "api"        # search by name, src, dest
vercel routes list --filter rewrite      # filter: rewrite, redirect, set_status, transform
vercel routes list --expand              # show expanded details
vercel routes inspect "My Route"         # full details of a specific route
vercel routes inspect "My Route" --diff  # compare staged vs production
```

## Publishing & Versioning

```bash
vercel routes publish                    # promote staged changes to production
vercel routes discard-staging            # discard all staged changes
vercel routes list-versions              # view version history
vercel routes restore <version-id>       # restore a previous version
vercel routes export                     # export as vercel.json/vercel.ts format
```

## Anti-patterns

- Don't forget to `vercel routes publish` after making changes — they stay staged until published.
- `--action redirect` requires both `--dest` AND `--status` — omitting either will error.
