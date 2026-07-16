<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel routes

Manage routing rules for a project. Routes managed at the project level apply to all deployments and environments.

```
vercel routes <command>
```

## Subcommands

### `vercel routes add`

Add a new routing rule to the project

```
vercel routes add [name] [options]
```

#### Options

- `--action <TYPE>` — Action type: rewrite, redirect, or set-status (required with --dest/--status)
- `--ai <PROMPT>` — Generate route from a natural language description (AI-powered)
- `--append-request-header <HEADER>` (repeatable) — Append to request header: key=value (repeatable)
- `--append-request-query <PARAM>` (repeatable) — Append to query parameter: key=value (repeatable)
- `--append-response-header <HEADER>` (repeatable) — Append to response header: key=value (repeatable)
- `--delete-request-header <KEY>` (repeatable) — Delete request header: key (repeatable)
- `--delete-request-query <KEY>` (repeatable) — Delete query parameter: key (repeatable)
- `--delete-response-header <KEY>` (repeatable) — Delete response header: key (repeatable)
- `--description <TEXT>` — Route description (max 1024 chars)
- `--dest <URL>` — Destination URL for rewrite or redirect
- `--disabled` — Create route in disabled state
- `--has <CONDITION>` (repeatable) — Condition that must match: type:key or type:key:value (repeatable)
- `--missing <CONDITION>` (repeatable) — "Does not have" condition: type:key or type:key:value (repeatable)
- `--position <POSITION>` — Position: start, end, after:<id>, before:<id>
- `--set-request-header <HEADER>` (repeatable) — Set request header: key=value (repeatable)
- `--set-request-query <PARAM>` (repeatable) — Set query parameter: key=value (repeatable)
- `--set-response-header <HEADER>` (repeatable) — Set response header: key=value (repeatable)
- `--src <PATTERN>` — Path pattern (required in non-interactive mode)
- `--src-syntax <TYPE>` — Path syntax: regex (default), path-to-regexp, equals
- `--status <CODE>` — Status code (301/302/307/308 for redirect, or any for set-status)
- `-y, --yes` — Skip confirmation prompts

#### Examples

Interactive mode

```
$ vercel routes add
```

Create with AI

```
$ vercel routes add --ai "Rewrite /api/* to https://backend.internal/*"
```

Add a rewrite

```
$ vercel routes add "API Proxy" --src "/api/:path*" --src-syntax path-to-regexp --action rewrite --dest "https://api.example.com/:path*" --yes
```

Add a redirect

```
$ vercel routes add "Old Blog" --src "/blog" --src-syntax equals --action redirect --dest "/articles" --status 301 --yes
```

Add CORS headers

```
$ vercel routes add "CORS" --src "^/api/.*$" --set-response-header "Access-Control-Allow-Origin=*" --yes
```

Block access (set status)

```
$ vercel routes add "Block Admin" --src "^/admin/.*$" --action set-status --status 403 --yes
```

Conditional redirect

```
$ vercel routes add "Auth Required" --src "/protected/:path*" --src-syntax path-to-regexp --action redirect --dest "/login" --status 307 --missing "cookie:session" --yes
```

Rewrite with request headers

```
$ vercel routes add "Backend Proxy" --src "/backend/:path*" --src-syntax path-to-regexp --action rewrite --dest "https://internal.example.com/:path*" --set-request-header "X-Forwarded-Host=myapp.com" --yes
```

Add route at start

```
$ vercel routes add "Priority Route" --src "/priority" --src-syntax equals --action rewrite --dest "/handler" --position start --yes
```

### `vercel routes delete`

Delete one or more routing rules

Aliases: `rm`

