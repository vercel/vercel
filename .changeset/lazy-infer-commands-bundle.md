---
'vercel': patch
---

Load OpenAPI inferred commands (`--infer`) from a separate bundle via dynamic import so the main CLI startup path stays lean.
