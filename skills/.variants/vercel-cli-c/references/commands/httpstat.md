<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel httpstat

Execute httpstat with automatic deployment URL and protection bypass to visualize HTTP timing statistics.

```
vercel httpstat <path> [options]
```

## Options

- `--deployment <ID|URL>` — The deployment ID or URL to target
- `--protection-bypass <SECRET>` — Protection bypass secret for accessing protected deployments
- `-y, --yes` — Skip confirmation when linking is required (e.g. in non-interactive mode)

## Examples

Visualize timing for a GET request to an API endpoint

```
$ vercel httpstat /api/hello
```

Make a POST request with data and see timing details

```
$ vercel httpstat /api/users -- -X POST -d '{"name": "John"}'
```

Target a specific deployment by ID

```
$ vercel httpstat /api/status --deployment ERiL45NJvP8ghWxgbvCM447bmxwV
```

Use curl flags after the separator

```
$ vercel httpstat /api/test -- -H "Content-Type: application/json" -X PUT
```

Use with protection bypass secret

```
$ vercel httpstat /api/protected --protection-bypass <secret>
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
