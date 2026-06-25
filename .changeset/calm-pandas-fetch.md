---
'vercel': patch
---

Use Node.js native fetch for the CLI API client and require Node.js 20 or newer, removing legacy URL parser deprecation warnings from standalone binaries while preserving proxy routing and local middleware behavior.
