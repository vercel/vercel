---
"vercel": patch
---

[cli] Nest `integration-resource` under `integration resource` and add `integration resource connect`

The marketplace resource subcommands (`disconnect`, `remove`, `create-threshold`) are now discoverable under `vercel integration resource <sub>`. The standalone `vercel integration-resource` and `vc ir` forms still work as hidden aliases — no scripts or tests break.

Adds a new `vercel integration resource connect <resource> [project]` command (the inverse of `disconnect`). Accepts `--environment` (repeatable, defaults to all three), `--prefix` for env var namespacing, `--yes`, and `--format=json`. Defaults to the project linked in the current directory when `<project>` is omitted.

Tightens `disconnect` to error (exit 1) when the specified project is not connected to the resource, instead of exiting 0 with a "not found" message.

Both commands emit a structured `outputAgentError` payload with `reason: confirmation_required` and a `next: [{command}]` retry hint when run in non-interactive / agent mode without `--yes`. When `connect` fails because an env var with the same name already exists on the target project, the error names the conflicting variable and suggests `--prefix` or `vercel env rm` as remediation.
