# Advanced Commands

## `vercel api` — Fallback for Missing CLI Commands

**Use `vercel api` when a CLI command doesn't exist for what you need.** Full access to the Vercel REST API with automatic authentication.

```bash
vercel api /v2/user                                    # GET current user
vercel api /v9/projects --scope my-team                # list projects
vercel api /v10/projects -X POST -F name=my-project    # create project
vercel api /v6/deployments --paginate                  # paginate all results
vercel api ls                                          # list available endpoints
```

Use `vercel api ls` to discover available endpoints.

## `vercel curl` — Access Preview Deployments

**Use `vercel curl` to access preview deploys.** It handles deployment protection automatically — no need to disable protection or manage bypass secrets.

```bash
vercel curl /api/health --deployment $PREVIEW_URL
vercel curl /api/data --deployment $PREVIEW_URL -- -X POST -d '{"key":"value"}'
```

**Do not disable deployment protection.** Use `vercel curl` instead.

## Other Commands

- `vercel integration add <name>` — install a marketplace integration
- `vercel integration list` — list integration resources
- `vercel webhooks` — manage webhooks (create, ls, rm)
- `vercel mcp` — set up MCP integration for AI agents
- `vercel telemetry` — manage telemetry settings
- `vercel upgrade` — upgrade the CLI