```
vercel routes delete <name-or-id ...> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when deleting

#### Examples

Delete a route by name

```
$ vercel routes delete "Old Redirect"
```

Delete a route by ID

```
$ vercel routes delete abc123
```

Delete multiple routes

```
$ vercel routes delete "Route A" "Route B"
```

Delete without confirmation

```
$ vercel routes delete "Old Route" --yes
```

### `vercel routes disable`

Disable a routing rule without deleting it

```
vercel routes disable <name-or-id>
```

#### Examples

Disable a route by name

```
$ vercel routes disable "API Proxy"
```

Disable a route by ID

```
$ vercel routes disable abc123
```

### `vercel routes discard-staging`

Discard staged routing changes

```
vercel routes discard-staging [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when discarding

#### Examples

Discard staged changes

```
$ vercel routes discard-staging
```

Discard without confirmation

```
$ vercel routes discard-staging --yes
```

### `vercel routes edit`

Edit an existing routing rule

```
vercel routes edit <name-or-id> [options]
```

#### Options

- `--action <TYPE>` — Set action type: rewrite, redirect, or set-status (required when switching types)
- `--ai <PROMPT>` — Describe changes using natural language (AI-powered)
- `--append-request-header <HEADER>` (repeatable) — Append to request header: key=value (repeatable)
- `--append-request-query <PARAM>` (repeatable) — Append to query parameter: key=value (repeatable)
- `--append-response-header <HEADER>` (repeatable) — Append to response header: key=value (repeatable)
- `--clear-conditions` — Remove all has/does-not-have conditions
- `--clear-headers` — Remove all response headers
- `--clear-transforms` — Remove all transforms (request headers, request query)
- `--delete-request-header <KEY>` (repeatable) — Delete request header: key (repeatable)
- `--delete-request-query <KEY>` (repeatable) — Delete query parameter: key (repeatable)
- `--delete-response-header <KEY>` (repeatable) — Delete response header: key (repeatable)
- `--description <TEXT>` — Change description (use "" to clear)
- `--dest <URL>` — Set destination URL
- `--has <CONDITION>` (repeatable) — Add a has condition: type:key or type:key:value (repeatable)
- `--missing <CONDITION>` (repeatable) — Add a "does not have" condition: type:key or type:key:value (repeatable)
- `--name <NAME>` — Change route name
- `--no-dest` — Remove destination
- `--no-status` — Remove status code
- `--set-request-header <HEADER>` (repeatable) — Set request header: key=value (repeatable)
- `--set-request-query <PARAM>` (repeatable) — Set query parameter: key=value (repeatable)
- `--set-response-header <HEADER>` (repeatable) — Set response header: key=value (repeatable)
- `--src <PATTERN>` — Change source path pattern
- `--src-syntax <TYPE>` — Change path syntax: regex, path-to-regexp, equals
- `--status <CODE>` — Set status code
- `-y, --yes` — Skip confirmation prompts

#### Examples

Interactive mode

```
$ vercel routes edit "API Proxy"
```

Edit with AI

```
$ vercel routes edit "API Proxy" --ai "Add CORS headers and change status to 308"
```

Change destination

```
$ vercel routes edit "API Proxy" --dest "https://new-api.example.com/:path*"
```

Switch to redirect

```
$ vercel routes edit "Old Route" --action redirect --dest "/new" --status 301
```

Add a response header

```
$ vercel routes edit "My Route" --set-response-header "Cache-Control=public, max-age=3600"
```

Clear all conditions and add new ones

```
$ vercel routes edit "My Route" --clear-conditions --has "header:Authorization"
```

### `vercel routes enable`

Enable a disabled routing rule

```
vercel routes enable <name-or-id>
```

#### Examples

Enable a route by name

```
$ vercel routes enable "API Proxy"
```

Enable a route by ID

```
$ vercel routes enable abc123
```

### `vercel routes export`

Export routes to a vercel.json or vercel.ts file

```
vercel routes export [name-or-id] [options]
```

#### Options

- `-o, --output <json|ts>` — Output file format: .json (default) or .ts

#### Examples

Export as vercel.json format

```
$ vercel routes export
```

Export as vercel.ts format

```
$ vercel routes export --output ts
```

Export a specific route

```
$ vercel routes export "API Proxy"
```

Export to a file

```
$ vercel routes export > routes.json
```

### `vercel routes inspect`

Show detailed information about a specific route

```
vercel routes inspect <name-or-id> [options]
```

#### Options

- `--diff` — Compare staged changes against production for this route

#### Examples

Inspect a route by name

```
$ vercel routes inspect "API rewrite"
```

Inspect a route by ID

```
$ vercel routes inspect abc123
```

Show staged changes for a route

```
$ vercel routes inspect "My route" --diff
```

### `vercel routes list`

List all routing rules for the current project. These routes apply to all deployments and environments.

Aliases: `ls`

```
vercel routes list [options]
```

#### Options

- `--diff` — Compare staged changes against production. Use with --version-id to compare a specific version.
- `-e, --expand` — Show expanded details for each route
- `-f, --filter <TYPE>` — Filter by type: rewrite, redirect, set_status, transform
- `--production` — List routes from the live production version
- `-s, --search <QUERY>` — Search by name, description, source, or destination
- `--version-id <VERSION_ID>` — List routes from a specific version ID

#### Examples

List all routes

```
$ vercel routes list
```

Search for routes

```
$ vercel routes list --search "api"
```

Filter by type

```
$ vercel routes list --filter rewrite
```

Show staged changes

```
$ vercel routes list --diff
```

Show live production routes

```
$ vercel routes list --production
```

Show expanded details

```
$ vercel routes list --expand
```

### `vercel routes list-versions`

List all versions of routing rules

Aliases: `ls-versions`

```
vercel routes list-versions [options]
```

#### Options

- `--count <NUMBER>` — Number of versions to fetch (default: 20, max: 100)

#### Examples

List route versions

```
$ vercel routes list-versions
```

List more versions

```
$ vercel routes list-versions --count 50
```

### `vercel routes publish`

Publish staged routing changes to production

```
vercel routes publish [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when publishing

#### Examples

Publish staged changes

```
$ vercel routes publish
```

Publish without confirmation

```
$ vercel routes publish --yes
```

### `vercel routes reorder`

Move a routing rule to a different position

Aliases: `move`

```
vercel routes reorder <name-or-id> [options]
```

#### Options

- `--first` — Move to the first position (highest priority)
- `--last` — Move to the last position (lowest priority)
- `--position <POSITION>` — Target position: start, end, a number (1-based), before:<id>, after:<id>
- `-y, --yes` — Skip the confirmation prompt when reordering

#### Examples

Move to first position

```
$ vercel routes reorder "Catch All" --first
```

Move to last position

```
$ vercel routes reorder "Catch All" --last
```

Move to a specific position

```
$ vercel routes reorder "API Proxy" --position 3
```

Move after another route

```
$ vercel routes reorder "API Proxy" --position after:route-id-123
```

Interactive reorder (prompts for position)

```
$ vercel routes reorder "API Proxy"
```

### `vercel routes restore`

Restore a previous routing version to production

```
vercel routes restore <version-id> [options]
```

#### Options

- `-y, --yes` — Skip the confirmation prompt when restoring

#### Examples

Restore a previous version

```
$ vercel routes restore <version-id>
```

Restore without confirmation

```
$ vercel routes restore <version-id> --yes
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
