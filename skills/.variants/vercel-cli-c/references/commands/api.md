<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel api

Make authenticated HTTP requests to the Vercel API

```
vercel api [endpoint] [options]
```

## Options

- `--dangerously-skip-permissions` — Skip confirmation prompts for DELETE operations (use with caution)
- `-F, --field <KEY=VALUE>` (repeatable) — Add a typed parameter (numbers, booleans parsed). Use @file for file contents
- `--generate <FORMAT>` — Generate output instead of executing (e.g., --generate=curl)
- `-H, --header <KEY:VALUE>` (repeatable) — Add a custom HTTP header
- `-i, --include` — Include response headers in output
- `--input <FILE>` — Read request body from file (use - for stdin)
- `-X, --method <METHOD>` — HTTP method (GET, POST, PUT, PATCH, DELETE). Defaults to GET, or POST if body is provided
- `--paginate` — Fetch all pages of results
- `--raw` — Output raw JSON without pretty-printing
- `-f, --raw-field <KEY=VALUE>` (repeatable) — Add a string option (no type parsing)
- `--refresh` — Force refresh the cached OpenAPI spec
- `--silent` — Suppress response output
- `--spec-url <URL>` — Fetch endpoints from a custom OpenAPI spec URL instead of the public Vercel spec
- `--verbose` — Show debug information including full request/response

## Subcommands

### `vercel api list`

List all available API endpoints

Aliases: `ls`

```
vercel api list [options]
```

#### Options

- `-F, --format <FORMAT>` — Specify the output format (json)
- `--refresh` — Force refresh the cached OpenAPI spec
- `--spec-url <URL>` — Fetch endpoints from a custom OpenAPI spec URL instead of the public Vercel spec

#### Examples

List all endpoints in table format

```
$ vercel api ls
```

List all endpoints as JSON

```
$ vercel api ls --format json
```

List endpoints from a custom OpenAPI spec

```
$ vercel api ls --spec-url https://openapi-internal.vercel.sh --refresh
```

## Examples

Get current user information

```
$ vercel api /v2/user
```

List projects with team scope

```
$ vercel api /v9/projects --scope my-team
```

Create a new project

```
$ vercel api /v10/projects -X POST -F name=my-project
```

Delete a deployment

```
$ vercel api /v13/deployments/dpl_abc123 -X DELETE
```

Paginate through all deployments

```
$ vercel api /v6/deployments --paginate
```

Post JSON from file

```
$ vercel api /v10/projects -X POST --input config.json
```

Add custom header

```
$ vercel api /v2/user -H "X-Custom-Header: value"
```

Interactive mode (select endpoint)

```
$ vercel api
```

Interactive mode with a custom OpenAPI spec

```
$ vercel api --spec-url https://openapi-internal.vercel.sh --refresh
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
