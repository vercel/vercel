---
'@vercel/cli': patch
---

`vercel api` uses the same OpenAPI tag/operationId flow when the first argument matches an opted-in tag (otherwise the first argument is still an API path starting with `/`). `vercel openapi` remains as an alias for that mode.

`vercel openapi` / `vercel api` (tag mode) resolve OpenAPI path templates from positional arguments (after the operation name) and map `in: query` parameters to `--kebab-case` flags. Parameter behavior can be documented with `x-vercel-cli.kind` (`argument` | `option`) on each parameter.

List/describe tables no longer cap tag and operation column widths; the description column shows Args/Options lines derived from the OpenAPI path and query parameters.

`vercel openapi ls` (all tags) prints a lightweight tag | operation table. The same global listing applies to `vercel openapi`, `vercel openapi list`, and `vercel openapi --describe` (no tag). Tag-scoped views (`vercel openapi <tag>`, `vercel openapi ls <tag>`, `--describe`) use the full table with args and description. Omitting `<operationId>` matches `--describe` for that tag.

Single-operation `--describe` uses the same tag | operation | args | description row as tag-wide listings (plus response schema when present).

In a TTY, missing path positionals and required `--…` query flags for tag/operation invocations are prompted interactively (aligned with path-based `vercel api`).

Tag mode uses `x-vercel-cli.supportedSubcommands: true` in the OpenAPI document; `x-vercel-cli.supported: true` remains accepted as a legacy alias. `x-vercel-cli.supportedProduction` is reserved for future top-level CLI commands.

The CLI loads the published OpenAPI document from `https://openapi.vercel.sh/` (with an on-disk cache).

Tag-mode requests only append the current team’s `teamId` query param when the operation declares `teamId` or `slug` as query parameters in the OpenAPI document, avoiding 400s on endpoints that reject unsolicited scope params.
