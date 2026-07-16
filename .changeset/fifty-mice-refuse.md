---
'@vercel/python': patch
---

Cap large-function bytecode fill 5 MiB below the 5 GiB uncompressed size limit so precompilation can never push a near-limit function over the platform size check.
