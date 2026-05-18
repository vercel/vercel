# Connectors

`vercel connect` manages connectors such as Slack apps. This command may be feature-gated; if unavailable, check `vercel connect --help` before falling back to dashboard or API paths.

## Common Commands

```bash
vercel connect create slack --name my-bot
vercel connect create slack --name my-bot --triggers
vercel connect list --format=json
vercel connect list --all-projects
vercel connect attach <connector-id-or-uid> -e production -e preview --yes
vercel connect token <connector-id-or-uid> --format=json
vercel connect open <connector-id-or-uid>
vercel connect remove <connector-id-or-uid> --disconnect-all --yes
```

Connector tokens and trigger URLs can grant access to third-party systems. Do not print or store them unless the user explicitly needs that output.

Use `--project <name-or-id>` with `attach` when targeting a project other than the currently linked one. Use connector IDs like `scl_...` or UIDs like `slack/my-bot` where accepted.
