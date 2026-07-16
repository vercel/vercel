# Connectors

`vercel connect` manages connectors such as Slack apps. Vercel Connect is currently in beta, so behavior may change. Run `vercel connect --help` and `vercel connect <subcommand> --help` for flags; this file covers behavior help cannot tell you.

Connector IDs look like `scl_...`; UIDs look like `slack/my-bot`. Either works wherever an `id` argument is accepted.

## `connect token` — Subject and Scopes

`--subject` selects whose token is returned: `user` is the default; `--subject app` returns the app token, with `--installation-id` targeting a specific installation when there is more than one. `--scopes` is comma- or space-separated. `--yes` allows the CLI to open a browser if auth or installation is needed. `--format=json` output includes `expiresAt` and `installationId`.

## `connect attach` — Trigger Destinations

Pass `--triggers` on `attach` to register the project as a webhook trigger destination; defaults are the project's default branch and path `/{service}`, overridable with `--trigger-branch` and `--trigger-path`.

A connector accepts at most 3 trigger destinations. Use `--project <name-or-id>` on `attach`/`detach` when targeting a project other than the currently linked one.

## Security

Connector tokens and trigger URLs can grant access to third-party systems. Do not print or store them unless the user explicitly needs that output.
