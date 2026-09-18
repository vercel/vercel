---
'@vercel/python': patch
---

Fixed `vercel dev` failing every request to a Python function with `The result of "builder.build()" must not contain \`maxDuration\`` whenever `functions.maxDuration` or `functions.memory` was configured for it, by no longer applying those fields to the build output in dev mode and leaving them to be applied by the CLI, as it already expects.
