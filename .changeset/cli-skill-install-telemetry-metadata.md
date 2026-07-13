---
'vercel': patch
---

Attribute marketplace agent-skill auto-installs in the skills CLI's install telemetry by passing `--metadata` (origin, flow, integration and product slugs) to the `npx skills add` invocation. Older skills versions (< 1.5.16) ignore the flag and install unchanged.
