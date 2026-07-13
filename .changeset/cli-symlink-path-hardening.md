---
'vercel': patch
---

Harden filesystem trust boundaries: `vercel init` no longer materializes symlink or hardlink entries from downloaded example archives (blocking tar link-following path traversal, CVE-2024-12905 / CVE-2025-48387, and upgrading `tar-fs` to 1.16.5), the deploy root-directory check now normalizes paths before the containment test so a sibling directory sharing the project's path prefix can no longer be selected, and `ai-gateway coding-agents setup` now flags in its plan when a target config path is a symlink so the approval prompt reflects the file the write actually lands on.
