# Routing Rules

## Overview

The `vercel routes` command manages project-level routing rules. These rules take effect immediately without requiring a deployment and take precedence over routes defined in your deployment configuration (`vercel.json`, `next.config.js`, etc.).

All changes go through a **draft workflow** — stage changes, review, then publish to production.

## Draft Workflow

```bash
vercel routes list --diff      # see staged vs production changes
vercel routes publish           # promote staged changes to production
vercel routes discard-staging   # discard all staged changes
```

## Viewing Routes

```bash
vercel routes list                          # list all routes (shows draft state)
vercel routes list --diff                   # show staged changes vs production
vercel routes list --production             # show only production routes
vercel routes inspect "My Route"            # full details of a specific route
vercel routes inspect "My Route" --diff     # compare staged vs production
```

## Creating Routes

Four creation modes — AI, interactive, flags, or JSON:

```bash
# AI (natural language)
vercel routes add --ai "Redirect /old to /new with 301"

# Interactive (step by step)
vercel routes add

# Flags
vercel routes add "API Proxy" \
  --src "/api/:path*" \
  --dest "https://api.example.com/:path*" \
  --action rewrite

# Redirect with status
vercel routes add "Legacy Redirect" \
  --src "/old-path" \
  --dest "/new-path" \
  --action redirect --status 301
```

## Editing Routes

```bash
# AI
vercel routes edit "My Route" --ai "Add CORS headers"

# Interactive (field by field)
vercel routes edit "My Route"

# Flags (partial overrides — only specified fields change)
vercel routes edit "My Route" --dest "https://new-api.example.com/:path*"
vercel routes edit "My Route" --action redirect --dest "/new" --status 301
```

## Managing Routes

```bash
vercel routes enable "My Route"           # enable a disabled route
vercel routes disable "My Route"          # disable without removing
vercel routes remove "My Route"           # delete a route
vercel routes reorder "My Route" --position start   # move to top
vercel routes reorder "My Route" --position after:<id>  # move after another
```

## Key Concepts

- **Priority order**: Routes are evaluated top to bottom. Use `reorder` to change priority.
- **Source pattern**: The URL path to match. Supports `path-to-regexp` syntax (`:param`, `*`, `(.*)`).
- **Actions**: `rewrite` (proxy to destination), `redirect` (301/302/307/308), `set-status` (return status code).
- **Conditions**: `--has` and `--missing` check for headers, cookies, query params, or host.
- **Response headers**: Set, append, or delete headers on the response.
- **Request transforms**: Modify request headers and query params before forwarding.

## Conditions

```bash
# Route only matches if Authorization header exists
vercel routes add "Auth API" \
  --src "/api/:path*" \
  --dest "https://api.example.com/:path*" \
  --action rewrite \
  --has "header:Authorization"

# Route only matches if session cookie is missing
vercel routes add "Login Redirect" \
  --src "/dashboard" \
  --dest "/login" \
  --action redirect --status 302 \
  --missing "cookie:session"
```

## JSON Output

```bash
vercel routes list --json          # machine-readable route list
vercel routes inspect "My Route" --json   # single route as JSON
```

## Anti-Patterns

- Don't forget to `vercel routes publish` after making changes — they stay staged until published.
- Don't use `--production` flag when you want to see draft state — it only shows live routes.
- Use `--yes` in CI to skip confirmation prompts.
