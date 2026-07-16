# Advanced Commands

Run `vercel <command> --help` for flags and examples; this file covers decision guidance and behavior help cannot tell you.

## `vercel api` — Fallback for Missing CLI Commands

**Use `vercel api` when a CLI command doesn't exist for what you need.** Full access to the Vercel REST API with automatic authentication.

Use first-class CLI commands before `vercel api` whenever they expose the data or mutation you need.

Use `vercel api` when:

- The first-class CLI command does not exist.
- The first-class command omits fields needed for the answer.
- JSON output is needed for filtering or aggregation.
- Endpoint discovery is needed through `vercel api list` (alias `ls`).

Keep calls narrow and shape large responses before presenting them. Add `--raw` when a downstream parser should receive only the JSON response payload. Use `--raw-field` instead of typed `--field` when the API expects a string value that looks like a boolean or number.

Do not parse `vercel api --generate=curl` output as JSON; it emits a curl command.

DELETE requests prompt for confirmation; in non-interactive/agent mode they are refused unless `--dangerously-skip-permissions` is passed. Use that flag only for deletions the user explicitly approved.

## `vercel traces` — Captured Request Traces

Fetch traces captured for a Vercel project by request ID. `get` is the default subcommand, so `vercel traces req_123` and `vercel traces get req_123` are equivalent. Output is a markdown summary by default (`--json` for raw trace JSON); `--open` opens the trace in the Vercel Dashboard, and `--view` (timeline, tree, gantt) is only valid alongside `--open`.

## `vercel oauth-apps` — Vercel Apps (OAuth)

Register Vercel Apps (OAuth client IDs) and manage team installations. Useful for building integrations that authenticate against a Vercel team.

`register` issues a client ID (use `--format json` to capture it). `install` (alias `add`) installs an app to the current team using that client ID. At least one `--permission` is required (the install errors with `Provide at least one --permission` otherwise); repeat `--permission` for each scope the app needs. `--projects` scopes an install to specific project IDs (or `*` for all).

## Other Commands

`vercel webhooks` (webhook management), `vercel mcp` (MCP setup, see agent-and-ai.md), `vercel telemetry`, and `vercel upgrade` also exist — see their `--help`.
