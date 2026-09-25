---
'vercel': patch
---

Add `vercel ai-gateway setup` as a shortcut for coding-agent setup, with a Conductor option that configures managed local Claude Code/Codex gateway routing, selects API key authentication, and enables Enterprise Data Privacy. Setup explicitly reports that Conductor's other harnesses and cloud workspaces are not restricted to the gateway.

If one of an agent's settings files fails validation, setup leaves its other settings files unchanged.
