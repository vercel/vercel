# Routing Rules

## Overview

`vercel routes` manages project-level routing rules. Each rule matches requests by path pattern and optional conditions (headers, cookies, query params), then applies an action (rewrite, redirect, set status) or modifies headers and query params.

Routing rules take effect immediately without a deployment and take precedence over routes defined in your deployment configuration (`vercel.json`, `next.config.js`, etc.).

All changes are staged as drafts. After a single change with no existing draft, the CLI offers to publish immediately. Otherwise, run `vercel routes publish` to push staged changes to production, or `vercel routes discard-staging` to undo.

When in doubt about flags or subcommands, use `--help`:

```bash
vercel routes -h             # list subcommands
vercel routes add -h         # flags for add
vercel routes edit -h        # flags for edit
```

## Viewing Routing Rules

Use `list` to see all routing rules and `inspect` for full details on a specific rule.

```bash
vercel routes list                       # all routing rules
vercel routes list --diff                # staged changes vs production
vercel routes list --production          # production only
vercel routes list --search "api"        # search by name, src, dest
vercel routes list --filter rewrite      # filter: rewrite, redirect, set_status, transform
vercel routes list --expand              # show expanded details
vercel routes inspect "My Route"         # full details of a specific routing rule
vercel routes inspect "My Route" --diff  # compare staged vs production
```

## Creating Routing Rules

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

Routing rules can also be used without a primary action to only set response headers or apply request transforms.

### Examples

```bash
# AI — describe what you want
vercel routes add --ai "Rewrite /api/* to https://backend.example.com/*"

# Interactive — step by step
vercel routes add

# Rewrite with path-to-regexp syntax
vercel routes add "API Proxy" \
  --src "/api/:path*" --src-syntax path-to-regexp \
  --action rewrite --dest "https://api.example.com/:path*" --yes

# Redirect with status
vercel routes add "Legacy Redirect" \
  --src "/old-blog" --src-syntax equals \
  --action redirect --dest "/blog" --status 301 --yes

# Response headers only (no primary action)
vercel routes add "CORS" \
  --src "^/api/.*$" \
  --set-response-header "Access-Control-Allow-Origin=*" --yes

# Routing rule with conditions and a description
vercel routes add "Auth Required" \
  --src "/dashboard/:path*" --src-syntax path-to-regexp \
  --action redirect --dest "/login" --status 307 \
  --missing "cookie:session" \
  --description "Redirect unauthenticated users to login" --yes

# Control position in priority order
vercel routes add "Priority Route" \
  --src "/critical" --src-syntax equals \
  --action rewrite --dest "/handler" \
  --position start --yes
```

## Conditions

Used with `--has` and `--missing` flags on both `add` and `edit` commands. Repeatable.

**Types:** `header`, `cookie`, `query`, `host`

Max 16 conditions per routing rule (has + missing combined).

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
--has "host:contains=staging"
```

## Response Headers & Request Transforms

Used on both `add` and `edit` commands. Applied at the CDN level — response headers are set before the response reaches the client, request transforms are applied before the request reaches the origin. All flags are repeatable.

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

## Editing Routing Rules

```bash
# AI — describe the changes
vercel routes edit "My Route" --ai "Add CORS headers and change to 308 redirect"

# Interactive — pick fields to edit
vercel routes edit "My Route"

# Only the specified fields are changed; everything else is preserved
vercel routes edit "My Route" --dest "https://new-api.example.com/:path*" --yes
vercel routes edit "My Route" --action redirect --dest "/new" --status 301 --yes
vercel routes edit "My Route" --name "New Name" --yes

# Clear and replace conditions
vercel routes edit "My Route" --clear-conditions --has "header:Authorization" --yes

# Clear all response headers or transforms
vercel routes edit "My Route" --clear-headers --yes
vercel routes edit "My Route" --clear-transforms --yes
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
vercel routes export                     # export routing rules in vercel.json or vercel.ts format
```

## Anti-patterns

- Don't forget to `vercel routes publish` after making changes — they stay staged until published.
- `--action redirect` requires both `--dest` AND `--status` — omitting either will error.
