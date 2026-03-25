---
'vercel': patch
---

Improve agent plugin install flow: agents now receive structured JSON prompts for plugin installation instead of auto-approving silently. Preferences are persisted to avoid repeat prompts. On deploy, shows a non-blocking tip if the plugin is not installed.
