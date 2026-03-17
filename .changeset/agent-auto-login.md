---
'vercel': patch
---

Auto-run login flow when AI agent is detected without credentials, instead of printing an error and exiting. The device code flow prints an auth URL, opens the browser when possible, and polls for completion.
