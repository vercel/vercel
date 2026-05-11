# Advanced Commands

## `vercel api` — Fallback for Missing CLI Commands

**Use `vercel api` when a CLI command doesn't exist for what you need.** Full access to the Vercel REST API with automatic authentication.

Use first-class CLI commands before `vercel api` whenever they expose the data or mutation you need.

Use `vercel api` when:

- The first-class CLI command does not exist.
- The first-class command omits fields needed for the answer.
- JSON output is needed for filtering or aggregation.
- Endpoint discovery is needed through `vercel api list`.

Keep calls narrow and shape large responses before presenting them. Use `--raw-field` instead of typed `--field` when the API expects a string value that looks like a boolean or number.

```bash
vercel api /v2/user                                    # GET current user
vercel api /v9/projects --scope my-team                # list projects
vercel api /v10/projects -X POST -F name=my-project    # create project
vercel api /v6/deployments --paginate                  # paginate all results
vercel api list                                        # list available endpoints
vercel api list --format json                          # list endpoints as JSON
vercel api "/v6/deployments?projectId=<project-id>&limit=10" --scope <team>
vercel api /v9/projects/<project>/env/<env-id> -X PATCH --raw-field value=false --scope <team>
```

Use `vercel api list` to discover available endpoints. `vercel api ls` is also accepted as an alias.

## Other Commands

- `vercel webhooks` — manage webhooks (create, ls, rm)
- `vercel mcp` — set up MCP integration for AI agents
- `vercel telemetry` — manage telemetry settings
- `vercel upgrade` — upgrade the CLI
