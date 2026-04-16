---
'vercel': patch
---

Add `supportedProduction` support to OpenAPI CLI routing.

When an OpenAPI operation has `x-vercel-cli.supportedProduction: true`, native CLI commands (e.g. `vercel projects ls`) are automatically replaced by their OpenAPI-driven counterparts. This is distinct from `supportedSubcommands`, which only exposes operations under `vercel api <tag> <subcommand>`.

Also adds `bodyArguments` support: OpenAPI POST/PATCH operations can declare request-body properties as ordered positional CLI arguments via `x-vercel-cli.bodyArguments`, enabling syntax like `vercel api domains add example.com` and `vercel api dns add example.com sub A 1.2.3.4`.
