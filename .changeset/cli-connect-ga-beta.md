---
'vercel': minor
---

Enable `vercel connect` by default and mark it as beta in `--help`. The command was previously gated behind the internal `FF_CONNEX_ENABLED` env var; it is now available out of the box and surfaces in `vercel --help` as `connect [cmd] Manage connectors [beta]`. The subcommand description also reads `Manage connectors (Beta)`.

Fix `vercel connect open` to link to the renamed `/~/connect/` dashboard route directly instead of relying on the legacy `/~/connex/` → `/~/connect/` 308 redirect.
