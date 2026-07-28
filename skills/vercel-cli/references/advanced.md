# Advanced Commands

> Exact syntax: `vercel api --help`, `vercel webhooks --help`

## `vercel api`

Full access to the Vercel REST API with automatic authentication. Discover endpoints with `vercel api list`.

- Add `--raw` when a downstream parser should receive only the JSON response payload.
- Use `--raw-field` instead of typed `--field` when the API expects a string value that looks like a boolean or number.
- Do not parse `vercel api --generate=curl` output as JSON; it emits a curl command.
- DELETE requests prompt for confirmation; in non-interactive/agent mode they are refused unless `--dangerously-skip-permissions` is passed. Use that flag only for deletions the user explicitly approved.

```bash
vercel api "/v6/deployments?projectId=<project-id>&limit=10" --scope <team>
vercel api /v9/projects/<project>/env/<env-id> -X PATCH --raw-field value=false --scope <team>
```

## Webhooks

Prefer `vercel webhooks` over `vercel api` for webhook operations (create, list, remove).
