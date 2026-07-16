# Routing Rules

`vercel routes` manages project-level routing rules — match requests by path pattern and optional conditions (headers, cookies, query parameters, host), then rewrite, redirect, set a status, or modify headers and query parameters. Run `vercel routes --help` and `vercel routes <subcommand> --help` for flags and subcommands; this file covers behavior that help output cannot tell you.

Key behavior:

- Published routing rules take effect **immediately without a deployment** and **take precedence over routes defined in deployment configuration** (`vercel.json`, `next.config.js`, etc.).
- Rule names are unique within the project and identify rules in `edit`, `delete`, `enable`, `disable`, and `reorder`.
- Rules are evaluated in priority order (top to bottom); use `reorder` to control placement.
- All changes are **staged as drafts**: review with `vercel routes list --diff`, then `vercel routes publish` (or `discard-staging` to throw them away). Roll back a published mistake with `list-versions` + `restore <version-id>`.
- `routes add --ai` generates a rule from a natural language description; use flags or interactive mode for full control.

## Source Path Syntax

`--src-syntax` decision guide:

| Syntax | Example | When to use |
|--------|---------|-------------|
| `regex` | `^/api/(.*)$` | Full regex control. |
| `path-to-regexp` | `/api/:path*` | Express-style named params. More readable. |
| `equals` | `/about` | Exact string match. Simplest option. |

Defaults to `regex`. `path-to-regexp` and `equals` paths must start with `/`.

## Actions

Each rule has at most one primary action: `rewrite` (proxies to `--dest`, transparent to the client), `redirect` (sends the client to `--dest` with `--status` 301/302/307/308), or `set-status` (returns `--status`, no destination). A rule without a primary action can still set response headers or apply request transforms (request headers and query parameters).

## Condition Syntax

`--has` requires something to be present; `--missing` requires it absent. Types: `header`, `cookie`, `query`, and `host`. Repeatable, up to 16 per rule. Beyond the bare `type:key` existence form, values support operators:

```bash
--has "cookie:session"                          # existence check
--missing "header:Authorization"                # must be absent
--has "header:X-API-Key:eq=my-secret"           # exact match
--has "cookie:theme:contains=dark"              # value contains substring
--has "header:Accept:re=application/json.*"     # regex match
--missing "query:debug:eq=true"                 # must NOT have debug=true
--has "host:eq=example.com"                     # host takes no key, just a value
```
