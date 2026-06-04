# Connectors

`vercel connect` manages connectors such as Slack apps. Vercel Connect is currently in beta, so behavior may change. Check `vercel connect --help` if a subcommand is unavailable.

## Common Commands

```bash
vercel connect create slack --name my-bot
vercel connect create slack --name my-bot --triggers
vercel connect update <connector-id-or-uid> --icon ./logo.png --background-color '#1A2B3C' --accent-color '#FF0066'
vercel connect list --format=json
vercel connect list --all-projects
vercel connect list --type slack
vercel connect list --search linear --limit 10
vercel connect attach <connector-id-or-uid> -e production -e preview --yes
vercel connect detach <connector-id-or-uid> --yes
vercel connect token <connector-id-or-uid> --format=json
vercel connect open <connector-id-or-uid>
vercel connect remove <connector-id-or-uid> --disconnect-all --yes
```

## `connect token` — Subject and Scopes

`--subject` selects whose token is returned. `--installation-id` targets a specific installation when the subject is `app`. `--scopes` is comma- or space-separated.

```bash
vercel connect token scl_abc123                                          # user token (default subject)
vercel connect token scl_abc123 --subject app                            # app token, default installation
vercel connect token scl_abc123 --subject app --installation-id inst_1   # app token, specific installation
vercel connect token scl_abc123 --scopes "chat:write,im:write"           # scoped token
vercel connect token scl_abc123 --yes                                    # open browser if auth/install needed
vercel connect token scl_abc123 --format=json                            # includes expiresAt, installationId
```

## `connect attach` — Trigger Destinations

Pass `--triggers` to register the project as a webhook trigger destination. Use `--trigger-branch` and `--trigger-path` to override defaults.

```bash
vercel connect attach scl_abc123 --triggers                                                # default branch + /{service}
vercel connect attach scl_abc123 --triggers --trigger-branch staging --trigger-path /slack
vercel connect attach scl_abc123 --project my-app --triggers                               # different project
```

A connector accepts at most 3 trigger destinations. Use `--project <name-or-id>` on `attach`/`detach` when targeting a project other than the currently linked one.

Connector IDs look like `scl_...`; UIDs look like `slack/my-bot`. Either works wherever an `id` argument is accepted.

Connector tokens and trigger URLs can grant access to third-party systems. Do not print or store them unless the user explicitly needs that output.
