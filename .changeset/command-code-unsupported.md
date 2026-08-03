---
'vercel': patch
---

`vercel ai-gateway coding-agents setup --agent command-code` now explains why Command Code can't be configured (no external-provider mechanism; custom providers require a ProviderModule mod) instead of failing with a bare error. Unsupported-agent reasons also surface when they're the only agents selected.
