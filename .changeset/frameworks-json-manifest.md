---
'@vercel/frameworks': patch
---

Source the framework list from a committed `frameworks.json` manifest that is compiled into `dist/` at build time and interpreted into runtime `Framework` objects. Behavior is identical to the previous hand-written array; this is a no-op that establishes the pinned, hardcoded representation ahead of sourcing the manifest from the frameworks API.
