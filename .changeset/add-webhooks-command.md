---
'vercel': minor
---

feat(cli): Add webhooks command for managing webhooks

Adds a new `webhooks` command to the Vercel CLI with the following subcommands:

- `webhooks ls` - List all webhooks with optional `--format json` output
- `webhooks get <id>` - Get details of a specific webhook with optional `--format json` output
- `webhooks create <url> --event <event>` - Create a new webhook with specified events
- `webhooks rm <id>` - Remove a webhook with `--yes` flag to skip confirmation

Webhook event types are fetched dynamically from the OpenAPI spec to stay in sync with the API.
