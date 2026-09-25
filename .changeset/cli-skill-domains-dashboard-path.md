---
---

Add a "Dashboard Path" section to the `vercel-cli` skill's domains reference. The reference was CLI-only, so agents consuming it (e.g. Vercel Agent in the dashboard side panel) answered "how do I add a domain I own?" with `vercel domains add ...` code blocks — instructions a dashboard user has nowhere to run. The new section documents the Settings → Domains flow and links the add-a-domain docs walkthrough so surface-appropriate guidance is available alongside the commands.
