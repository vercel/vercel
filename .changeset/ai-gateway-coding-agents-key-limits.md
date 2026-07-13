---
'vercel': patch
---

`ai-gateway coding-agents setup` can now put **limits** on a key it creates: a spend cap (`--budget` with `--refresh-period` / `--include-byok`) and an expiry (`--expiration` `7d|30d|60d|90d|1y|none`). Interactively it asks whether to set each. The limits are sent only when creating a key; reusing one with `--key` is unaffected.
