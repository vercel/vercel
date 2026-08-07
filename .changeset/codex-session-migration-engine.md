---
'vercel': patch
---

Add the Codex Desktop session-migration engine: a deterministic, atomic copy of Codex rollout sessions into the Vercel AI Gateway provider (UUIDv5 destinations, no-clobber writes, originals never modified). This is the internal capability; it is wired into `ai-gateway coding-agents setup` in a follow-up.
