---
'vercel': patch
---

Added experimental services detection in CLI new project flow. When `VERCEL_USE_EXPERIMENTAL_SERVICES=1` is set and `experimentalServices` is configured in vercel.json, the CLI now displays detected services during the link/build new project setup instead of the standard framework detection output.
