---
'vercel': patch
---

Deploy/redeploy output now labels the commit-specific deployment URL as `Visit` and prints a separate `Production`/`Preview` line with the project's publicly accessible domain (matching the dashboard), instead of showing the first auto-generated alias which may be gated by Deployment Protection.
