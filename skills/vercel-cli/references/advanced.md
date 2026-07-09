# Advanced Commands

## `vercel api` — Fallback for Missing CLI Commands

**Use `vercel api` when a CLI command doesn't exist for what you need.** Full access to the Vercel REST API with automatic authentication.

Use first-class CLI commands before `vercel api` whenever they expose the data or mutation you need.

Use `vercel api` when:

- The first-class CLI command does not exist.
- The first-class command omits fields needed for the answer.
- JSON output is needed for filtering or aggregation.
- Endpoint discovery is needed through `vercel api list`.

Keep calls narrow and shape large responses before presenting them. Add `--raw` when a downstream parser should receive only the JSON response payload. Use `--raw-field` instead of typed `--field` when the API expects a string value that looks like a boolean or number.

```bash
vercel api /v2/user                                    # GET current user
vercel api /v9/projects --scope my-team                # list projects
vercel api /v10/projects -X POST -F name=my-project    # create project
vercel api /v6/deployments --paginate                  # paginate all results
vercel api list                                        # list available endpoints
vercel api list --format json                          # list endpoints as JSON
vercel api "/v6/deployments?projectId=<project-id>&limit=10" --scope <team>
vercel api "/v6/deployments?limit=10" --raw            # JSON payload
vercel api /v9/projects/<project>/env/<env-id> -X PATCH --raw-field value=false --scope <team>
```

Use `vercel api list` to discover available endpoints. `vercel api ls` is also accepted as an alias.

Do not parse `vercel api --generate=curl` output as JSON; it emits a curl command.

DELETE requests prompt for confirmation; in non-interactive/agent mode they are refused unless `--dangerously-skip-permissions` is passed. Use that flag only for deletions the user explicitly approved.

## `vercel traces` — Captured Request Traces

Fetch traces captured for a Vercel project. `get` is the default subcommand.

```bash
vercel traces get req_1234567890                                   # markdown summary
vercel traces req_1234567890                                       # equivalent (get is default)
vercel traces get req_1234567890 --json                            # raw trace JSON to stdout
vercel traces get req_1234567890 --scope my-team --project my-app  # specific team/project
vercel traces get req_1234567890 --open                            # open in Vercel Dashboard
vercel traces get req_1234567890 --open --view gantt               # specific dashboard view (timeline, tree, gantt)
```

`--view` is only valid alongside `--open`.

## `vercel oauth-apps` — Vercel Apps (OAuth)

Register Vercel Apps (OAuth client IDs) and manage team installations. Useful for building integrations that authenticate against a Vercel team.

```bash
vercel oauth-apps register --name "My App" --slug my-app --redirect-uri https://app.example.com/oauth/callback
vercel oauth-apps register --name "My App" --slug my-app --format json    # JSON output includes clientId
vercel oauth-apps install --client-id cl_abc --permission read:project --permission read:deployment
vercel oauth-apps install --client-id cl_abc --permission read:project --projects prj_a,prj_b   # scope to projects (or `*` for all)
vercel oauth-apps list-requests --format json                             # pending install requests
vercel oauth-apps dismiss cl_abc123 --yes                                 # dismiss a pending request
vercel oauth-apps remove inst_abc123 --yes                                # uninstall (aliases: rm, uninstall)
```

`register` issues a client ID. `install` (alias `add`) installs an app to the current team using that client ID. At least one `--permission` is required (the install errors with `Provide at least one --permission` otherwise); repeat `--permission` for each scope the app needs.

## Other Commands

- `vercel webhooks` — manage webhooks (create, ls, rm)
- `vercel mcp` — set up MCP integration for AI agents
- `vercel telemetry` — manage telemetry settings
- `vercel upgrade` — upgrade the CLI
