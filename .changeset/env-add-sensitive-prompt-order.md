---
'vercel': patch
---

Reorder `vercel env add` to ask whether a value is sensitive before collecting the value and selecting environments. Sensitive adds hide Development; teams with the sensitive env policy still prompt, and non-sensitive adds are limited to Development with clearer messaging.
