<!-- GENERATED FILE - DO NOT EDIT.
     Regenerate with: pnpm --filter vercel generate-skill-reference
     Source: packages/cli/src/commands/*/command.ts -->

# vercel traces

Fetch traces captured for a Vercel project.

```
vercel traces [requestId]
```

## Subcommands

### `vercel traces create`

Capture a session trace for a request (alias for `vercel curl --trace`).

```
vercel traces create <path> [options]
```

#### Options

- `--deployment <ID|URL>` — The deployment ID or URL to target
- `--json` — Emit { response, requestId } as JSON on stdout
- `--protection-bypass <SECRET>` — Protection bypass secret for accessing protected deployments
- `-y, --yes` — Skip the production confirmation prompt (e.g. in non-interactive mode)

#### Examples

Capture a session trace for a request

```
$ vercel traces create /api/hello
```

Target a specific deployment

```
$ vercel traces create /api/status --deployment https://your-project-abc123.vercel.app
```

Pass curl flags after the separator

```
$ vercel traces create /api/test -- --request POST --data '{"name": "John"}'
```

### `vercel traces get`

Fetch a captured trace by request id. (default subcommand)

```
vercel traces get [requestId] [options]
```

#### Options

- `--json` — Print the raw trace JSON to stdout instead of the markdown summary.
- `--open` — Open the trace in the Vercel Dashboard instead of printing it.
- `--project <NAME|ID>` — Project name or id to fetch the trace from (overrides the linked project).
- `--view <timeline|tree|waterfall>` — Dashboard view to open. Only valid with --open. Defaults to timeline.

#### Examples

Fetch a trace by request id

```
$ vercel traces get req_1234567890
```

Print the raw trace JSON

```
$ vercel traces get req_1234567890 --json
```

`get` is the default — this is equivalent to the above

```
$ vercel traces req_1234567890
```

Fetch a trace from a specific team and project

```
$ vercel traces get req_1234567890 --scope my-team --project my-app
```

Open the trace in the Vercel Dashboard

```
$ vercel traces get req_1234567890 --open
```

Open the trace in the Vercel Dashboard with the waterfall view

```
$ vercel traces get req_1234567890 --open --view waterfall
```

## Examples

Fetch a trace by request id

```
$ vercel traces get req_1234567890
```

Print the raw trace JSON

```
$ vercel traces get req_1234567890 --json
```

Capture a session trace for a request

```
$ vercel traces create /api/hello
```

Global options (`--cwd`, `--scope`, `--token`, `--debug`, ...) also apply; see `global-options.md`.
