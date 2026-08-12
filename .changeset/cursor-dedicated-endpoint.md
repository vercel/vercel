---
'vercel': patch
---

The Cursor guidance in `ai-gateway coding-agents setup` points at the dedicated `/cursor/v1` gateway endpoint. Cursor's request format is rejected by the generic `/coding-agent/v1` surface; the dedicated endpoint normalizes it.
