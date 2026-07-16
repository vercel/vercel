# Environment Variables

`vercel env` manages project environment variables. Run `vercel env --help` and `vercel env <subcommand> --help` for flags; this file covers behavior help cannot tell you.

## Scoping

Env vars are scoped to **environments**: production, preview (can be branch-specific), and development.

Variables can be plain text or sensitive (encrypted, not readable after creation).

## Inspecting Env Vars

`vercel env ls` shows configured variable names, targets, and metadata; add an environment argument (e.g. `vercel env ls production`) to filter, and `--format json` for metadata-oriented investigations. Plain values may appear in JSON output; sensitive values are not readable after creation.

Use `--project <name-or-id>` with `--scope <team>` when needed to override the linked project.

If CLI output does not include required metadata, use `vercel api` after checking available endpoints with `vercel api list`.

## Managing Env Vars

Note: `environment` is a **positional argument**, not a flag (e.g. `vercel env add API_KEY production`).

In non-interactive / agent mode, `env add` and `env update` require the value via `--value` or stdin. Without one of these, the command exits with an `action_required` payload asking you to re-run with `--value <value> --yes`. Piping works too:

```bash
echo "secret" | vercel env add TOKEN production --yes
```

## Pulling Locally

`vercel env pull` writes to `.env.local` by default; pass a filename to write elsewhere. `vercel pull` also downloads env vars along with project config.

## Running with Env Vars

`vercel env run` injects env vars into a subprocess without writing to a file. The `--` separator is required before the command:

```bash
vercel env run -- npm test
vercel env run -e preview -- next dev
```
