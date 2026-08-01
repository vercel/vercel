---
'vercel': patch
---

Check whether a detected Git repository can actually be connected before asking about it during `vercel link`. When the Vercel GitHub App cannot reach the repository, or the account has no GitHub Login Connection, the prompt is skipped and the run ends with the specific step needed to connect it later. Connection errors now surface the fix-it link the API provides.
