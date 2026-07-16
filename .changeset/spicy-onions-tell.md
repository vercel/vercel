---
'@vercel/python': patch
---

Report the final bundle size (including compiled bytecode and runtime-install tooling) and the packing mode (`standard` | `runtime-install` | `hive`) on the `vc.builder.python.bundle` trace span. The source-only size is still recorded before size-limit enforcement so oversized builds that fail remain tagged.
