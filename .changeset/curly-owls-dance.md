---
'@vercel/detect-agent': patch
---

Detect Cursor agent execution when `CURSOR_EXTENSION_HOST_ROLE=agent-exec` is set so tools launched from Cursor still report the `cursor-cli` agent when `CURSOR_AGENT` is not present.
