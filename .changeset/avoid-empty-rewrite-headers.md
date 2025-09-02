---
"@vercel/next": patch
---

Skip adding rewrite headers when the destination has no rewritten pathname or query (and when external origin is not allowed). This prevents generating an empty `rewrite.headers` object that fails schema validation and restores previous behavior for external or no-op rewrites.
