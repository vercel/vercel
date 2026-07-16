<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel curl

Execute curl with automatic deployment URL and protection bypass.

```
vercel curl <path> [options]
```

## Options

- `--deployment <ID|URL>` — The deployment ID or URL to target
- `--json` — With --trace, emit { response, requestId } as JSON on stdout
- `--protection-bypass <SECRET>` — Protection bypass secret for accessing protected deployments
- `--trace` — Capture a session trace for the request and print the trace request id
- `-y, --yes` — Skip confirmation when linking is required (e.g. in non-interactive mode)

## Examples

Make a GET request to an API endpoint

```
$ vercel curl /api/hello
```

Make a POST request with data

```
$ vercel curl /api/users -- --request POST --data '{"name": "John"}'
```

Target a specific deployment by ID

```
$ vercel curl /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV
```

Target a specific deployment by URL

```
$ vercel curl /api/status --deployment https://your-project-abc123.vercel.app
```

Use curl flags after the separator

```
$ vercel curl /api/test -- --header "Content-Type: application/json" --request PUT
```

Use with protection bypass secret

```
$ vercel curl /api/protected --protection-bypass <secret> -- --request GET
```

Capture a session trace for the request

```
$ vercel curl --trace /api/hello
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
