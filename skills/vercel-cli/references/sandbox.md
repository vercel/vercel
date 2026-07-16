# Sandbox

`vercel sandbox` forwards to the Sandbox CLI for project-scoped sandbox environments. Run `vercel sandbox --help` for the current subcommand list; this file covers behavior help cannot tell you.

## Non-Obvious Semantics

- `sandbox run` creates a sandbox and runs a command in one step; `sandbox exec` runs a command in an existing sandbox. Use `--` to separate the sandbox command from arguments forwarded to the sandbox process (e.g. `vercel sandbox run -- node script.js`).
- `sandbox config` is a subcommand group; the only configurable surface today is `network-policy`.
- `sandbox snapshot` requires `--stop` because snapshotting stops the sandbox first. `sandbox snapshots` (plural) is a separate subcommand group that manages existing snapshots (`list`, `get`, `delete`).

## Auth Forwarding

Global Vercel flags `--scope` / `--team` / `--token` are forwarded to the Sandbox CLI. For automation, set `VERCEL_TOKEN`; the CLI maps it to `VERCEL_AUTH_TOKEN` for Sandbox.

Sandbox commands may create external compute or interactive sessions. Confirm intent before creating or connecting to a sandbox.
